import type { StripeMode } from "@informach/config";
import type { Database } from "@informach/db";
import { customers, webhookEvents } from "@informach/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { BillingError } from "./errors";

type Writer = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Minimal, already verified notification receipt for native reconciliation.
 * Caller holds the payer lifecycle and commits queue/revocation in this SAME TX.
 * This receipt never dispatches the optimistic legacy subscription projector.
 */
export async function recordUserProviderNotification(
  tx: Writer,
  input: {
    app: string;
    payerId: string;
    providerCustomerId: string;
    mode: StripeMode;
    eventId: string;
    eventType: string;
    objectId: string;
    created: number;
  },
) {
  if (
    !/^[a-z][a-z0-9-]{1,50}$/.test(input.app) ||
    !/^evt_[A-Za-z0-9_]{1,240}$/.test(input.eventId) ||
    !/^[a-z][a-z0-9_.]{1,100}$/.test(input.eventType) ||
    !/^[A-Za-z0-9_]{2,255}$/.test(input.objectId) ||
    !Number.isSafeInteger(input.created) ||
    input.created < 0
  )
    throw new BillingError("Invalid native provider notification");
  const [customer] = await tx
    .select({ id: customers.id })
    .from(customers)
    .where(
      and(
        eq(customers.provider, "stripe"),
        eq(customers.app, input.app),
        eq(customers.subjectType, "user"),
        eq(customers.subjectId, input.payerId),
        eq(customers.providerCustomerId, input.providerCustomerId),
      ),
    )
    .for("share");
  if (!customer)
    throw new BillingError("Notification customer does not belong to this payer and app");
  const key = `${input.app}-native:${input.mode}:${input.eventId}`;
  const payload = {
    id: input.eventId,
    type: input.eventType,
    objectId: input.objectId,
    created: input.created,
    livemode: input.mode === "prod",
  };
  const [inserted] = await tx
    .insert(webhookEvents)
    .values({
      provider: "stripe",
      providerEventId: key,
      app: input.app,
      providerCustomerId: input.providerCustomerId,
      eventType: input.eventType,
      payload,
      processedAt: sql`clock_timestamp()`,
      attempts: 1,
    })
    .onConflictDoNothing({ target: [webhookEvents.provider, webhookEvents.providerEventId] })
    .returning({ id: webhookEvents.id });
  if (inserted) return { id: inserted.id, admitted: true };
  const [existing] = await tx
    .select()
    .from(webhookEvents)
    .where(and(eq(webhookEvents.provider, "stripe"), eq(webhookEvents.providerEventId, key)));
  if (
    !existing ||
    existing.app !== input.app ||
    existing.providerCustomerId !== input.providerCustomerId ||
    existing.eventType !== input.eventType ||
    !existing.processedAt ||
    Object.entries(payload).some(([name, value]) => existing.payload[name] !== value)
  )
    throw new BillingError("Native notification conflicts with its durable receipt");
  return { id: existing.id, admitted: false };
}
