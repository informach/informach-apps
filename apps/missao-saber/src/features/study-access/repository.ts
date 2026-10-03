import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { and, db, desc, eq, gt, inArray, isNotNull, isNull, lt, or, sql } from "@informach/db";
import {
  missaoStudyCodes as codes,
  missaoStudyDevices as devices,
  missaoStudyDeviceProfiles as grants,
  missaoStudyAccessLimits as limits,
  missaoProfiles,
  users,
} from "@informach/db/schema";
import { env } from "@/lib/env";
import { assertAllowed } from "@/lib/errors";
import { lockOwner } from "../learning/repository";
import {
  CODE_ATTEMPTS,
  CODE_LIFETIME_MS,
  CODE_WINDOW_MS,
  studyCodeSchema,
  studyDeviceSchema,
  studyLifetimeMs,
} from "./policy";

const publicFields = {
  id: devices.id,
  userId: devices.userId,
  label: devices.label,
  remember: devices.remember,
  expiresAt: devices.expiresAt,
  connectedAt: devices.connectedAt,
  revokedAt: devices.revokedAt,
  createdAt: devices.createdAt,
};
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const privateHash = (purpose: string, value: string) =>
  createHmac("sha256", env.BETTER_AUTH_SECRET).update(`${purpose}:${value}`).digest("hex");
const codeAlphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

async function issueDevice(userId: string, raw: unknown, pending: boolean) {
  const input = studyDeviceSchema.parse(raw);
  const now = new Date();
  const token = randomBytes(32).toString("hex");
  // Rejection sampling avoids modulo bias with the deliberately readable alphabet.
  let code = "";
  while (code.length < 10) {
    for (const byte of randomBytes(16)) {
      if (byte < Math.floor(256 / codeAlphabet.length) * codeAlphabet.length && code.length < 10)
        code += codeAlphabet[byte % codeAlphabet.length];
    }
  }
  return db.transaction(async (tx) => {
    await lockOwner(tx, userId);
    const owned = await tx
      .select({ id: missaoProfiles.id })
      .from(missaoProfiles)
      .where(and(eq(missaoProfiles.userId, userId), inArray(missaoProfiles.id, input.profileIds)));
    assertAllowed(
      owned.length === input.profileIds.length,
      "PROFILE",
      "Escolha somente estudantes da sua família.",
    );
    const active = await tx
      .select({ id: devices.id })
      .from(devices)
      .where(
        and(eq(devices.userId, userId), isNull(devices.revokedAt), gt(devices.expiresAt, now)),
      );
    assertAllowed(
      active.length < 10,
      "DEVICES",
      "Há dez conexões ativas. Encerre uma delas para conectar outro aparelho.",
    );
    const [device] = await tx
      .insert(devices)
      .values({
        userId,
        tokenHash: tokenHash(token),
        label: input.label,
        remember: input.remember,
        expiresAt: new Date(
          now.getTime() + (pending ? CODE_LIFETIME_MS : studyLifetimeMs(input.remember)),
        ),
        connectedAt: pending ? null : now,
      })
      .returning(publicFields);
    assertAllowed(device, "DEVICE", "Não foi possível preparar o estudo.");
    await tx
      .insert(grants)
      .values(input.profileIds.map((profileId) => ({ deviceId: device.id, profileId })));
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
      profileIds: input.profileIds,
    };
  });
}

export async function createStudyDevice(userId: string, input: unknown) {
  const { device, token, profileIds } = await issueDevice(userId, input, false);
  return { device, token, profileIds };
}

export async function createStudyCode(userId: string, input: unknown) {
  const { device, code } = await issueDevice(userId, input, true);
  return { device, code };
}

export async function readStudyDevice(token: string) {
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
  const profiles = await db
    .select({ id: grants.profileId })
    .from(grants)
    .innerJoin(missaoProfiles, eq(grants.profileId, missaoProfiles.id))
    .where(and(eq(grants.deviceId, device.id), eq(missaoProfiles.userId, device.userId)))
    .orderBy(missaoProfiles.createdAt, missaoProfiles.id);
  if (!profiles.length) return null;
  return { device, profileIds: profiles.map((row) => row.id) };
}

