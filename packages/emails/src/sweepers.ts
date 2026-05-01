import type { Database } from "@informach/db";
import { emailDeliveries, emailSuppressions } from "@informach/db/schema";
import { and, eq, lt } from "drizzle-orm";

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
