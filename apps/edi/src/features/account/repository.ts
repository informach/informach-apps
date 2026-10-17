import { and, db, desc, eq, isNull } from "@informach/db";
import { customers, ediActivations, ediDevices, subscriptions } from "@informach/db/schema";
import { accountAccess } from "@informach/edi-licensing";
import { revokeDevice } from "@informach/edi-licensing/devices";

export async function readAccount(userId: string) {
  const [access, plans, devices] = await Promise.all([
    accountAccess(db, userId, new Date()),
    db
      .select({ subscription: subscriptions })
      .from(subscriptions)
      .innerJoin(customers, eq(customers.id, subscriptions.customerId))
      .where(
        and(
          eq(customers.app, "edi"),
          eq(customers.subjectType, "user"),
          eq(customers.subjectId, userId),
        ),
      )
      .orderBy(desc(subscriptions.createdAt))
      .limit(10),
    db
      .select({
        id: ediDevices.id,
        name: ediDevices.name,
        lastSeenAt: ediDevices.lastSeenAt,
        activationId: ediActivations.id,
      })
      .from(ediDevices)
      .innerJoin(ediActivations, eq(ediActivations.deviceId, ediDevices.id))
      .where(and(eq(ediDevices.userId, userId), isNull(ediActivations.revokedAt)))
      .limit(10),
  ]);
  return {
    access,
    plans: plans.map(({ subscription }) => ({
      id: subscription.id,
      status: subscription.status,
      productId: subscription.productId,
      periodEnd: subscription.currentPeriodEnd.toISOString(),
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd !== null,
    })),
    devices: devices.map((device) => ({ ...device, lastSeenAt: device.lastSeenAt.toISOString() })),
  };
}
export async function revokeAccountDevice(userId: string, deviceId: string) {
  return revokeDevice(db, userId, deviceId, new Date());
}
