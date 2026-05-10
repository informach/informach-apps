import type { Database } from "@informach/db";
import { customers } from "@informach/db/schema";
import { and, eq } from "drizzle-orm";
import { OrganizationsDisabledError } from "./errors";
import { type Logger, safeLog } from "./logger";
import type { BillingProviderClient } from "./providers";
import type { BillingProvider, SubjectRef } from "./types";

export type GetOrCreateCustomerInput = {
  subject: SubjectRef;
  email: string;
  metadata?: Record<string, string>;
};

export type GetOrCreateCustomerResult = {
  customerId: string;
  providerCustomerId: string;
  isNew: boolean;
};

export type GetOrCreateCustomerDeps = {
  db: Database;
  provider: BillingProvider;
  providerClient: BillingProviderClient;
  organizationsEnabled: boolean;
  /** App slug — escopo de isolamento no `billing.customers.app`. */
  app: string;
  logger?: Logger;
};

/**
 * Idempotent: returns the existing local customer row for (provider, subject, app)
 * or creates one via the provider + persists it. Safe to call concurrently —
 * insert uses (provider, subject_type, subject_id, app) UNIQUE.
 */
export async function getOrCreateCustomer(
  deps: GetOrCreateCustomerDeps,
  input: GetOrCreateCustomerInput,
): Promise<GetOrCreateCustomerResult> {
  if (input.subject.type === "organization" && !deps.organizationsEnabled) {
    throw new OrganizationsDisabledError();
  }

  const existing = await deps.db
    .select({
      id: customers.id,
      providerCustomerId: customers.providerCustomerId,
    })
    .from(customers)
    .where(
      and(
        eq(customers.provider, deps.provider),
        eq(customers.subjectType, input.subject.type),
        eq(customers.subjectId, input.subject.id),
        eq(customers.app, deps.app),
      ),
    )
    .limit(1);

  if (existing.length > 0 && existing[0]) {
    const row = existing[0];
    return {
      customerId: row.id,
      providerCustomerId: row.providerCustomerId,
      isNew: false,
    };
  }

  const providerCustomer = await deps.providerClient.createCustomer({
    email: input.email,
    subject: input.subject,
    metadata: input.metadata,
    idempotencyKey: `customer:${deps.provider}:${deps.app}:${input.subject.type}:${input.subject.id}`,
  });

  const inserted = await deps.db
    .insert(customers)
    .values({
      provider: deps.provider,
      providerCustomerId: providerCustomer.id,
      subjectType: input.subject.type,
      subjectId: input.subject.id,
      app: deps.app,
      email: providerCustomer.email,
      metadata: input.metadata ?? {},
    })
    .onConflictDoNothing({
      target: [customers.provider, customers.subjectType, customers.subjectId, customers.app],
    })
    .returning({
      id: customers.id,
      providerCustomerId: customers.providerCustomerId,
    });

  if (inserted.length > 0 && inserted[0]) {
    safeLog(deps.logger, "info", "billing.customer.created", {
      provider: deps.provider,
      app: deps.app,
      subjectType: input.subject.type,
      subjectId: input.subject.id,
      providerCustomerId: providerCustomer.id,
    });
    const row = inserted[0];
    return {
      customerId: row.id,
      providerCustomerId: row.providerCustomerId,
      isNew: true,
    };
  }

  // Conflict: another concurrent caller won the race. Read back the winner row.
  const reread = await deps.db
    .select({
      id: customers.id,
      providerCustomerId: customers.providerCustomerId,
    })
    .from(customers)
    .where(
      and(
        eq(customers.provider, deps.provider),
        eq(customers.subjectType, input.subject.type),
        eq(customers.subjectId, input.subject.id),
        eq(customers.app, deps.app),
      ),
    )
    .limit(1);

  if (reread.length > 0 && reread[0]) {
    safeLog(deps.logger, "debug", "billing.customer.conflict_resolved", {
      provider: deps.provider,
      app: deps.app,
      subjectType: input.subject.type,
      subjectId: input.subject.id,
    });
    const row = reread[0];
    return {
      customerId: row.id,
      providerCustomerId: row.providerCustomerId,
      isNew: false,
    };
  }

  // Should never happen: insert returned 0 rows AND select after returned 0 rows.
  throw new Error(
    `@informach/billing: failed to upsert customer for ${input.subject.type}:${input.subject.id} in app ${deps.app}`,
  );
}
