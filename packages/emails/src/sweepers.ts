import type { Database } from "@informach/db";
import { emailDeliveries, emailSuppressions } from "@informach/db/schema";
import { and, asc, eq, isNull, lt, lte, or, sql } from "drizzle-orm";
import { type EmailAuditHook, emailAddressAuditPayload, emitEmailAudit } from "./audit";
import {
  describeDeliveryBlockReason,
  findDeliveryBlockReason,
  markDeliveryBlocked,
} from "./delivery-policy";
import type { EmailAddress, EmailCategory, SendFn, SendgridMessage } from "./dispatch";
import { type Logger, safeLog } from "./logger";
import {
  classifySendgridError,
  MAX_ATTEMPTS,
  nextAttemptDelaySeconds,
  type SendgridErrorLike,
} from "./retry";
import { EmailCategorySchema } from "./schemas";

const STALE_AFTER_MS = 30 * 60 * 1000;

export type RecoverResult = { recovered: number };

export async function recoverStaleDeliveries(deps: {
  db: Database;
  staleAfterMs?: number;
}): Promise<RecoverResult> {
  const cutoff = new Date(Date.now() - (deps.staleAfterMs ?? STALE_AFTER_MS));

  const recovered = await deps.db
    .update(emailDeliveries)
    .set({ status: "unknown", nextAttemptAt: null, updatedAt: new Date() })
    .where(
      and(
        eq(emailDeliveries.status, "sending"),
        eq(emailDeliveries.providerAccepted, false),
        lt(emailDeliveries.sendingStartedAt, cutoff),
      ),
    )
    .returning({ id: emailDeliveries.id });

  return { recovered: recovered.length };
}

type SuppressionType = "bounces" | "blocks" | "spam_reports" | "invalid_emails";

const SUPPRESSION_TYPE_TO_REASON: Record<SuppressionType, string> = {
  bounces: "bounce",
  blocks: "block",
  spam_reports: "spamreport",
  invalid_emails: "invalid",
};

type SendgridSuppressionItem = {
  email: string;
  reason?: string;
  status?: string;
};

export type SyncSuppressionsResult = {
  synced: number;
  byType: Record<SuppressionType, number>;
};

async function fetchAllSuppressions(
  type: SuppressionType,
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<SendgridSuppressionItem[]> {
  const items: SendgridSuppressionItem[] = [];
  const limit = 500;
  let offset = 0;
  let page: SendgridSuppressionItem[] = [];

  do {
    const url = `https://api.sendgrid.com/v3/suppression/${type}?limit=${limit}&offset=${offset}`;
    const response = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(
        `SendGrid suppression fetch failed for ${type}: ${response.status} ${response.statusText}`,
      );
    }

    page = (await response.json()) as SendgridSuppressionItem[];
    items.push(...page);
    offset += limit;
  } while (page.length === limit);

  return items;
}

export async function syncSendgridSuppressions(deps: {
  db: Database;
  apiKey: string;
  fetch?: typeof fetch;
  types?: SuppressionType[];
  onAudit?: EmailAuditHook;
}): Promise<SyncSuppressionsResult> {
  if (!deps.apiKey) {
    throw new Error("syncSendgridSuppressions: apiKey is required");
  }
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new Error("syncSendgridSuppressions: fetch is not available");
  }

  const types = deps.types ?? (["bounces", "blocks", "spam_reports", "invalid_emails"] as const);
  const byType = {
    bounces: 0,
    blocks: 0,
    spam_reports: 0,
    invalid_emails: 0,
  } as Record<SuppressionType, number>;
  let synced = 0;

  for (const type of types) {
    const items = await fetchAllSuppressions(type, deps.apiKey, fetchImpl);
    for (const item of items) {
      if (!item.email) continue;
      await deps.db
        .insert(emailSuppressions)
        .values({
          email: item.email.toLowerCase(),
          reason: item.reason ?? SUPPRESSION_TYPE_TO_REASON[type],
          source: "sendgrid",
        })
        .onConflictDoNothing({ target: emailSuppressions.email });
      emitEmailAudit(deps, {
        eventType: "email.suppression_recorded",
        actorId: null,
        payload: {
          ...emailAddressAuditPayload(item.email),
          providerSuppressionType: type,
          reason: item.reason ?? SUPPRESSION_TYPE_TO_REASON[type],
          source: "sendgrid",
        },
      });
      synced += 1;
      byType[type] += 1;
    }
  }

  return { synced, byType };
}

export type RetryFailedResult = {
  retried: number;
  recovered: number;
  failed: number;
  skipped: number;
};

