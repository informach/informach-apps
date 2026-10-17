import { generateKeyPairSync, randomUUID } from "node:crypto";
import { db } from "@informach/db";
import {
  ediActivations,
  ediDeviceSessions,
  ediDevices,
  ediOutbox,
  users,
} from "@informach/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { ActivationError, activateDevice, revokeDevice } from "./devices";

beforeAll(() => {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    process.env.EDI_ISOLATED_DATABASE !== "1" ||
    url.hostname !== "127.0.0.1" ||
    url.username !== "edi_check"
  )
    throw new Error("Integration tests require the disposable Edi database runner.");
});
async function owner() {
  const id = randomUUID();
  await db.insert(users).values({ id, name: "Edi integration", email: `${id}@example.test` });
  return id;
}
function device() {
  const key = generateKeyPairSync("ed25519");
  return {
    deviceId: randomUUID(),
    name: "Test PC",
    publicKeySpki: key.publicKey.export({ type: "spki", format: "der" }).toString("base64"),
  };
}

describe("PostgreSQL activation transactions", () => {
  it("serializes simultaneous activations and never exceeds two devices", async () => {
    const userId = await owner();
    const results = await Promise.allSettled(
      Array.from({ length: 3 }, () => activateDevice(db, userId, device(), new Date())),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(2);
    const rejected = results.find((result) => result.status === "rejected");
    expect(
      rejected?.status === "rejected" &&
        rejected.reason instanceof ActivationError &&
        rejected.reason.reason,
    ).toBe("device_limit");
    const live = await db
      .select()
      .from(ediActivations)
      .innerJoin(ediDevices, eq(ediDevices.id, ediActivations.deviceId))
      .where(and(eq(ediDevices.userId, userId), isNull(ediActivations.revokedAt)));
    expect(live).toHaveLength(2);
  });
  it("makes retries idempotent and rejects account/key substitution", async () => {
    const userId = await owner();
    const input = device();
    const activations = await Promise.all(
      Array.from({ length: 4 }, () => activateDevice(db, userId, input, new Date())),
    );
    expect(new Set(activations.map((activation) => activation.id)).size).toBe(1);
    await expect(activateDevice(db, await owner(), input, new Date())).rejects.toMatchObject({
      reason: "device_conflict",
    });
    await expect(
      activateDevice(db, userId, { ...device(), deviceId: input.deviceId }, new Date()),
    ).rejects.toMatchObject({ reason: "device_conflict" });
  });
  it("revokes sessions and writes a durable outbox event in the same transaction", async () => {
    const userId = await owner();
    const input = device();
    const activation = await activateDevice(db, userId, input, new Date());
    await db.insert(ediDeviceSessions).values({
      activationId: activation.id,
      oauthGrantId: randomUUID(),
      expiresAt: new Date(Date.now() + 3600000),
    });
    expect(await revokeDevice(db, await owner(), input.deviceId, new Date())).toBe(false);
    expect(await revokeDevice(db, userId, input.deviceId, new Date())).toBe(true);
    expect(await revokeDevice(db, userId, input.deviceId, new Date())).toBe(false);
    const sessions = await db
      .select()
      .from(ediDeviceSessions)
      .where(eq(ediDeviceSessions.activationId, activation.id));
    expect(sessions[0]?.revokedAt).toBeInstanceOf(Date);
    const events = await db.select().from(ediOutbox).where(eq(ediOutbox.subjectId, activation.id));
    expect(events).toHaveLength(1);
    const newActivation = await activateDevice(db, userId, input, new Date());
    expect(newActivation.id).not.toBe(activation.id);
  });
});
