import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { and, db, desc, eq, gt, inArray, isNotNull, isNull, lt, or, sql } from "@informach/db";
import {
  estrelaChildren as children,
  estrelaPairingCodes as codes,
  estrelaDevices as devices,
  estrelaDeviceChildren as grants,
  estrelaAccessLimits as limits,
  users,
} from "@informach/db/schema";
import { env } from "@/lib/env";
import { assertAllowed } from "@/lib/errors";
import { lockOwner } from "../familia/repository";
import {
  CODE_LIFETIME_MS,
  codeSchema,
  DEVICE_LIFETIME_MS,
  DEVICE_RENEW_MS,
  deviceSchema,
  MAX_DEVICES,
} from "./policy";

const publicFields = {
  id: devices.id,
  userId: devices.userId,
  label: devices.label,
  expiresAt: devices.expiresAt,
  connectedAt: devices.connectedAt,
  lastSeenAt: devices.lastSeenAt,
  revokedAt: devices.revokedAt,
  createdAt: devices.createdAt,
};
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export const privateHash = (purpose: string, value: string) =>
  createHmac("sha256", env.BETTER_AUTH_SECRET).update(`${purpose}:${value}`).digest("hex");
const codeAlphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function newCode() {
  // Rejection sampling avoids modulo bias with the deliberately readable alphabet.
  let code = "";
  while (code.length < 10) {
    for (const byte of randomBytes(16)) {
      if (byte < Math.floor(256 / codeAlphabet.length) * codeAlphabet.length && code.length < 10)
        code += codeAlphabet[byte % codeAlphabet.length];
    }
  }
  return code;
}

/**
 * Prepara um aparelho para as crianças escolhidas. Com `pending`, ele só vale
 * depois que alguém digitar o código no aparelho (10 minutos); sem, o próprio
 * aparelho em que o adulto está vira o da criança.
 */
async function issueDevice(ownerId: string, raw: unknown, pending: boolean) {
  const input = deviceSchema.parse(raw);
  const now = new Date();
  const token = randomBytes(32).toString("hex");
  const code = newCode();
  return db.transaction(async (tx) => {
    await lockOwner(tx, ownerId);
    const owned = await tx
      .select({ id: children.id })
      .from(children)
      .where(and(eq(children.userId, ownerId), inArray(children.id, input.childIds)));
    assertAllowed(
      owned.length === input.childIds.length,
      "CHILD",
      "Escolha somente crianças da sua família.",
    );
    const active = await tx
      .select({ id: devices.id })
      .from(devices)
      .where(
        and(eq(devices.userId, ownerId), isNull(devices.revokedAt), gt(devices.expiresAt, now)),
      );
    assertAllowed(
      active.length < MAX_DEVICES,
      "DEVICES",
      "Há dez aparelhos conectados. Desconecte um deles para conectar outro.",
    );
    const [device] = await tx
      .insert(devices)
      .values({
        userId: ownerId,
        tokenHash: tokenHash(token),
        label: input.label,
        expiresAt: new Date(now.getTime() + (pending ? CODE_LIFETIME_MS : DEVICE_LIFETIME_MS)),
        connectedAt: pending ? null : now,
        lastSeenAt: pending ? null : now,
      })
      .returning(publicFields);
    assertAllowed(device, "DEVICE", "Não foi possível preparar o aparelho.");
    await tx
      .insert(grants)
      .values(input.childIds.map((childId) => ({ deviceId: device.id, childId })));
    if (pending)
      await tx.insert(codes).values({
        deviceId: device.id,
        codeHash: privateHash("code", code),
        expiresAt: device.expiresAt,
      });
    return {
      device,
      token,
      code: `${code.slice(0, 5)}-${code.slice(5)}`,
      childIds: input.childIds,
    };
  });
}

export async function createDevice(ownerId: string, input: unknown) {
  const { device, token, childIds } = await issueDevice(ownerId, input, false);
  return { device, token, childIds };
}

