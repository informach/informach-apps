import { type Database, db } from "@informach/db";
import { verifications } from "@informach/db/schema";
import type { SecondaryStorage } from "better-auth";
import { and, eq, like } from "drizzle-orm";

/**
 * Sessões que o Better Auth guarda no armazenamento secundário (Redis) de um app.
 *
 * Com `secondaryStorage` e sem `storeSessionInDatabase`, a sessão existe só ali:
 * `core.sessions` não a vê, e apagar linhas do banco não desconecta ninguém. O
 * Better Auth 1.7 usa duas chaves, já com o prefixo do app aplicado pelo
 * `redisStorage`:
 *
 * - `active-sessions-<userId>`: lista JSON de `{ token, expiresAt }`;
 * - `<token>`: JSON `{ session, user }` de cada sessão.
 *
 * Estas funções leem e encerram essas sessões por fora do app (o Bastidores
 * encerra as sessões de uma conta em todos os produtos). O token nunca sai daqui.
 * No fim, `revokeTrustedDevices` apaga os aparelhos confiados das duas etapas,
 * que deixariam a senha bastar mesmo depois de encerrar as sessões.
 */
export type SessionStore = Pick<SecondaryStorage, "get" | "set" | "delete">;

export type CachedSession = {
  createdAt: Date | null;
  updatedAt: Date | null;
  expiresAt: Date | null;
  userAgent: string | null;
};

type SessionReference = { token: string; expiresAt: number };

const activeSessionsKey = (userId: string) => `active-sessions-${userId}`;

function parseJson(raw: unknown): unknown {
  if (typeof raw !== "string") return raw ?? null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function asDate(value: unknown): Date | null {
  if (typeof value !== "string" && typeof value !== "number" && !(value instanceof Date))
    return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function references(store: SessionStore, userId: string): Promise<SessionReference[]> {
  const list = parseJson(await store.get(activeSessionsKey(userId)));
  if (!Array.isArray(list)) return [];
  return list.filter(
    (item): item is SessionReference =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as SessionReference).token === "string" &&
      typeof (item as SessionReference).expiresAt === "number",
  );
}

type CachedPayload = { session?: Record<string, unknown> } | null;

/**
 * Lê a sessão de uma referência ainda dentro do prazo. Referência vencida, ou
 * cujo registro já saiu do armazenamento, não é sessão valendo.
 */
async function liveSession(
  store: SessionStore,
  reference: SessionReference,
  now: number,
): Promise<Record<string, unknown> | null> {
  if (reference.expiresAt <= now) return null;
  const cached = parseJson(await store.get(reference.token)) as CachedPayload;
  return cached?.session ?? null;
}

/** Sessões ainda válidas da conta neste armazenamento, sem token nem IP. */
export async function listCachedSessions(
  store: SessionStore,
  userId: string,
  now = Date.now(),
): Promise<CachedSession[]> {
  const sessions: CachedSession[] = [];
  for (const reference of await references(store, userId)) {
    const session = await liveSession(store, reference, now);
    if (!session) continue;
    const { createdAt, updatedAt, expiresAt, userAgent } = session;
    sessions.push({
      createdAt: asDate(createdAt),
      updatedAt: asDate(updatedAt),
      expiresAt: asDate(expiresAt) ?? new Date(reference.expiresAt),
      userAgent: typeof userAgent === "string" && userAgent ? userAgent : null,
    });
  }
  return sessions;
}

/**
 * Encerra todas as sessões da conta neste armazenamento: apaga cada sessão e a
 * lista, inclusive as referências vencidas. Devolve quantas estavam valendo,
 * pelo mesmo critério de `listCachedSessions`, para a tela não contar como
 * encerrada uma sessão que já tinha acabado. O próximo pedido da pessoa no app
 * não encontra a sessão e ela precisa entrar de novo.
 */
export async function revokeCachedSessions(
  store: SessionStore,
  userId: string,
  now = Date.now(),
): Promise<number> {
  let live = 0;
  for (const reference of await references(store, userId)) {
    if (await liveSession(store, reference, now)) live++;
    await store.delete(reference.token);
  }
  await store.delete(activeSessionsKey(userId));
  return live;
}

/**
 * Prefixo dos registros de "confiar neste aparelho" do plugin de duas etapas do
 * Better Auth 1.7 em `core.verifications`: `identifier` é
 * `trust-device-<aleatório>` e `value` é o id da conta. Enquanto um registro
 * desses vale (30 dias), o cookie do aparelho dispensa o código e a senha basta.
 */
export const TRUST_DEVICE_IDENTIFIER_PREFIX = "trust-device-";

/** Quem apaga: o cliente do banco ou uma transação aberta por quem chama. */
export type TrustedDeviceWriter = Pick<Database, "delete">;

/**
 * Apaga todos os aparelhos confiados da conta, para que a próxima entrada peça
 * o código de novo em qualquer app com duas etapas. Vale para as verificações
 * guardadas no Postgres; um app que guarde verificações no Redis
 * (`secondaryStorage`) precisaria de outro caminho, e hoje nenhum app com duas
 * etapas faz isso. Devolve quantos registros saíram.
 */
export async function revokeTrustedDevices(
  userId: string,
  writer: TrustedDeviceWriter = db,
): Promise<number> {
  const removed = await writer
    .delete(verifications)
    .where(
      and(
        eq(verifications.value, userId),
        like(verifications.identifier, `${TRUST_DEVICE_IDENTIFIER_PREFIX}%`),
      ),
    )
    .returning({ id: verifications.id });
  return removed.length;
}
