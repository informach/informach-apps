import type { Database } from "@informach/db";
import { emailDeliveries, emailSuppressions } from "@informach/db/schema";
import { and, eq, lt, sql } from "drizzle-orm";
import type { EmailAddress, EmailCategory, SendFn, SendgridMessage } from "./dispatch";
import {
  classifySendgridError,
  MAX_ATTEMPTS,
  nextAttemptDelaySeconds,
  type SendgridErrorLike,
} from "./retry";

const STALE_AFTER_MS = 30 * 60 * 1000;

export type RecoverResult = { recovered: number };

export async function recoverStaleDeliveries(deps: {
  db: Database;
  staleAfterMs?: number;
}): Promise<RecoverResult> {
  const cutoff = new Date(Date.now() - (deps.staleAfterMs ?? STALE_AFTER_MS));

  const recovered = await deps.db
    .update(emailDeliveries)
    .set({ status: "unknown", updatedAt: new Date() })
    .where(and(eq(emailDeliveries.status, "sending"), lt(emailDeliveries.sendingStartedAt, cutoff)))
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
  logger?: {
    info?: (msg: string, ctx?: object) => void;
    warn?: (msg: string, ctx?: object) => void;
    error?: (msg: string, ctx?: object) => void;
  };
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
  const now = Date.now();

  const candidates = await deps.db
    .select()
    .from(emailDeliveries)
    .where(eq(emailDeliveries.status, "failed"))
    .limit(batchSize);

  let retried = 0;
  let recovered = 0;
  let failed = 0;
  let skipped = 0;

  for (const row of candidates as Array<{
    id: string;
    recipient: string;
    category: string;
    messageKey: string;
    subject: string;
    html: string | null;
    text: string | null;
    sendAttempts: number;
    updatedAt: Date | string;
    userId: string | null;
  }>) {
    if (row.sendAttempts >= MAX_ATTEMPTS) {
      skipped += 1;
      continue;
    }

    const updatedAtMs =
      typeof row.updatedAt === "string"
        ? new Date(row.updatedAt).getTime()
        : row.updatedAt.getTime();
    const minWaitMs = nextAttemptDelaySeconds(row.sendAttempts || 1, rng) * 1000;
    if (now - updatedAtMs < minWaitMs) {
      skipped += 1;
      continue;
    }

    if (!row.html && !row.text) {
      deps.logger?.warn?.("Skipping retry: no body persisted", {
        deliveryId: row.id,
        category: row.category,
      });
      skipped += 1;
      continue;
    }

    const claimed = await deps.db
      .update(emailDeliveries)
      .set({
        status: "sending",
        sendingStartedAt: new Date(),
        sendAttempts: sql`${emailDeliveries.sendAttempts} + 1`,
        updatedAt: new Date(),
      })
      .where(and(eq(emailDeliveries.id, row.id), eq(emailDeliveries.status, "failed")))
      .returning();

    if ((claimed as unknown[]).length === 0) {
      skipped += 1;
      continue;
    }

    const unsubscribeUrl = deps.buildUnsubscribeUrl(row.recipient, row.category as EmailCategory);
    const headers = buildListUnsubscribeHeaders(unsubscribeUrl, deps.unsubscribeMailto);

    const message: SendgridMessage = {
      to: row.recipient,
      from: deps.defaultFrom,
      subject: row.subject,
      ...(row.text ? { text: row.text } : {}),
      ...(row.html ? { html: row.html } : {}),
      headers,
      customArgs: {
        delivery_id: row.id,
        category: row.category,
        ...(row.userId ? { user_id: row.userId } : {}),
      },
    };

    try {
      const { messageId } = await deps.send(message);
      await deps.db
        .update(emailDeliveries)
        .set({
          status: "sent",
          providerAccepted: true,
          providerMessageId: messageId ?? null,
          sentAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(emailDeliveries.id, row.id));
      retried += 1;
      recovered += 1;
      deps.logger?.info?.("Email retry succeeded", {
        deliveryId: row.id,
        category: row.category,
      });
    } catch (error: unknown) {
      const errLike = error as SendgridErrorLike;
      const classification = classifySendgridError(errLike);
      const lastError =
        errLike.message ?? `SendGrid error (status ${errLike.response?.statusCode})`;

      await deps.db
        .update(emailDeliveries)
        .set({
          status: "failed",
          lastError,
          updatedAt: new Date(),
        })
        .where(eq(emailDeliveries.id, row.id));

      retried += 1;
      failed += 1;

      deps.logger?.warn?.("Email retry failed", {
        deliveryId: row.id,
        category: row.category,
        classification,
        reason: lastError,
      });
    }
  }

  return { retried, recovered, failed, skipped };
}