export async function createPairingCode(ownerId: string, input: unknown) {
  const { device, code } = await issueDevice(ownerId, input, true);
  return { device, code };
}

/** Aparelho válido pelo token do cookie, com as crianças dele que ainda existem. */
export async function readDevice(token: string) {
  if (!/^[a-f\d]{64}$/.test(token)) return null;
  const now = new Date();
  const [device] = await db
    .select(publicFields)
    .from(devices)
    .innerJoin(users, eq(devices.userId, users.id))
    .where(
      and(
        eq(devices.tokenHash, tokenHash(token)),
        isNull(devices.revokedAt),
        isNotNull(devices.connectedAt),
        gt(devices.expiresAt, now),
        eq(users.emailVerified, true),
        or(
          eq(users.banned, false),
          and(isNotNull(users.banExpiresAt), lt(users.banExpiresAt, now)),
        ),
      ),
    );
  if (!device) return null;
  const rows = await db
    .select({ id: grants.childId })
    .from(grants)
    .innerJoin(children, eq(grants.childId, children.id))
    .where(and(eq(grants.deviceId, device.id), eq(children.userId, device.userId)))
    .orderBy(children.position, children.createdAt, children.id);
  if (!rows.length) return null;
  return { device, childIds: rows.map((row) => row.id) };
}

/**
 * Sinal de vida do aparelho: marca que está ligado (para o texto dos alertas)
 * e renova os 30 dias, no máximo uma vez por hora.
 */
export async function touchDevice(deviceId: string, now = new Date()) {
  const [row] = await db
    .update(devices)
    .set({
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + DEVICE_LIFETIME_MS),
    })
    .where(
      and(
        eq(devices.id, deviceId),
        isNull(devices.revokedAt),
        or(
          isNull(devices.lastSeenAt),
          lt(devices.lastSeenAt, new Date(now.getTime() - DEVICE_RENEW_MS)),
        ),
      ),
    )
    .returning({ expiresAt: devices.expiresAt });
  return row?.expiresAt ?? null;
}

/** Marca o sinal de vida sem renovar (chamado a cada poucos minutos). */
export async function heartbeat(deviceId: string, now = new Date()) {
  await db
    .update(devices)
    .set({ lastSeenAt: now })
    .where(and(eq(devices.id, deviceId), isNull(devices.revokedAt)));
}

export async function listDevices(ownerId: string) {
  const rows = await db
    .select(publicFields)
    .from(devices)
    .where(and(eq(devices.userId, ownerId), isNotNull(devices.connectedAt)))
    .orderBy(
      sql`(${devices.revokedAt} is null and ${devices.expiresAt} > now()) desc`,
      desc(devices.createdAt),
    )
    .limit(30);
  if (!rows.length) return [];
  const all = await db
    .select({ deviceId: grants.deviceId, childId: grants.childId })
    .from(grants)
    .where(
      inArray(
        grants.deviceId,
        rows.map((row) => row.id),
      ),
    );
  return rows.map((row) => ({
    ...row,
    childIds: all.filter((g) => g.deviceId === row.id).map((g) => g.childId),
  }));
}

/** Aparelhos ligados e válidos de cada criança (para os alertas). */
export async function activeDeviceChildren(childIds: string[], now = new Date()) {
  if (!childIds.length) return [];
  return db
    .select({ childId: grants.childId, lastSeenAt: devices.lastSeenAt })
    .from(grants)
    .innerJoin(devices, eq(grants.deviceId, devices.id))
    .where(
      and(
        inArray(grants.childId, childIds),
        isNull(devices.revokedAt),
        isNotNull(devices.connectedAt),
        gt(devices.expiresAt, now),
      ),
    );
}

export async function revokeDevice(ownerId: string, id: string) {
  const rows = await db
    .update(devices)
    .set({ revokedAt: new Date() })
    .where(and(eq(devices.id, id), eq(devices.userId, ownerId), isNull(devices.revokedAt)))
    .returning({ id: devices.id });
  return rows.length > 0;
}