export async function listStudyDevices(userId: string) {
  const rows = await db
    .select(publicFields)
    .from(devices)
    .where(eq(devices.userId, userId))
    .orderBy(
      sql`(${devices.revokedAt} is null and ${devices.expiresAt} > now()) desc`,
      desc(devices.createdAt),
    )
    .limit(30);
  if (!rows.length) return [];
  const profiles = await db
    .select({ deviceId: grants.deviceId, profileId: grants.profileId })
    .from(grants)
    .where(
      inArray(
        grants.deviceId,
        rows.map((row) => row.id),
      ),
    );
  return rows.map((row) => ({
    ...row,
    profileIds: profiles
      .filter((grant) => grant.deviceId === row.id)
      .map((grant) => grant.profileId),
  }));
}

export async function revokeStudyDevice(userId: string, id: string) {
  const rows = await db
    .update(devices)
    .set({ revokedAt: new Date() })
    .where(and(eq(devices.id, id), eq(devices.userId, userId), isNull(devices.revokedAt)))
    .returning({ id: devices.id });
  return rows.length > 0;
}

/** The bearer can end only its own connection, including after it expires. */
export async function endStudyDevice(token: string) {
  if (!/^[a-f\d]{64}$/.test(token)) return;
  await db
    .update(devices)
    .set({ revokedAt: new Date() })
    .where(and(eq(devices.tokenHash, tokenHash(token)), isNull(devices.revokedAt)));
}

export async function consumeCodeAttempt(address: string, now = new Date()) {
  const key = privateHash("connection-address", address);
  const cutoff = new Date(now.getTime() - CODE_WINDOW_MS);
  const [row] = await db
    .insert(limits)
    .values({ key, startedAt: now, attempts: 1 })
    .onConflictDoUpdate({
      target: limits.key,
      set: {
        startedAt: sql`case when ${limits.startedAt} <= ${cutoff.toISOString()} then ${now.toISOString()}::timestamptz else ${limits.startedAt} end`,
        attempts: sql`case when ${limits.startedAt} <= ${cutoff.toISOString()} then 1 else least(${limits.attempts} + 1, ${CODE_ATTEMPTS + 1}) end`,
      },
    })
    .returning({ attempts: limits.attempts });
  assertAllowed(
    row && row.attempts <= CODE_ATTEMPTS,
    "RATE_LIMIT",
    "Muitas tentativas de conexão. Aguarde dez minutos e tente novamente.",
  );
}

export async function redeemStudyCode(raw: unknown) {
  const parsed = studyCodeSchema.safeParse(raw);
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
    assertAllowed(
      device,
      "CODE",
      "Esta conexão não está mais disponível. Peça um novo código ao responsável.",
    );
    const profiles = await tx
      .select({ id: grants.profileId })
      .from(grants)
      .innerJoin(missaoProfiles, eq(grants.profileId, missaoProfiles.id))
      .where(and(eq(grants.deviceId, device.id), eq(missaoProfiles.userId, device.userId)));
    assertAllowed(
      profiles.length,
      "CODE",
      "Esta conexão não tem um estudante disponível. Peça um novo código.",
    );
    const [connected] = await tx
      .update(devices)
      .set({
        tokenHash: tokenHash(token),
        connectedAt: now,
        expiresAt: new Date(now.getTime() + studyLifetimeMs(device.remember)),
      })
      .where(eq(devices.id, device.id))
      .returning(publicFields);
    assertAllowed(connected, "CODE", "Não foi possível conectar este aparelho.");
    await tx.update(codes).set({ consumedAt: now }).where(eq(codes.id, code.id));
    return { device: connected, token, profileIds: profiles.map((profile) => profile.id) };
  });
}

/** Operational credentials have no pedagogical retention requirement. */
export async function cleanupStudyAccess() {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60_000);
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60_000);
  await db.delete(limits).where(lt(limits.startedAt, dayAgo));
  await db.delete(codes).where(lt(codes.expiresAt, dayAgo));
  await db
    .delete(devices)
    .where(or(lt(devices.expiresAt, monthAgo), lt(devices.revokedAt, monthAgo)));
}
