import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { account } from "./account";
import { users } from "./core";

/** Domain-owned selection digest and public indicators, never names or content. */
export type WebClosurePlan = {
  version: 1;
  fingerprint: string;
  personalRecords: number;
  sharedRecords: number;
  credentials: number;
  blockers: (
    | "responsibilities"
    | "pending_operations"
    | "financial_review"
    | "changed_authority"
  )[];
};

export const accountWebClosures = account.table(
  "web_closures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    scope: text("scope").notNull().default("compasso-web"),
    // Provenance, not an FK: the short-lived review cache keeps its own retention.
    sourceReviewId: uuid("source_review_id").notNull(),
    catalog: jsonb("catalog").$type<string[]>().notNull(),
    frozenRevision: integer("frozen_revision").notNull(),
    planRevision: integer("plan_revision").notNull().default(1),
    state: text("state", {
      enum: [
        "preparing",
        "ready",
        "executing",
        "paused",
        "repreparing",
        "review_required",
        "finalizing",
        "resuming",
        "completed",
        "cancelled",
      ],
    })
      .notNull()
      .default("preparing"),
    consentDigest: text("consent_digest"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("account_web_closure_actor").on(t.actorId).where(sql`${t.state} <> 'cancelled'`),
    index("account_web_closure_finalization").on(t.state, t.createdAt, t.id),
    check("account_web_closure_scope", sql`${t.scope} = 'compasso-web'`),
    check("account_web_closure_revision", sql`${t.frozenRevision} > 0`),
    check("account_web_closure_plan_revision", sql`${t.planRevision} > 0`),
    check(
      "account_web_closure_catalog",
      sql`jsonb_typeof(${t.catalog}) = 'array' and jsonb_array_length(${t.catalog}) between 1 and 64 and octet_length(${t.catalog}::text) <= 8192`,
    ),
    check(
      "account_web_closure_state",
      sql`${t.state} in ('preparing','ready','executing','paused','repreparing','review_required','finalizing','resuming','completed','cancelled')`,
    ),
    check(
      "account_web_closure_consent",
      sql`(
    (${t.state} in ('preparing','ready','resuming','cancelled') and ${t.consentDigest} is null and ${t.confirmedAt} is null)
    or (${t.state} in ('executing','paused','repreparing','review_required','finalizing','completed') and ${t.consentDigest} is not null and ${t.consentDigest} ~ '^[a-f0-9]{64}$' and ${t.confirmedAt} is not null)
  )`,
    ),
    check(
      "account_web_closure_completion",
      sql`(${t.completedAt} is not null) = (${t.state} in ('completed','cancelled'))`,
    ),
  ],
);

/** Immutable metadata of each explicit consent, including the plans it covered. */
export const accountWebClosureConsents = account.table(
  "web_closure_consents",
  {
    closureId: uuid("closure_id")
      .notNull()
      .references(() => accountWebClosures.id, { onDelete: "restrict" }),
    revision: integer("revision").notNull(),
    digest: text("digest").notNull(),
    plans: jsonb("plans").$type<{ domain: string; plan: WebClosurePlan }[]>().notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.closureId, t.revision] }),
    check("account_web_closure_consent_revision", sql`${t.revision} > 0`),
    check("account_web_closure_consent_digest", sql`${t.digest} ~ '^[a-f0-9]{64}$'`),
    check(
      "account_web_closure_consent_plans",
      sql`jsonb_typeof(${t.plans}) = 'array' and jsonb_array_length(${t.plans}) between 3 and 66 and octet_length(${t.plans}::text) <= 262144`,
    ),
  ],
);

export const accountWebClosureSteps = account.table(
  "web_closure_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    closureId: uuid("closure_id")
      .notNull()
      .references(() => accountWebClosures.id, { onDelete: "restrict" }),
    domain: text("domain").notNull(),
    phase: text("phase", { enum: ["prepare", "erase", "resume"] }).notNull(),
    state: text("state", { enum: ["queued", "running", "done", "cancelled"] })
      .notNull()
      .default("queued"),
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
    leaseToken: uuid("lease_token"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    plan: jsonb("plan").$type<WebClosurePlan>(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    lastError: text("last_error", { enum: ["step_failed", "scope_changed"] }),
  },
  (t) => [
    uniqueIndex("account_web_closure_step_phase").on(t.closureId, t.domain, t.phase),
    index("account_web_closure_step_due").on(t.domain, t.availableAt, t.id),
    check(
      "account_web_closure_step_domain",
      sql`${t.domain} in ('family','billing') or ${t.domain} ~ '^app:[a-z0-9][a-z0-9-]{0,79}$'`,
    ),
    check("account_web_closure_step_phase", sql`${t.phase} in ('prepare','erase','resume')`),
    check("account_web_closure_step_attempts", sql`${t.attempts} >= 0`),
    check("account_web_closure_step_error", sql`${t.lastError} in ('step_failed','scope_changed')`),
    check(
      "account_web_closure_step_state",
      sql`(
    (${t.state} = 'queued' and ${t.leaseToken} is null and ${t.leaseUntil} is null and ${t.completedAt} is null)
    or (${t.state} = 'running' and ${t.leaseToken} is not null and ${t.leaseUntil} is not null and ${t.completedAt} is null)
    or (${t.state} = 'done' and ${t.leaseToken} is null and ${t.leaseUntil} is null and ${t.completedAt} is not null)
    or (${t.state} = 'cancelled' and ${t.leaseToken} is null and ${t.leaseUntil} is null and ${t.completedAt} is not null)
  )`,
    ),
    check(
      "account_web_closure_step_plan",
      sql`(
    (${t.phase} = 'prepare' and ${t.state} = 'done' and ${t.plan} is not null)
    or ((${t.phase} <> 'prepare' or ${t.state} <> 'done') and ${t.plan} is null)
  ) and (${t.plan} is null or (jsonb_typeof(${t.plan}) = 'object' and octet_length(${t.plan}::text) <= 2048))`,
    ),
  ],
);
