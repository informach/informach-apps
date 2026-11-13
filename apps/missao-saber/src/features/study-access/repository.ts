import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import {
  activeWebParticipationCondition,
  currentWebParticipationCondition,
  lockActiveWebParticipation,
} from "@informach/auth/web-participation";
import { and, db, desc, eq, gt, inArray, isNotNull, isNull, lt, or, sql } from "@informach/db";
import {
  missaoStudyCodes as codes,
  missaoStudyDevices as devices,
  familyAppProfiles,
  missaoStudyDeviceProfiles as grants,
  missaoStudyAccessLimits as limits,
  missaoProfiles,
  missaoSessions,
  users,
} from "@informach/db/schema";
import { lockFamilyMembership } from "@informach/family/context";
import { captureProfileDelegations } from "@informach/family/delegation";
import { env } from "@/lib/env";
import { assertAllowed } from "@/lib/errors";
import type { StudyAuthority } from "../family/authority";
import { studentAccessCondition, studyDeviceProfileCondition } from "../family/scope";
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
  familyGroupId: devices.familyGroupId,
  label: devices.label,
  remember: devices.remember,
  expiresAt: devices.expiresAt,
  connectedAt: devices.connectedAt,
  revokedAt: devices.revokedAt,
  createdAt: devices.createdAt,
};
const devicesValue = (id: string) => sql`${id}::uuid`;
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
    const owned = await tx
      .select({
        id: missaoProfiles.id,
        activationId: familyAppProfiles.id,
        groupId: familyAppProfiles.groupId,
      })
      .from(missaoProfiles)
      .innerJoin(familyAppProfiles, eq(familyAppProfiles.id, missaoProfiles.familyProfileId))
      .where(
        and(
          eq(familyAppProfiles.app, "missao-saber"),
          inArray(missaoProfiles.id, input.profileIds),
        ),
      );
    assertAllowed(
      owned.length === input.profileIds.length,
      "PROFILE",
      "Escolha somente estudantes da sua família.",
    );
    const familyGroupId = owned[0]?.groupId;
    assertAllowed(
      familyGroupId && owned.every((profile) => profile.groupId === familyGroupId),
      "PROFILE",
      "Escolha estudantes da mesma família.",
    );
    const delegations = await captureProfileDelegations(
      tx,
      userId,
      "missao-saber",
      familyGroupId,
      owned.map((profile) => profile.activationId),
    );
    const webParticipationRevision = await lockActiveWebParticipation(tx, userId);
    const active = await tx
      .select({ id: devices.id })
      .from(devices)
      .where(
        and(
          eq(devices.userId, userId),
          eq(devices.familyGroupId, familyGroupId),
          isNull(devices.revokedAt),
          gt(devices.expiresAt, now),
          currentWebParticipationCondition(devices.userId, devices.webParticipationRevision),
        ),
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
        familyGroupId,
        tokenHash: tokenHash(token),
        webParticipationRevision,
        label: input.label,
        remember: input.remember,
        expiresAt: new Date(
          now.getTime() + (pending ? CODE_LIFETIME_MS : studyLifetimeMs(input.remember)),
        ),
        connectedAt: pending ? null : now,
      })
      .returning(publicFields);
    assertAllowed(device, "DEVICE", "Não foi possível preparar o estudo.");
    await tx.insert(grants).values(
      owned.map((profile) => {
        const claim = delegations.find((entry) => entry.profileId === profile.activationId);
        assertAllowed(claim, "PROFILE", "Estudante não disponível.");
        return {
          deviceId: device.id,
          profileId: profile.id,
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
        currentWebParticipationCondition(users.id, devices.webParticipationRevision),
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
    .where(
      and(
        eq(grants.deviceId, device.id),
        studyDeviceProfileCondition(device.userId, devicesValue(device.id), grants.profileId),
      ),
    )
    .orderBy(missaoProfiles.createdAt, missaoProfiles.id);
  if (!profiles.length) return null;
  return { device, profileIds: profiles.map((row) => row.id) };
}

/** Navigation guard only. Domain operations must keep this authority in their transaction. */
export async function studySessionAvailable(actor: StudyAuthority, sessionId: string) {
  const [row] = await db
    .select({ id: missaoSessions.id })
    .from(missaoSessions)
    .where(
      and(
        eq(missaoSessions.id, sessionId),
        studentAccessCondition(actor, missaoSessions.profileId),
      ),
    );
  return !!row;
}

export async function listStudyDevices(userId: string, familyGroupId?: string) {
  const rows = await db
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
        eq(devices.userId, userId),
        activeWebParticipationCondition(userId),
        familyGroupId ? eq(devices.familyGroupId, familyGroupId) : undefined,
      ),
    )
    .orderBy(
      sql`(${devices.revokedAt} is null and ${devices.expiresAt} > now() and ${currentWebParticipationCondition(devices.userId, devices.webParticipationRevision)}) desc`,
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
    const [observed] = await tx
      .select({ device: publicFields, codeId: codes.id })
      .from(codes)
      .innerJoin(devices, eq(codes.deviceId, devices.id))
      .where(
        and(
          eq(codes.codeHash, privateHash("code", parsed.data)),
          isNull(codes.consumedAt),
          gt(codes.expiresAt, now),
          isNull(devices.revokedAt),
          gt(devices.expiresAt, now),
        ),
      );
    assertAllowed(observed, "CODE", "Esta conexão não está mais disponível. Peça um novo código.");
    await lockFamilyMembership(tx, observed.device.userId, observed.device.familyGroupId);
    const [device] = await tx
      .select(publicFields)
      .from(devices)
      .where(
        and(
          eq(devices.id, observed.device.id),
          isNull(devices.revokedAt),
          isNull(devices.connectedAt),
          gt(devices.expiresAt, new Date()),
        ),
      )
      .for("update");
    assertAllowed(device, "CODE", "Esta conexão não está mais disponível. Peça um novo código.");
    const [code] = await tx
      .select()
      .from(codes)
      .where(
        and(
          eq(codes.id, observed.codeId),
          isNull(codes.consumedAt),
          gt(codes.expiresAt, new Date()),
        ),
      )
      .for("update");
    assertAllowed(code, "CODE", "Confira o código. Ele pode ter expirado ou já ter sido usado.");
    const profiles = await tx
      .select({ id: grants.profileId })
      .from(grants)
      .innerJoin(missaoProfiles, eq(grants.profileId, missaoProfiles.id))
      .where(
        and(
          eq(grants.deviceId, device.id),
          studyDeviceProfileCondition(
            device.userId,
            devicesValue(device.id),
            grants.profileId,
            false,
          ),
        ),
      );
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
