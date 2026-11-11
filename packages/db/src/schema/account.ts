import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./core";

export const account = pgSchema("account");

/** Read-only assessments. These records are never authorization for erasure. */
export const accountDepartureReviews = account.table(
  "departure_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    scope: text("scope").notNull().default("compasso-web"),
    state: text("state", { enum: ["collecting", "ready", "cancelled"] })
      .notNull()
      .default("collecting"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("account_departure_review_expired").on(t.expiresAt, t.id),
    uniqueIndex("account_departure_review_active")
      .on(t.actorId)
      .where(sql`${t.state} <> 'cancelled'`),
    check("account_departure_review_scope", sql`${t.scope} = 'compasso-web'`),
    check(
      "account_departure_review_state",
      sql`${t.state} in ('collecting', 'ready', 'cancelled')`,
    ),
    check("account_departure_review_expiry", sql`${t.expiresAt} > ${t.createdAt}`),
  ],
);

export const accountDepartureAssessments = account.table(
  "departure_assessments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => accountDepartureReviews.id, { onDelete: "restrict" }),
    app: text("app").notNull(),
    state: text("state", { enum: ["queued", "running", "done"] })
      .notNull()
      .default("queued"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    leaseToken: uuid("lease_token"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    result: jsonb("result").$type<{
      version: 1;
      hasPersonalData: boolean;
      hasSharedData: boolean;
      activeCredentials: number;
      managedProfiles: number;
      sharedProfiles: number;
      pendingOperations: number;
    }>(),
    observedAt: timestamp("observed_at", { withTimezone: true }),
    lastError: text("last_error", { enum: ["assessment_failed"] }),
  },
  (t) => [
    uniqueIndex("account_departure_assessment_app").on(t.reviewId, t.app),
    index("account_departure_assessment_due").on(t.app, t.availableAt, t.id),
    check("account_departure_assessment_app_length", sql`length(${t.app}) between 1 and 80`),
    check("account_departure_assessment_attempts", sql`${t.attempts} >= 0`),
    check("account_departure_assessment_error", sql`${t.lastError} = 'assessment_failed'`),
    check(
      "account_departure_assessment_state",
      sql`(
        (${t.state} = 'queued' and ${t.leaseToken} is null and ${t.leaseUntil} is null and ${t.result} is null and ${t.observedAt} is null)
        or (${t.state} = 'running' and ${t.leaseToken} is not null and ${t.leaseUntil} is not null and ${t.result} is null and ${t.observedAt} is null)
        or (${t.state} = 'done' and ${t.leaseToken} is null and ${t.leaseUntil} is null and ${t.result} is not null and ${t.observedAt} is not null)
      )`,
    ),
    check(
      "account_departure_assessment_result",
      sql`${t.result} is null or (jsonb_typeof(${t.result}) = 'object' and octet_length(${t.result}::text) <= 1024)`,
    ),
  ],
);
