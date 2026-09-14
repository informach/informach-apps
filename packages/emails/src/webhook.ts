import type { Database } from "@informach/db";
import { emailDeliveries, emailSuppressions, emailUnsubscribes, users } from "@informach/db/schema";
import { EventWebhook, EventWebhookHeader } from "@sendgrid/eventwebhook";
import { and, eq, notInArray } from "drizzle-orm";
import { type EmailAuditHook, emailAddressAuditPayload, emitEmailAudit } from "./audit";
import { type Logger, safeLog } from "./logger";

export const SENDGRID_SIGNATURE_HEADER = EventWebhookHeader.SIGNATURE();
export const SENDGRID_TIMESTAMP_HEADER = EventWebhookHeader.TIMESTAMP();

export type SendgridEvent = {
  email: string;
  event: string;
  timestamp: number;
  sg_message_id?: string;
  reason?: string;
  type?: string;
  status?: string;
  delivery_id?: string;
  category?: string | string[];
  informach_category?: string;
  user_id?: string;
};

export type WebhookDeps = {
  db: Database;
  logger?: Pick<Logger, "warn" | "error">;
  onAudit?: EmailAuditHook;
};

export function verifySendgridSignature(
  publicKey: string,
  rawBody: Buffer | string,
  signature: string | null | undefined,
  timestamp: string | null | undefined,
): boolean {
  if (!publicKey || !signature || !timestamp) return false;
  try {
    const webhook = new EventWebhook();
    const ecPublicKey = webhook.convertPublicKeyToECDSA(publicKey);
    return webhook.verifySignature(ecPublicKey, rawBody, signature, timestamp);
  } catch {
    return false;
  }
}

async function findDelivery(db: Database, event: SendgridEvent) {
  if (event.delivery_id) {
    const [row] = await db
      .select()
      .from(emailDeliveries)
      .where(eq(emailDeliveries.id, event.delivery_id))
      .limit(1);
    if (row) return row;
  }
  if (event.sg_message_id) {
    const [withoutSuffix] = event.sg_message_id.split(".");
    if (withoutSuffix) {
      const [row] = await db
        .select()
        .from(emailDeliveries)
        .where(eq(emailDeliveries.providerMessageId, withoutSuffix))
        .limit(1);
      if (row) return row;
    }
  }
  return null;
}

async function markDeliveryStatus(
  db: Database,
  deliveryId: string,
  status: "delivered" | "bounced" | "dropped" | "complained",
  lastError: string | null,
): Promise<void> {
  const deliveryMatch =
    status === "delivered"
      ? and(
          eq(emailDeliveries.id, deliveryId),
          notInArray(emailDeliveries.status, ["bounced", "dropped", "complained"]),
        )
      : eq(emailDeliveries.id, deliveryId);
  await db
    .update(emailDeliveries)
    .set({
      status,
      providerAccepted: true,
      ...(lastError ? { lastError } : {}),
      updatedAt: new Date(),
    })
    .where(deliveryMatch);
}

async function markProviderAccepted(db: Database, deliveryId: string): Promise<void> {
  await db
    .update(emailDeliveries)
    .set({ providerAccepted: true, updatedAt: new Date() })
    .where(eq(emailDeliveries.id, deliveryId));
}

async function upsertSuppression(db: Database, email: string, reason: string): Promise<void> {
  await db
    .insert(emailSuppressions)
    .values({ email: email.toLowerCase(), reason, source: "sendgrid" })
    .onConflictDoNothing({ target: emailSuppressions.email });
}

async function recordUnsubscribe(
  db: Database,
  event: Omit<SendgridEvent, "category"> & { category?: string },
): Promise<{ userId: string; category: string } | null> {
  let userId = event.user_id;
  if (!userId) {
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, event.email.toLowerCase()))
      .limit(1);
    if (!user) return null;
    userId = user.id;
  }

  const category = event.category ?? "marketing.all";
  await db.insert(emailUnsubscribes).values({ userId, category }).onConflictDoNothing();
  return { userId, category };
}

