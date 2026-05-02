import type { Database } from "@informach/db";
import { customers as customersTable } from "@informach/db/schema";
import { and, eq } from "drizzle-orm";
import { CustomerNotFoundError, OrganizationsDisabledError } from "./errors";
import { type Logger, safeLog } from "./logger";
import type { BillingProviderClient } from "./providers";
import type { BillingProvider, PortalSessionInput } from "./types";

export type PortalDeps = {
  db: Database;
  provider: BillingProvider;
  providerClient: BillingProviderClient;
  organizationsEnabled: boolean;
  logger?: Logger;
};

/**
 * Generates a Stripe Billing Portal session URL for the given subject. The user
 * lands on the Stripe-hosted portal where they can update payment method, view
 * invoices, change plan or cancel — all without leaving Stripe.
 *
 * The portal needs a customer that already exists locally; we don't auto-create
 * here because the only path that reaches the portal is "user already bought
 * something" → customer was created by checkout flow.
 */
export async function createPortalSession(
  deps: PortalDeps,
  input: PortalSessionInput,
): Promise<{ url: string }> {
  if (input.subject.type === "organization" && !deps.organizationsEnabled) {
    throw new OrganizationsDisabledError();
  }

  const rows = await deps.db
    .select({ providerCustomerId: customersTable.providerCustomerId })
    .from(customersTable)
    .where(
      and(
        eq(customersTable.provider, deps.provider),
        eq(customersTable.subjectType, input.subject.type),
        eq(customersTable.subjectId, input.subject.id),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) {
    throw new CustomerNotFoundError(input.subject.type, input.subject.id);
  }

  const session = await deps.providerClient.createPortalSession({
    customerId: row.providerCustomerId,
    returnUrl: input.returnUrl,
  });

  safeLog(deps.logger, "info", "billing.portal.session_created", {
    subjectType: input.subject.type,
    subjectId: input.subject.id,
  });
  return { url: session.url };
}
