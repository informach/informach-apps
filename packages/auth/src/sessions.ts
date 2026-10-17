import type { SecondaryStorage } from "better-auth";

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

/** Sessões ainda válidas da conta neste armazenamento, sem token nem IP. */
export async function listCachedSessions(
  store: SessionStore,
  userId: string,
  now = Date.now(),
): Promise<CachedSession[]> {
  const sessions: CachedSession[] = [];
  for (const reference of await references(store, userId)) {
    if (reference.expiresAt <= now) continue;
    const cached = parseJson(await store.get(reference.token)) as {
      session?: Record<string, unknown>;
    } | null;
    if (!cached?.session) continue;
    const { createdAt, updatedAt, expiresAt, userAgent } = cached.session;
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
 * lista. Devolve quantas sessões foram apagadas. O próximo pedido da pessoa no
 * app não encontra a sessão e ela precisa entrar de novo.
 */
export async function revokeCachedSessions(store: SessionStore, userId: string): Promise<number> {
  const list = await references(store, userId);
  for (const { token } of list) await store.delete(token);
  await store.delete(activeSessionsKey(userId));
  return list.length;
}