export type RetryFailedDeps = {
  db: Database;
  defaultFrom: EmailAddress;
  send: SendFn;
  buildUnsubscribeUrl: (identifier: string, category: EmailCategory) => string;
  unsubscribeMailto?: string;
  /** Limit how many rows to process in a single sweep. Default: 50. */
  batchSize?: number;
  rng?: () => number;
  logger?: Pick<Logger, "info" | "warn" | "error">;
  onAudit?: EmailAuditHook;
};

function buildListUnsubscribeHeaders(url: string, mailto?: string): Record<string, string> {
  const parts = [`<${url}>`];
  if (mailto) parts.push(`<mailto:${mailto}>`);
  return {
    "List-Unsubscribe": parts.join(", "),
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

/**
 * Retry deliveries left in `status='failed'` whose backoff window has elapsed
 * and that are still under `MAX_ATTEMPTS`. Reuses the persisted body
 * (`subject`, `html`, `text`) so the orchestrator (auth) doesn't need to be
 * available at retry time. Re-claim is atomic; rows being processed by a
 * concurrent sweeper are skipped.
 */
export async function retryFailedDeliveries(deps: RetryFailedDeps): Promise<RetryFailedResult> {
  const batchSize = Math.max(1, deps.batchSize ?? 50);
  const rng = deps.rng ?? Math.random;
  const now = new Date();

  const candidates = await deps.db
    .select()
    .from(emailDeliveries)
    .where(
      and(
        eq(emailDeliveries.status, "failed"),
        eq(emailDeliveries.providerAccepted, false),
        sql`${emailDeliveries.category} <> 'agenda.routine'`,
        // Payment reminders must recheck the subscription under its lifecycle
        // lock. The dunning job regenerates them with the same delivery key.
        sql`${emailDeliveries.category} <> 'billing.payment-failed'`,
        sql`${emailDeliveries.category} NOT LIKE 'auth.%'`,
        sql`(coalesce(${emailDeliveries.html}, '') <> '' OR coalesce(${emailDeliveries.text}, '') <> '')`,
        lt(emailDeliveries.sendAttempts, MAX_ATTEMPTS),
        or(isNull(emailDeliveries.nextAttemptAt), lte(emailDeliveries.nextAttemptAt, now)),
      ),
    )
    .orderBy(asc(emailDeliveries.nextAttemptAt), asc(emailDeliveries.updatedAt))
    .limit(batchSize);

  let retried = 0;
  let recovered = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of candidates) {
    if (row.sendAttempts >= MAX_ATTEMPTS) {
      skipped += 1;
      continue;
    }

    const nextAttemptAtMs = row.nextAttemptAt ? new Date(row.nextAttemptAt).getTime() : 0;
    if (nextAttemptAtMs > Date.now()) {
      skipped += 1;
      continue;
    }

    if (!row.html && !row.text) {
      safeLog(deps.logger, "warn", "Skipping retry: no body persisted", {
        deliveryId: row.id,
        category: row.category,
      });
      skipped += 1;
      continue;
    }

    const parsedCategory = EmailCategorySchema.safeParse(row.category);
    if (!parsedCategory.success) {
      await deps.db
        .update(emailDeliveries)
        .set({
          status: "failed",
          sendAttempts: MAX_ATTEMPTS,
          lastError: `invalid email category: ${row.category}`,
          nextAttemptAt: null,
          updatedAt: new Date(),
        })
        .where(eq(emailDeliveries.id, row.id));
      emitEmailAudit(deps, {
        eventType: "email.delivery_failed",
        actorId: row.userId,
        payload: {
          deliveryId: row.id,
          category: row.category,
          classification: "permanent",
          reason: `invalid email category: ${row.category}`,
          source: "retry",
        },
      });
      skipped += 1;
      safeLog(deps.logger, "warn", "Skipping retry: invalid category", {
        deliveryId: row.id,
        category: row.category,
      });
      continue;
    }
    const category = parsedCategory.data;

    const block = await findDeliveryBlockReason(deps.db, {
      recipient: row.recipient,
      category,
      userId: row.userId,
    });
    if (block) {
      const marked = await markDeliveryBlocked(deps.db, row.id, block, ["failed"]);
      const reason = marked ? describeDeliveryBlockReason(block) : "claimed by another process";
      if (marked) {
        emitEmailAudit(deps, {
          eventType: "email.delivery_skipped",
          actorId: row.userId,
          payload: {
            deliveryId: row.id,
            category,
            reason,
            source: "retry",
          },
        });
      }
      skipped += 1;
      safeLog(deps.logger, "info", "Email retry skipped by delivery policy", {
        deliveryId: row.id,
        category,
        reason,
      });
      continue;
    }

    const claimed = await deps.db
      .update(emailDeliveries)
      .set({
        status: "sending",
        sendingStartedAt: new Date(),
        sendAttempts: sql`${emailDeliveries.sendAttempts} + 1`,
        nextAttemptAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(emailDeliveries.id, row.id),
          eq(emailDeliveries.status, "failed"),
          eq(emailDeliveries.providerAccepted, false),
        ),
      )
      .returning();

    const claimedRow = claimed[0];
    if (!claimedRow) {
      skipped += 1;
      continue;
    }

    // A global queue must preserve the originating app's signed links/sender.
    // Null values belong to legacy deliveries created before envelope persistence.
    const unsubscribeUrl = row.unsubscribeUrl ?? deps.buildUnsubscribeUrl(row.recipient, category);
    const headers = buildListUnsubscribeHeaders(
      unsubscribeUrl,
      row.unsubscribeUrl ? (row.unsubscribeMailto ?? undefined) : deps.unsubscribeMailto,
    );

    const message: SendgridMessage = {
      to: row.recipient,
      from: row.fromAddress ?? deps.defaultFrom,
      subject: row.subject,
      ...(row.text ? { text: row.text } : {}),
      ...(row.html ? { html: row.html } : {}),
      headers,
      customArgs: {
        delivery_id: row.id,
        informach_category: category,
        ...(row.userId ? { user_id: row.userId } : {}),
      },
      categories: [category],
    };

    try {
      const { messageId } = await deps.send(message);
      await deps.db
        .update(emailDeliveries)
        .set({
          status: sql<string>`case when ${emailDeliveries.status} = 'sending' then 'sent' else ${emailDeliveries.status} end`,
          providerAccepted: true,
          providerMessageId: sql<
            string | null
          >`coalesce(${emailDeliveries.providerMessageId}, ${messageId ?? null})`,
          lastError: sql<
            string | null
          >`case when ${emailDeliveries.status} = 'sending' then null else ${emailDeliveries.lastError} end`,
          nextAttemptAt: sql<Date | null>`case when ${emailDeliveries.status} = 'sending' then null else ${emailDeliveries.nextAttemptAt} end`,
          sentAt: sql<Date>`coalesce(${emailDeliveries.sentAt}, now())`,
          updatedAt: new Date(),
        })
        .where(eq(emailDeliveries.id, row.id));
      retried += 1;
      recovered += 1;
      emitEmailAudit(deps, {
        eventType: "email.delivery_sent",
        actorId: row.userId,
        payload: {
          deliveryId: row.id,
          category,
          providerMessageId: messageId ?? null,
          source: "retry",
        },
      });
      safeLog(deps.logger, "info", "Email retry succeeded", {
        deliveryId: row.id,
        category,
      });
    } catch (error: unknown) {
      const errLike = error as SendgridErrorLike;
      const classification = classifySendgridError(errLike);
      const lastError =
        errLike.message ?? `SendGrid error (status ${errLike.response?.statusCode})`;
      const attempts = claimedRow.sendAttempts || row.sendAttempts + 1;
      const [providerState] = await deps.db
        .select({ providerAccepted: emailDeliveries.providerAccepted })
        .from(emailDeliveries)
        .where(eq(emailDeliveries.id, row.id))
        .limit(1);

      if (providerState?.providerAccepted) {
        await deps.db
          .update(emailDeliveries)
          .set({
            status: sql<string>`case when ${emailDeliveries.status} = 'sending' then 'sent' else ${emailDeliveries.status} end`,
            lastError: sql<
              string | null
            >`case when ${emailDeliveries.status} = 'sending' then null else ${emailDeliveries.lastError} end`,
            nextAttemptAt: sql<Date | null>`case when ${emailDeliveries.status} = 'sending' then null else ${emailDeliveries.nextAttemptAt} end`,
            sentAt: sql<Date>`coalesce(${emailDeliveries.sentAt}, now())`,
            updatedAt: new Date(),
          })
          .where(eq(emailDeliveries.id, row.id));
        retried += 1;
        recovered += 1;
        continue;
      }

      await deps.db
        .update(emailDeliveries)
        .set({
          status: "failed",
          ...(classification === "permanent" ? { sendAttempts: MAX_ATTEMPTS } : {}),
          lastError,
          nextAttemptAt:
            classification === "transient"
              ? new Date(Date.now() + nextAttemptDelaySeconds(attempts, rng) * 1000)
              : null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(emailDeliveries.id, row.id),
            eq(emailDeliveries.status, "sending"),
            eq(emailDeliveries.providerAccepted, false),
          ),
        );

      retried += 1;
      failed += 1;
      emitEmailAudit(deps, {
        eventType: "email.delivery_failed",
        actorId: row.userId,
        payload: {
          deliveryId: row.id,
          category,
          classification,
          reason: lastError,
          source: "retry",
        },
      });

      safeLog(deps.logger, "warn", "Email retry failed", {
        deliveryId: row.id,
        category,
        classification,
        reason: lastError,
      });
    }
  }

  return { retried, recovered, failed, skipped };
}
