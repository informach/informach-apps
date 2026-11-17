import { sql } from "drizzle-orm";
import { check, integer, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { billing, customers } from "./billing";
import { users } from "./core";

/** Durable proof that an irreversible web closure settled one Compasso customer.
 * This is a financial receipt, never authority to initiate a closure. The account
 * coordinator owns consent/leases; billing revalidates frozen actor and scope. */
export const collectionClosureReceipts = billing.table(
  "collection_closure_receipts",
  {
    operationId: uuid("operation_id").notNull(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "restrict" }),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    frozenRevision: integer("frozen_revision").notNull(),
    scopeFingerprint: text("scope_fingerprint").notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({
      name: "collection_closure_receipt_scope_pk",
      columns: [t.operationId, t.customerId, t.scopeFingerprint],
    }),
    check("collection_closure_revision", sql`${t.frozenRevision} > 0`),
    check("collection_closure_fingerprint", sql`${t.scopeFingerprint} ~ '^[a-f0-9]{64}$'`),
  ],
);