/** O próprio aparelho encerra a conexão (sair do modo criança). */
export async function endDevice(token: string) {
  if (!/^[a-f\d]{64}$/.test(token)) return;
  await db
    .update(devices)
    .set({ revokedAt: new Date() })
    .where(and(eq(devices.tokenHash, tokenHash(token)), isNull(devices.revokedAt)));
}

/**
 * Janela de tentativas, guardada no banco para valer entre instâncias.
 * A chave já chega como HMAC: nenhum endereço ou id cru fica guardado.
 */
export async function consumeAttempt(
  key: string,
  max: number,
  windowMs: number,
  message: string,
  now = new Date(),
) {
  const cutoff = new Date(now.getTime() - windowMs);
  const [row] = await db
    .insert(limits)
    .values({ key, startedAt: now, attempts: 1 })
    .onConflictDoUpdate({
      target: limits.key,
      set: {
        startedAt: sql`case when ${limits.startedAt} <= ${cutoff.toISOString()} then ${now.toISOString()}::timestamptz else ${limits.startedAt} end`,
        attempts: sql`case when ${limits.startedAt} <= ${cutoff.toISOString()} then 1 else least(${limits.attempts} + 1, ${max + 1}) end`,
      },
    })
    .returning({ attempts: limits.attempts, startedAt: limits.startedAt });
  assertAllowed(row && row.attempts <= max, "RATE_LIMIT", message);
  return row;
}

/** Zera a janela (PIN certo). */
export async function clearAttempts(key: string) {
  await db.delete(limits).where(eq(limits.key, key));
}

export async function redeemPairingCode(raw: unknown) {
  const parsed = codeSchema.safeParse(raw);
  assertAllowed(
    parsed.success,
    "CODE",
    "Confira o código. Ele pode estar incorreto, ter expirado ou já ter sido usado.",
  );
  const now = new Date();
  const token = randomBytes(32).toString("hex");
  return db.transaction(async (tx) => {
    // Lock the code row: only one concurrent request can consume it.
    const [code] = await tx
      .select()
      .from(codes)
      .where(
        and(
          eq(codes.codeHash, privateHash("code", parsed.data)),
          isNull(codes.consumedAt),
          gt(codes.expiresAt, now),
        ),
      )
      .for("update");
    assertAllowed(
      code,
      "CODE",
      "Confira o código. Ele pode estar incorreto, ter expirado ou já ter sido usado.",
    );
    const [device] = await tx
      .select(publicFields)
      .from(devices)
      .where(
        and(eq(devices.id, code.deviceId), isNull(devices.revokedAt), gt(devices.expiresAt, now)),
      )
      .for("update");
    assertAllowed(device, "CODE", "Este código não vale mais. Peça um novo aos pais.");
    const kids = await tx
      .select({ id: grants.childId })
      .from(grants)
      .innerJoin(children, eq(grants.childId, children.id))
      .where(and(eq(grants.deviceId, device.id), eq(children.userId, device.userId)));
    assertAllowed(kids.length, "CODE", "Este código não tem criança. Peça um novo aos pais.");
    const [connected] = await tx
      .update(devices)
      .set({
        tokenHash: tokenHash(token),
        connectedAt: now,
        lastSeenAt: now,
        expiresAt: new Date(now.getTime() + DEVICE_LIFETIME_MS),
      })
      .where(eq(devices.id, device.id))
      .returning(publicFields);
    assertAllowed(connected, "CODE", "Não foi possível conectar este aparelho.");
    await tx.update(codes).set({ consumedAt: now }).where(eq(codes.id, code.id));
    return { device: connected, token, childIds: kids.map((k) => k.id) };
  });
}

/** Credenciais operacionais não têm motivo para ficar guardadas. */
export async function cleanupDeviceAccess() {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60_000);
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60_000);
  await db.delete(limits).where(lt(limits.startedAt, dayAgo));
  await db.delete(codes).where(lt(codes.expiresAt, dayAgo));
  await db
    .delete(devices)
    .where(or(lt(devices.expiresAt, monthAgo), lt(devices.revokedAt, monthAgo)));
}