export async function handleSendgridEvent(deps: WebhookDeps, raw: SendgridEvent): Promise<void> {
  const delivery = await findDelivery(deps.db, raw);
  // Provider categories may be arrays. Delivery is authoritative; our custom
  // argument has a distinct name so it cannot collide with the provider field.
  const authoritative = delivery?.category ?? raw.informach_category;
  const categories = [
    ...new Set(
      authoritative
        ? [authoritative]
        : Array.isArray(raw.category)
          ? raw.category
          : raw.category
            ? [raw.category]
            : [],
    ),
  ];
  const event = { ...raw, category: categories[0], user_id: delivery?.userId ?? raw.user_id };

  switch (event.event) {
    case "processed": {
      if (delivery) await markProviderAccepted(deps.db, delivery.id);
      return;
    }
    case "delivered": {
      if (delivery) {
        await markDeliveryStatus(deps.db, delivery.id, "delivered", null);
      }
      return;
    }
    case "deferred": {
      safeLog(deps.logger, "warn", "SendGrid deferred", {
        deliveryId: delivery?.id,
        ...emailAddressAuditPayload(event.email),
        reason: event.reason,
      });
      return;
    }
    case "bounce":
    case "blocked": {
      if (delivery) {
        await markDeliveryStatus(deps.db, delivery.id, "bounced", event.reason ?? null);
      }
      await upsertSuppression(deps.db, event.email, event.reason ?? "bounce");
      emitEmailAudit(deps, {
        eventType: "email.suppression_recorded",
        actorId: null,
        payload: {
          ...emailAddressAuditPayload(event.email),
          deliveryId: delivery?.id ?? null,
          category: event.category ?? delivery?.category ?? null,
          providerEvent: event.event,
          reason: event.reason ?? "bounce",
          source: "sendgrid",
        },
      });
      return;
    }
    case "dropped": {
      if (delivery) {
        await markDeliveryStatus(deps.db, delivery.id, "dropped", event.reason ?? null);
      }
      await upsertSuppression(deps.db, event.email, event.reason ?? "dropped");
      emitEmailAudit(deps, {
        eventType: "email.suppression_recorded",
        actorId: null,
        payload: {
          ...emailAddressAuditPayload(event.email),
          deliveryId: delivery?.id ?? null,
          category: event.category ?? delivery?.category ?? null,
          providerEvent: event.event,
          reason: event.reason ?? "dropped",
          source: "sendgrid",
        },
      });
      return;
    }
    case "spamreport": {
      if (delivery) {
        await markDeliveryStatus(deps.db, delivery.id, "complained", "spamreport");
      }
      await upsertSuppression(deps.db, event.email, "spamreport");
      emitEmailAudit(deps, {
        eventType: "email.suppression_recorded",
        actorId: null,
        payload: {
          ...emailAddressAuditPayload(event.email),
          deliveryId: delivery?.id ?? null,
          category: event.category ?? delivery?.category ?? null,
          providerEvent: event.event,
          reason: "spamreport",
          source: "sendgrid",
        },
      });
      return;
    }
    case "unsubscribe":
    case "group_unsubscribe": {
      for (const category of categories.length ? categories : ["marketing.all"]) {
        const recorded = await recordUnsubscribe(deps.db, { ...event, category });
        if (recorded) {
          emitEmailAudit(deps, {
            eventType: "email.unsubscribe_recorded",
            actorId: recorded.userId,
            payload: {
              ...emailAddressAuditPayload(event.email),
              category: recorded.category,
              providerEvent: event.event,
              source: "sendgrid",
            },
          });
        }
      }
      return;
    }
    default:
      return;
  }
}

export async function handleSendgridEvents(
  deps: WebhookDeps,
  events: SendgridEvent[],
): Promise<{ processed: number; failed: number }> {
  let processed = 0;
  let failed = 0;
  for (const event of events) {
    try {
      await handleSendgridEvent(deps, event);
      processed += 1;
    } catch (error) {
      failed += 1;
      safeLog(deps.logger, "error", "Failed to process SendGrid event", {
        event: event.event,
        ...emailAddressAuditPayload(event.email),
        error: (error as Error).message,
      });
    }
  }
  return { processed, failed };
}
