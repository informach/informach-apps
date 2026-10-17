import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
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
import { customers, subscriptions } from "./billing";
import { users } from "./core";

export const edi = pgSchema("edi");
// Attempt scheduling is separate from entitlement freshness: failed provider
// reads must never make unverified payment data look current.
export const ediBillingReconciliations = edi.table(
  "billing_reconciliations",
  {
    customerId: uuid("customer_id")
      .primaryKey()
      .references(() => customers.id, { onDelete: "cascade" }),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull().defaultNow(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    failures: integer("failures").notNull().default(0),
  },
  (t) => [
    index("edi_billing_reconciliations_due_idx").on(t.nextAttemptAt, t.customerId),
    check("edi_billing_reconciliations_failures_chk", sql`${t.failures} >= 0`),
  ],
);
export const ediRequestNonces = edi.table(
  "request_nonces",
  {
    nonce: uuid("nonce").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("edi_request_nonces_user_idx").on(t.userId),
    index("edi_request_nonces_expiry_idx").on(t.expiresAt),
  ],
);
export const ediDevices = edi.table(
  "devices",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    publicKeySpki: text("public_key_spki").notNull(),
    keyThumbprint: text("key_thumbprint").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("edi_devices_user_idx").on(t.userId),
    uniqueIndex("edi_devices_key_uniq").on(t.keyThumbprint),
    check("edi_devices_name_chk", sql`length(${t.name}) between 1 and 80`),
    check("edi_devices_thumbprint_chk", sql`${t.keyThumbprint} ~ '^[a-f0-9]{64}$'`),
  ],
);

export const ediActivations = edi.table(
  "activations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => ediDevices.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull().default(0),
    activatedAt: timestamp("activated_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    index("edi_activations_device_idx").on(t.deviceId),
    uniqueIndex("edi_activations_live_device_uniq")
      .on(t.deviceId)
      .where(sql`${t.revokedAt} is null`),
    check("edi_activations_revision_chk", sql`${t.revision} >= 0`),
  ],
);

export const ediDeviceSessions = edi.table(
  "device_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    activationId: uuid("activation_id")
      .notNull()
      .references(() => ediActivations.id, { onDelete: "cascade" }),
    oauthGrantId: text("oauth_grant_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    index("edi_sessions_activation_idx").on(t.activationId),
    uniqueIndex("edi_sessions_grant_uniq").on(t.oauthGrantId),
    index("edi_sessions_expiry_idx").on(t.expiresAt),
  ],
);

// Rebuildable projection; billing owns subscriptions and immutable payment facts.
export const ediEntitlements = edi.table(
  "entitlements",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    subscriptionId: uuid("subscription_id").references(() => subscriptions.id, {
      onDelete: "set null",
    }),
    paidThrough: timestamp("paid_through", { withTimezone: true }),
    suspended: boolean("suspended").notNull().default(false),
    revision: integer("revision").notNull().default(0),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("edi_entitlements_subscription_idx").on(t.subscriptionId),
    check("edi_entitlements_revision_chk", sql`${t.revision} >= 0`),
  ],
);

export const ediReleases = edi.table(
  "releases",
  {
    version: text("version").primaryKey(),
    channel: text("channel", { enum: ["stable", "beta"] }).notNull(),
    manifest: jsonb("manifest").$type<Record<string, unknown>>().notNull(),
    manifestSha256: text("manifest_sha256").notNull(),
    sourceCommit: text("source_commit").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
  },
  (t) => [check("edi_releases_channel_chk", sql`${t.channel} in ('stable', 'beta')`)],
);

export const ediReleaseArtifacts = edi.table(
  "release_artifacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    version: text("version")
      .notNull()
      .references(() => ediReleases.version, { onDelete: "restrict" }),
    appId: text("app_id").notNull(),
    arch: text("arch").notNull().default("x64"),
    platform: text("platform").notNull().default("win32"),
    url: text("url").notNull(),
    sha512: text("sha512").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    publisher: text("publisher").notNull(),
  },
  (t) => [
    uniqueIndex("edi_artifacts_target_uniq").on(t.version, t.appId, t.platform, t.arch),
    check("edi_artifacts_target_chk", sql`${t.platform} = 'win32' and ${t.arch} = 'x64'`),
    check("edi_artifacts_size_chk", sql`${t.size} > 0 and ${t.size} <= 9007199254740991`),
    check(
      "edi_artifacts_app_chk",
      sql`${t.appId} in ('edi-hub', 'ediaula', 'edicaptura', 'edifoto', 'edipdf', 'edisvg')`,
    ),
  ],
);

export const ediReleaseChannels = edi.table(
  "release_channels",
  {
    channel: text("channel", { enum: ["stable", "beta"] }).primaryKey(),
    version: text("version")
      .notNull()
      .references(() => ediReleases.version, { onDelete: "restrict" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("edi_channels_version_idx").on(t.version),
    check("edi_channels_name_chk", sql`${t.channel} in ('stable', 'beta')`),
  ],
);

export const ediOutbox = edi.table(
  "outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dedupeKey: text("dedupe_key").notNull(),
    kind: text("kind", {
      enum: ["reconcile_entitlement", "revoke_device", "release_published"],
    }).notNull(),
    subjectId: text("subject_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    attempts: integer("attempts").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("edi_outbox_dedupe_uniq").on(t.dedupeKey),
    index("edi_outbox_pending_idx").on(t.availableAt).where(sql`${t.processedAt} is null`),
    check(
      "edi_outbox_kind_chk",
      sql`${t.kind} in ('reconcile_entitlement', 'revoke_device', 'release_published')`,
    ),
    check("edi_outbox_attempts_chk", sql`${t.attempts} >= 0`),
  ],
);
