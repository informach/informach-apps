import { createHash, createPublicKey, type KeyObject } from "node:crypto";
import type { Database } from "@informach/db";
import {
  ediActivations,
  ediDeviceSessions,
  ediDevices,
  ediOutbox,
  users,
} from "@informach/db/schema";
import { activationRequestSchema, MAX_DEVICE_ACTIVATIONS } from "@informach/edi-contracts";
import { and, count, eq, isNull, sql } from "drizzle-orm";

export class ActivationError extends Error {
  constructor(
    readonly reason:
      | "device_limit"
      | "invalid_key"
      | "device_conflict"
      | "unknown_user"
      | "device_revoked",
  ) {
    super(reason);
    this.name = "ActivationError";
  }
}

export function validateDeviceKey(spki: string): { publicKeySpki: string; keyThumbprint: string } {
  if (spki.length > 256) throw new ActivationError("invalid_key");
  let key: KeyObject;
  try {
    key = createPublicKey({ key: Buffer.from(spki, "base64"), type: "spki", format: "der" });
  } catch {
    throw new ActivationError("invalid_key");
  }
  if (key.asymmetricKeyType !== "ed25519") throw new ActivationError("invalid_key");
  const canonical = key.export({ type: "spki", format: "der" });
  if (canonical.toString("base64") !== spki) throw new ActivationError("invalid_key");
  return {
    publicKeySpki: spki,
    keyThumbprint: createHash("sha256").update(canonical).digest("hex"),
  };
}

/** Caller must authenticate a scoped desktop OAuth grant and verify possession
 * of the submitted key before activation. User identity never comes from input.
 * Locking the account row serializes activation AND revocation across processes. */
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export async function activateDevice(
  db: Database | Transaction,
  userId: string,
  raw: unknown,
  now: Date,
  approval?: { issuedAt: number },
) {
  const input = activationRequestSchema.parse(raw);
  const key = validateDeviceKey(input.publicKeySpki);
  return db.transaction(async (tx) => {
    const user = await tx
      .select({ id: users.id, banned: users.banned, banExpiresAt: users.banExpiresAt })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    if (!user[0]) throw new ActivationError("unknown_user");
    if (user[0].banned && (!user[0].banExpiresAt || user[0].banExpiresAt > now))
      throw new ActivationError("unknown_user");
    const existing = await tx
      .select()
      .from(ediDevices)
      .where(eq(ediDevices.id, input.deviceId))
      .limit(1);
    const device = existing[0];
    if (device && (device.userId !== userId || device.keyThumbprint !== key.keyThumbprint))
      throw new ActivationError("device_conflict");
    if (approval && device) {
      const previous = await tx
        .select({ revokedAt: ediActivations.revokedAt })
        .from(ediActivations)
        .where(eq(ediActivations.deviceId, device.id));
      if (
        previous.some(
          (item) =>
            item.revokedAt && approval.issuedAt <= Math.floor(item.revokedAt.getTime() / 1000),
        )
      )
        throw new ActivationError("device_revoked");
    }
    if (device) {
      const live = await tx
        .select()
        .from(ediActivations)
        .where(and(eq(ediActivations.deviceId, device.id), isNull(ediActivations.revokedAt)))
        .limit(1);
      if (live[0]) {
        await tx
          .update(ediDevices)
          .set({ lastSeenAt: now, name: input.name })
          .where(eq(ediDevices.id, device.id));
        return live[0];
      }
    }
    const totals = await tx
      .select({ value: count() })
      .from(ediActivations)
      .innerJoin(ediDevices, eq(ediDevices.id, ediActivations.deviceId))
      .where(and(eq(ediDevices.userId, userId), isNull(ediActivations.revokedAt)));
    if ((totals[0]?.value ?? 0) >= MAX_DEVICE_ACTIVATIONS)
      throw new ActivationError("device_limit");
    if (!device)
      await tx.insert(ediDevices).values({
        id: input.deviceId,
        userId,
        name: input.name,
        ...key,
        createdAt: now,
        lastSeenAt: now,
      });
    const created = await tx
      .insert(ediActivations)
      .values({ deviceId: input.deviceId, activatedAt: now })
      .returning();
    const activation = created[0];
    if (!activation) throw new Error("Activation insert returned no row");
    return activation;
  });
}

export async function revokeDevice(
  db: Database | Transaction,
  userId: string,
  deviceId: string,
  now: Date,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const owned = await tx
      .select({ id: ediDevices.id })
      .from(ediDevices)
      .where(and(eq(ediDevices.id, deviceId), eq(ediDevices.userId, userId)))
      .limit(1);
    if (!owned[0]) return false;
    const revoked = await tx
      .update(ediActivations)
      .set({ revokedAt: now, revision: sql`${ediActivations.revision} + 1` })
      .where(and(eq(ediActivations.deviceId, deviceId), isNull(ediActivations.revokedAt)))
      .returning({ id: ediActivations.id });
    for (const activation of revoked) {
      await tx
        .update(ediDeviceSessions)
        .set({ revokedAt: now })
        .where(
          and(
            eq(ediDeviceSessions.activationId, activation.id),
            isNull(ediDeviceSessions.revokedAt),
          ),
        );
      await tx
        .insert(ediOutbox)
        .values({
          kind: "revoke_device",
          subjectId: activation.id,
          dedupeKey: `revoke:${activation.id}`,
          createdAt: now,
          availableAt: now,
        })
        .onConflictDoNothing({ target: ediOutbox.dedupeKey });
    }
    return revoked.length > 0;
  });
}
