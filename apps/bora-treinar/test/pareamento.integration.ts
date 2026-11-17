import { randomUUID } from "node:crypto";
import { isActiveWebSession, isRecentWebAuthentication } from "@informach/auth/web-sessions";
import { startCompassoTrial } from "@informach/billing/compasso";
import { db, eq } from "@informach/db";
import { sessions, users } from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { afterAll, describe, expect, it } from "vitest";
import { activateTrainer } from "@/features/familia/service";
import { mayUsePairing } from "@/features/pareamento/authorization";
import { capturePairingDelegations } from "@/features/pareamento/repository";
import {
  barramento,
  canal,
  canalAutorizado,
  criarPareamento,
  emitirCredencial,
  entrarComCodigo,
  lerCredencial,
  streamSse,
} from "@/features/pareamento/servidor";
import { redis } from "@/lib/redis";

afterAll(async () => {
  if (redis) await redis.quit();
});

const family = createFamilyService({ db });
async function fixture() {
  const actorId = randomUUID();
  const managerId = randomUUID();
  const sessionId = randomUUID();
  const rootId = randomUUID();
  await db.insert(users).values(
    [actorId, managerId].map((id) => ({
      id,
      name: "Pairing adult",
      email: `${id}@example.test`,
      emailVerified: true,
    })),
  );
  const group = await family.createGroup(managerId, "Pairing family");
  const person = await family.createPerson(managerId, {
    groupId: group.id,
    kind: "dependent",
    displayName: "Training person",
  });
  await startCompassoTrial(
    { db, trialHashSecret: "isolated-pairing-trial-secret-32-characters" },
    managerId,
    group.id,
  );
  const profileId = await activateTrainer(managerId, group.id, person.id);
  const invite = await family.createInvitation(managerId, group.id, `${actorId}@example.test`);
  await family.acceptInvitation(actorId, invite.token);
  for (const action of ["read", "write"] as const)
    await family.grantAccess(managerId, {
      groupId: group.id,
      personId: person.id,
      app: "bora-treinar",
      userId: actorId,
      action,
    });
  const expiresAt = new Date(Date.now() + 3 * 3600_000);
  await db.insert(sessions).values({
    id: rootId,
    userId: actorId,
    token: randomUUID(),
    originApp: "conta",
    expiresAt,
    createdAt: new Date(Date.now() - 2 * 3600_000),
  });
  await db.insert(sessions).values({
    id: sessionId,
    userId: actorId,
    token: randomUUID(),
    originApp: "bora-treinar",
    parentSessionId: rootId,
    expiresAt,
  });
  const context = { actorId, familyGroupId: group.id, profileIds: [profileId] };
  return {
    authority: { ...context, sessionId, delegations: await capturePairingDelegations(context) },
    target: { groupId: group.id, personId: person.id, app: "bora-treinar", userId: actorId },
    rootId,
    managerId,
  };
}
function bus() {
  const result = barramento();
  if (!result) throw new Error("Missing isolated bus");
  return result;
}

describe("Pairing follows canonical access and live central sessions", () => {
  it("distinguishes an active browser from a recent password and denies expired/foreign sessions", async () => {
    const f = await fixture();
    const identity = {
      userId: f.authority.actorId,
      sessionId: f.authority.sessionId,
      app: "bora-treinar",
    };
    expect(await isActiveWebSession(identity)).toBe(true);
    expect(await isRecentWebAuthentication({ ...identity, maxAgeSeconds: 600 })).toBe(false);
    expect(await mayUsePairing(f.authority)).toBe(true);
    expect(await isActiveWebSession({ ...identity, app: "cozya" })).toBe(false);
    await db
      .update(sessions)
      .set({ expiresAt: new Date(0) })
      .where(eq(sessions.id, f.rootId));
    expect(await mayUsePairing(f.authority)).toBe(false);
  });

  it("claims a code once under concurrency and binds credentials to the channel generation", async () => {
    const f = await fixture();
    const channel = await criarPareamento(bus(), f.authority);
    if (!channel) throw new Error("Missing pairing channel");
    const joined = await Promise.all(
      Array.from({ length: 8 }, () => entrarComCodigo(bus(), channel.codigo)),
    );
    expect(joined.filter(Boolean)).toHaveLength(1);
    const credential = emitirCredencial(
      channel.codigo,
      channel.id,
      channel.criadoEm + 3 * 3600_000,
    );
    expect(lerCredencial(credential)).toMatchObject({
      codigo: channel.codigo,
      registroId: channel.id,
    });
    expect(lerCredencial(`${credential.slice(0, -2)}xx`)).toBeNull();
    expect(await canalAutorizado(bus(), channel.codigo, randomUUID())).toBeNull();
    await db.delete(sessions).where(eq(sessions.id, f.rootId));
    expect(await canalAutorizado(bus(), channel.codigo, channel.id)).toBeNull();
  });

  it("rechecks profile grants and family context instead of relying on the original membership", async () => {
    const f = await fixture();
    const other = await family.createGroup(f.authority.actorId, "Another context");
    expect(await mayUsePairing({ ...f.authority, familyGroupId: other.id })).toBe(false);
    expect(await mayUsePairing({ ...f.authority, profileIds: [randomUUID()] })).toBe(false);
    await family.revokeAccess(f.managerId, { ...f.target, action: "write" });
    expect(await mayUsePairing(f.authority)).toBe(false);
    await family.grantAccess(f.managerId, { ...f.target, action: "write" });
    expect(await mayUsePairing(f.authority)).toBe(false);
    f.authority.delegations = await capturePairingDelegations(f.authority);
    expect(await mayUsePairing(f.authority)).toBe(true);
    await family.archivePerson(f.managerId, f.target.groupId, f.target.personId);
    await family.restorePerson(f.managerId, f.target.groupId, f.target.personId);
    expect(await mayUsePairing(f.authority)).toBe(false);
    f.authority.delegations = await capturePairingDelegations(f.authority);
    expect(await mayUsePairing(f.authority)).toBe(true);
    await db.update(users).set({ banned: true }).where(eq(users.id, f.authority.actorId));
    expect(await mayUsePairing(f.authority)).toBe(false);
  });

  it("closes an already-open stream before delivering content after grant revocation", async () => {
    const f = await fixture();
    const channel = await criarPareamento(bus(), f.authority);
    if (!channel) throw new Error("Missing channel");
    const controller = new AbortController();
    const destination = canal(channel.codigo, channel.id, "celular");
    const response = streamSse(
      bus(),
      destination,
      '{"tipo":"estado"}',
      controller.signal,
      async () => Boolean(await canalAutorizado(bus(), channel.codigo, channel.id)),
    );
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Missing stream");
    try {
      expect(new TextDecoder().decode((await reader.read()).value)).toContain("retry:");
      expect(new TextDecoder().decode((await reader.read()).value)).toContain('"tipo":"estado"');
      await family.revokeAccess(f.managerId, { ...f.target, action: "read" });
      await bus().publicar(destination, '{"titulo":"must not be delivered"}');
      expect(await reader.read()).toMatchObject({ done: true });
    } finally {
      controller.abort();
      await reader.cancel();
    }
  });
});
