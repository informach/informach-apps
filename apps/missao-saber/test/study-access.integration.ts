import { randomBytes, randomUUID } from "node:crypto";
import { db, eq } from "@informach/db";
import { missaoProfiles, missaoStudyCodes, missaoStudyDevices, users } from "@informach/db/schema";
import { beforeEach, describe, expect, it } from "vitest";
import { clearFamily } from "@/features/learning/repository";
import { createProfile } from "@/features/learning/service";
import {
  cleanupStudyAccess,
  consumeCodeAttempt,
  createStudyCode,
  createStudyDevice,
  endStudyDevice,
  listStudyDevices,
  readStudyDevice,
  redeemStudyCode,
  revokeStudyDevice,
} from "@/features/study-access/repository";

let owner = "";
let other = "";
let profile = "";
let sibling = "";
const deviceInput = () => ({ profileIds: [profile], label: "Tablet da família", remember: false });

beforeEach(async () => {
  owner = randomUUID();
  other = randomUUID();
  await db.insert(users).values(
    [owner, other].map((id) => ({
      id,
      email: `${id}@example.test`,
      name: "Responsible",
      emailVerified: true,
    })),
  );
  const input = {
    nickname: "Lua",
    grade: 6,
    avatar: "cometa",
    courseId: "olitef-n1",
    consent: true,
  };
  profile = (await createProfile(owner, input)).id;
  const [row] = await db
    .insert(missaoProfiles)
    .values({ userId: owner, nickname: "Sol", grade: 6, courseId: "olitef-n1" })
    .returning();
  if (!row) throw new Error("Missing sibling fixture");
  sibling = row.id;
});

describe("real PostgreSQL study credentials", () => {
  it("stores hashes, restricts the profile set and omits credentials from the device list", async () => {
    const access = await createStudyDevice(owner, deviceInput());
    expect((await readStudyDevice(access.token))?.profileIds).toEqual([profile]);
    const [stored] = await db
      .select()
      .from(missaoStudyDevices)
      .where(eq(missaoStudyDevices.id, access.device.id));
    expect(stored?.tokenHash).not.toBe(access.token);
    expect(await readStudyDevice(randomUUID())).toBeNull();
    expect(await readStudyDevice(randomBytes(32).toString("hex"))).toBeNull();
    expect(JSON.stringify(await listStudyDevices(owner))).not.toContain(access.token);
    expect(JSON.stringify(await listStudyDevices(owner))).not.toContain(stored?.tokenHash);
  });
  it("cannot grant profiles owned by another family", async () => {
    await expect(createStudyDevice(other, deviceInput())).rejects.toMatchObject({
      code: "PROFILE",
    });
  });
  it("authorizes multiple siblings only when the parent explicitly includes them", async () => {
    const access = await createStudyDevice(owner, {
      ...deviceInput(),
      profileIds: [profile, sibling],
    });
    expect((await readStudyDevice(access.token))?.profileIds.sort()).toEqual(
      [profile, sibling].sort(),
    );
  });
  it("revokes immediately without allowing another owner to revoke it", async () => {
    const access = await createStudyDevice(owner, deviceInput());
    expect(await revokeStudyDevice(other, access.device.id)).toBe(false);
    expect(await readStudyDevice(access.token)).not.toBeNull();
    expect(await revokeStudyDevice(owner, access.device.id)).toBe(true);
    expect(await readStudyDevice(access.token)).toBeNull();
  });
  it("ends a bearer connection and rejects expired credentials", async () => {
    const access = await createStudyDevice(owner, deviceInput());
    await db
      .update(missaoStudyDevices)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(missaoStudyDevices.id, access.device.id));
    expect(await readStudyDevice(access.token)).toBeNull();
    await endStudyDevice(access.token);
    expect((await listStudyDevices(owner))[0]?.revokedAt).not.toBeNull();
  });
  it("cannot keep studying after the owning account is blocked", async () => {
    const access = await createStudyDevice(owner, deviceInput());
    await db.update(users).set({ banned: true }).where(eq(users.id, owner));
    expect(await readStudyDevice(access.token)).toBeNull();
  });
  it("consumes a connection code exactly once under concurrent replay", async () => {
    const pairing = await createStudyCode(owner, { ...deviceInput(), remember: true });
    const results = await Promise.allSettled([
      redeemStudyCode(pairing.code),
      redeemStudyCode(pairing.code),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    for (const result of results)
      if (result.status === "fulfilled") {
        expect((await readStudyDevice(result.value.token))?.profileIds).toEqual([profile]);
        expect(result.value.device.expiresAt.getTime() - Date.now()).toBeGreaterThan(
          29 * 24 * 60 * 60_000,
        );
      }
    await expect(redeemStudyCode(pairing.code)).rejects.toMatchObject({ code: "CODE" });
  });
  it("rejects revoked and expired invitations", async () => {
    const first = await createStudyCode(owner, deviceInput());
    await revokeStudyDevice(owner, first.device.id);
    await expect(redeemStudyCode(first.code)).rejects.toMatchObject({ code: "CODE" });
    const second = await createStudyCode(owner, deviceInput());
    await db
      .update(missaoStudyDevices)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(missaoStudyDevices.id, second.device.id));
    await expect(redeemStudyCode(second.code)).rejects.toMatchObject({ code: "CODE" });
  });
  it("limits concurrent connection attempts and opens a new window after ten minutes", async () => {
    const address = randomUUID();
    const now = new Date();
    const results = await Promise.allSettled(
      Array.from({ length: 12 }, () => consumeCodeAttempt(address, now)),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(10);
    await expect(consumeCodeAttempt(address, now)).rejects.toMatchObject({ code: "RATE_LIMIT" });
    await expect(
      consumeCodeAttempt(address, new Date(now.getTime() + 10 * 60_000)),
    ).resolves.toBeUndefined();
  });
  it("deletes study access when the family is cleared", async () => {
    const access = await createStudyDevice(owner, deviceInput());
    await clearFamily(owner);
    expect(await readStudyDevice(access.token)).toBeNull();
    expect(await listStudyDevices(owner)).toEqual([]);
  });
  it("rejects a code whose own expiry elapsed even if the device has time left", async () => {
    const pairing = await createStudyCode(owner, deviceInput());
    await db
      .update(missaoStudyCodes)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(missaoStudyCodes.deviceId, pairing.device.id));
    await expect(redeemStudyCode(pairing.code)).rejects.toMatchObject({ code: "CODE" });
  });
  it("keeps active devices visible ahead of historical connections and cleans only old credentials", async () => {
    const access = await createStudyDevice(owner, deviceInput());
    const old = new Date(Date.now() - 32 * 24 * 60 * 60_000);
    await db.insert(missaoStudyDevices).values(
      Array.from({ length: 31 }, () => ({
        userId: owner,
        label: "Encerrado",
        tokenHash: randomBytes(32).toString("hex"),
        expiresAt: old,
        revokedAt: old,
      })),
    );
    expect((await listStudyDevices(owner))[0]?.id).toBe(access.device.id);
    await cleanupStudyAccess();
    expect(await listStudyDevices(owner)).toHaveLength(1);
    expect(await readStudyDevice(access.token)).not.toBeNull();
  });
});
