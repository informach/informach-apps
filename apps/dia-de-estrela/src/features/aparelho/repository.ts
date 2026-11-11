import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import {
  currentWebParticipationCondition,
  lockActiveWebParticipation,
} from "@informach/auth/web-participation";
import { and, db, desc, eq, gt, inArray, isNotNull, isNull, lt, or, sql } from "@informach/db";
import {
  estrelaChildren as children,
  estrelaPairingCodes as codes,
  estrelaDevices as devices,
  estrelaFamilies as families,
  familyGroups,
  estrelaDeviceChildren as grants,
  estrelaAccessLimits as limits,
} from "@informach/db/schema";
import type { FamilyReader, FamilyTransaction } from "@informach/family";
import { lockFamilyMembership } from "@informach/family/context";
import { captureProfileDelegations } from "@informach/family/delegation";
import { env } from "@/lib/env";
import { assertAllowed } from "@/lib/errors";
import type { AdultAuthority, EstrelaAuthority } from "../familia/authority";
import { childAccessCondition, deviceChildCondition, lockChildAccess } from "../familia/scope";
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
  familyGroupId: devices.familyGroupId,
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
  let code = "";
  while (code.length < 10)
    for (const byte of randomBytes(16)) {
      if (byte < Math.floor(256 / codeAlphabet.length) * codeAlphabet.length && code.length < 10)
        code += codeAlphabet[byte % codeAlphabet.length];
    }
  return code;
}
export type DeviceReference = { deviceId: string; userId: string; familyGroupId: string };
async function validChildren(
  reader: FamilyReader,
  device: { id: string; userId: string },
  connected = true,
) {
  return reader
    .select({ id: children.id })
    .from(children)
    .where(deviceChildCondition(device.userId, sql`${device.id}::uuid`, children.id, connected))
    .orderBy(children.position, children.createdAt, children.id);
}
async function issueDevice(actor: AdultAuthority, raw: unknown, pending: boolean) {
  const input = deviceSchema.parse(raw);
  assertAllowed(actor.kind === "adult", "AUTH", "Entre com sua conta para conectar um aparelho.");
  const token = randomBytes(32).toString("hex");
  const code = newCode();
  return db.transaction(async (tx) => {
    await lockFamilyMembership(tx, actor.userId, actor.familyGroupId);
    await lockChildAccess(tx, actor, input.childIds, "write");
    const webParticipationRevision = await lockActiveWebParticipation(tx, actor.userId);
    const selected = await tx
      .select({ id: children.id, activationId: children.familyProfileId })
      .from(children)
      .where(inArray(children.id, input.childIds));
    const profileIds = selected.flatMap((c) => (c.activationId ? [c.activationId] : []));
    assertAllowed(
      profileIds.length === input.childIds.length,
      "CHILD",
      "Escolha crianças disponíveis.",
    );
    const claims = await captureProfileDelegations(
      tx,
      actor.userId,
      "dia-de-estrela",
      actor.familyGroupId,
      profileIds,
    );
    const now = new Date();
    const active = await tx
      .select({ id: devices.id })
      .from(devices)
      .where(
        and(
          eq(devices.familyGroupId, actor.familyGroupId),
          isNull(devices.revokedAt),
          gt(devices.expiresAt, now),
          currentWebParticipationCondition(devices.userId, devices.webParticipationRevision),
        ),
      );
    assertAllowed(
      active.length < MAX_DEVICES,
      "DEVICES",
      "Há dez aparelhos conectados. Desconecte um deles para conectar outro.",
    );
    const [device] = await tx
      .insert(devices)
      .values({
        userId: actor.userId,
        familyGroupId: actor.familyGroupId,
        tokenHash: tokenHash(token),
        webParticipationRevision,
        label: input.label,
        expiresAt: new Date(now.getTime() + (pending ? CODE_LIFETIME_MS : DEVICE_LIFETIME_MS)),
        connectedAt: pending ? null : now,
        lastSeenAt: pending ? null : now,
      })
      .returning(publicFields);
    assertAllowed(device, "DEVICE", "Não foi possível preparar o aparelho.");
    await tx.insert(grants).values(
      selected.map((child) => {
        const claim = claims.find((c) => c.profileId === child.activationId);
        assertAllowed(claim, "CHILD", "Permissão indisponível.");
        return {
          deviceId: device.id,
          childId: child.id,
          delegationKey: claim.delegationKey,
          readGrantId: claim.readGrantId,
          writeGrantId: claim.writeGrantId,
        };
      }),
    );
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
export async function createDevice(actor: AdultAuthority, input: unknown) {
  const { device, token, childIds } = await issueDevice(actor, input, false);
  return { device, token, childIds };
}
export async function createPairingCode(actor: AdultAuthority, input: unknown) {
  const { device, code } = await issueDevice(actor, input, true);
  return { device, code };
}
export async function readDevice(token: string) {
  if (!/^[a-f\d]{64}$/.test(token)) return null;
  const [device] = await db
    .select(publicFields)
    .from(devices)
    .where(eq(devices.tokenHash, tokenHash(token)));
  if (!device?.familyGroupId) return null;
  const kids = await validChildren(db, device);
  return kids.length
    ? {
        device: { ...device, familyGroupId: device.familyGroupId },
        childIds: kids.map((c) => c.id),
      }
    : null;
}
async function lockDevice(tx: FamilyTransaction, ref: DeviceReference) {
  await lockFamilyMembership(tx, ref.userId, ref.familyGroupId);
  const [device] = await tx
    .select(publicFields)
    .from(devices)
    .where(
      and(
        eq(devices.id, ref.deviceId),
        eq(devices.familyGroupId, ref.familyGroupId),
        eq(devices.userId, ref.userId),
      ),
    )
    .for("update");
  assertAllowed(device, "DEVICE", "A conexão deste aparelho foi encerrada.");
  const kids = await validChildren(tx, device);
  assertAllowed(kids.length, "DEVICE", "A conexão deste aparelho foi encerrada.");
  return device;
}
/** Renewal requires current delegation after the group/device locks. Expired devices never revive. */
export async function touchDevice(ref: DeviceReference) {
  return db.transaction(async (tx) => {
    const device = await lockDevice(tx, ref);
    const now = new Date();
    // Heartbeats also update lastSeenAt; renew based on expiry, not the heartbeat clock.
    if (device.expiresAt.getTime() > now.getTime() + DEVICE_LIFETIME_MS - DEVICE_RENEW_MS)
      return null;
    const expiresAt = new Date(now.getTime() + DEVICE_LIFETIME_MS);
    await tx.update(devices).set({ lastSeenAt: now, expiresAt }).where(eq(devices.id, device.id));
    return expiresAt;
  });
}
export async function heartbeat(ref: DeviceReference) {
  return db.transaction(async (tx) => {
    const device = await lockDevice(tx, ref);
    await tx.update(devices).set({ lastSeenAt: new Date() }).where(eq(devices.id, device.id));
  });
}
export async function listDevices(actor: AdultAuthority) {
  return db.transaction(async (tx) => {
    const member = await lockFamilyMembership(tx, actor.userId, actor.familyGroupId);
    const rows = await tx
      .select({
        ...publicFields,
        currentParticipation: currentWebParticipationCondition(
          devices.userId,
          devices.webParticipationRevision,
        ).mapWith(Boolean),
      })
      .from(devices)
      .where(
        and(
          eq(devices.familyGroupId, actor.familyGroupId),
          member.role === "administrator" ? undefined : eq(devices.userId, actor.userId),
          isNotNull(devices.connectedAt),
        ),
      )
      .orderBy(desc(devices.createdAt))
      .limit(30);
    if (!rows.length) return [];
    const visible = await tx
      .select({ deviceId: grants.deviceId, childId: grants.childId })
      .from(grants)
      .where(
        and(
          inArray(
            grants.deviceId,
            rows.map((r) => r.id),
          ),
          childAccessCondition(actor, grants.childId),
        ),
      );
    return rows.map((row) => ({
      ...row,
      childIds: visible.filter((g) => g.deviceId === row.id).map((g) => g.childId),
    }));
  });
}
export async function activeDeviceChildren(actor: EstrelaAuthority, childIds: string[]) {
  if (!childIds.length) return [];
  return db
    .select({ childId: grants.childId, lastSeenAt: devices.lastSeenAt })
    .from(grants)
    .innerJoin(devices, eq(grants.deviceId, devices.id))
    .where(
      and(
        inArray(grants.childId, childIds),
        childAccessCondition(actor, grants.childId),
        deviceChildCondition(devices.userId, devices.id, grants.childId),
      ),
    );
}
export async function revokeDevice(actor: AdultAuthority, id: string) {
  return db.transaction(async (tx) => {
    const member = await lockFamilyMembership(tx, actor.userId, actor.familyGroupId);
    const rows = await tx
      .update(devices)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(devices.id, id),
          eq(devices.familyGroupId, actor.familyGroupId),
          member.role === "administrator" ? undefined : eq(devices.userId, actor.userId),
          isNull(devices.revokedAt),
        ),
      )
      .returning({ id: devices.id });
    return rows.length > 0;
  });
}
/** Possession may revoke even after issuer membership/grants expire; no domain read is allowed. */
export async function endDevice(token: string) {
  if (!/^[a-f\d]{64}$/.test(token)) return;
  return db.transaction(async (tx) => {
    const [device] = await tx
      .select({ id: devices.id, groupId: devices.familyGroupId })
      .from(devices)
      .where(eq(devices.tokenHash, tokenHash(token)));
    if (!device?.groupId) return;
    await tx
      .select({ id: familyGroups.id })
      .from(familyGroups)
      .where(eq(familyGroups.id, device.groupId))
      .for("update");
    await tx
      .update(devices)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(devices.id, device.id),
          eq(devices.tokenHash, tokenHash(token)),
          isNull(devices.revokedAt),
        ),
      );
  });
}
/** Internal challenge only. Must never enter a page, export or client component. */
export async function getPinChallenge(ref: DeviceReference) {
  return db.transaction(async (tx) => {
    await lockDevice(tx, ref);
    const [row] = await tx
      .select({ pinHash: families.pinHash, pinGeneration: families.pinGeneration })
      .from(families)
      .where(eq(families.familyGroupId, ref.familyGroupId));
    return row ?? null;
  });
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
  const hash = privateHash("code", parsed.data);
  const token = randomBytes(32).toString("hex");
  return db.transaction(async (tx) => {
    const [observed] = await tx
      .select({ id: devices.id, userId: devices.userId, familyGroupId: devices.familyGroupId })
      .from(codes)
      .innerJoin(devices, eq(devices.id, codes.deviceId))
      .where(eq(codes.codeHash, hash));
    assertAllowed(
      observed?.familyGroupId,
      "CODE",
      "Este código não vale mais. Peça um novo aos pais.",
    );
    await lockFamilyMembership(tx, observed.userId, observed.familyGroupId);
    const [device] = await tx
      .select(publicFields)
      .from(devices)
      .where(eq(devices.id, observed.id))
      .for("update");
    const [code] = await tx
      .select()
      .from(codes)
      .where(
        and(
          eq(codes.codeHash, hash),
          eq(codes.deviceId, observed.id),
          isNull(codes.consumedAt),
          sql`${codes.expiresAt} > statement_timestamp()`,
        ),
      )
      .for("update");
    assertAllowed(device && code, "CODE", "Este código não vale mais. Peça um novo aos pais.");
    const kids = await validChildren(tx, device, false);
    assertAllowed(
      kids.length,
      "CODE",
      "Este código não tem crianças disponíveis. Peça um novo aos pais.",
    );
    const now = new Date();
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
    return { device: connected, token, childIds: kids.map((c) => c.id) };
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
