import {
  bigint,
  boolean,
  index,
  integer,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const core = pgSchema("core");

export const users = core.table(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    role: text("role").default("member").notNull(),
    banned: boolean("banned").default(false).notNull(),
    banReason: text("ban_reason"),
    banExpiresAt: timestamp("ban_expires_at", { withTimezone: true }),
    twoFactorEnabled: boolean("two_factor_enabled").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("users_role_idx").on(t.role)],
);

export const sessions = core.table(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    role: text("role"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("sessions_user_id_idx").on(t.userId),
    index("sessions_expires_at_idx").on(t.expiresAt),
  ],
);

export const accounts = core.table(
  "accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    password: text("password"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("accounts_user_id_idx").on(t.userId)],
);

export const verifications = core.table(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("verifications_identifier_idx").on(t.identifier),
    index("verifications_expires_at_idx").on(t.expiresAt),
  ],
);

export const rateLimit = core.table(
  "rate_limit",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull(),
    count: integer("count").notNull().default(0),
    lastRequest: bigint("last_request", { mode: "number" }),
  },
  (t) => [index("rate_limit_key_idx").on(t.key)],
);

export const organizations = core.table(
  "organizations",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    logo: text("logo"),
    metadata: text("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("organizations_slug_idx").on(t.slug)],
);

export const members = core.table(
  "members",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("members_user_org_uniq").on(t.userId, t.organizationId),
    index("members_organization_id_idx").on(t.organizationId),
  ],
);

export const passkeys = core.table(
  "passkeys",
  {
    id: text("id").primaryKey(),
    name: text("name"),
    publicKey: text("public_key").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    credentialID: text("credential_id").notNull(),
    counter: integer("counter").notNull().default(0),
    deviceType: text("device_type").notNull(),
    backedUp: boolean("backed_up").notNull().default(false),
    transports: text("transports"),
    aaguid: text("aaguid"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("passkeys_user_id_idx").on(t.userId),
    index("passkeys_credential_id_idx").on(t.credentialID),
  ],
);

export const twoFactors = core.table(
  "two_factors",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    verified: boolean("verified").notNull().default(false),
  },
  (t) => [index("two_factors_user_id_idx").on(t.userId)],
);

export const invitations = core.table(
  "invitations",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    role: text("role"),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("invitations_organization_id_idx").on(t.organizationId),
    index("invitations_email_idx").on(t.email),
    index("invitations_status_idx").on(t.status),
  ],
);

export const emailDeliveries = core.table(
  "email_deliveries",
  {
    id: text("id").primaryKey(),
    recipient: text("recipient").notNull(),
    category: text("category").notNull(),
    messageKey: text("message_key").notNull(),
    subject: text("subject").notNull(),
    html: text("html"),
    text: text("text"),
    provider: text("provider").notNull().default("sendgrid"),
    providerMessageId: text("provider_message_id"),
    status: text("status").notNull().default("pending"),
    providerAccepted: boolean("provider_accepted").notNull().default(false),
    sendAttempts: integer("send_attempts").notNull().default(0),
    lastError: text("last_error"),
    sendingStartedAt: timestamp("sending_started_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    userId: text("user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("email_deliveries_category_key_uniq").on(t.category, t.messageKey),
    index("email_deliveries_status_next_attempt_idx").on(t.status, t.nextAttemptAt),
    index("email_deliveries_sending_started_idx").on(t.sendingStartedAt),
    index("email_deliveries_provider_message_id_idx").on(t.providerMessageId),
  ],
);

export const emailUnsubscribes = core.table(
  "email_unsubscribes",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.category] })],
);

export const emailSuppressions = core.table("email_suppressions", {
  email: text("email").primaryKey(),
  reason: text("reason").notNull(),
  source: text("source").notNull().default("sendgrid"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type Verification = typeof verifications.$inferSelect;
export type NewVerification = typeof verifications.$inferInsert;
export type RateLimit = typeof rateLimit.$inferSelect;
export type NewRateLimit = typeof rateLimit.$inferInsert;
export type Organization = typeof organizations.$inferSelect;
export type NewOrganization = typeof organizations.$inferInsert;
export type Member = typeof members.$inferSelect;
export type NewMember = typeof members.$inferInsert;
export type Invitation = typeof invitations.$inferSelect;
export type NewInvitation = typeof invitations.$inferInsert;
export type Passkey = typeof passkeys.$inferSelect;
export type NewPasskey = typeof passkeys.$inferInsert;
export type TwoFactor = typeof twoFactors.$inferSelect;
export type NewTwoFactor = typeof twoFactors.$inferInsert;
export type EmailDelivery = typeof emailDeliveries.$inferSelect;
export type NewEmailDelivery = typeof emailDeliveries.$inferInsert;
export type EmailUnsubscribe = typeof emailUnsubscribes.$inferSelect;
export type NewEmailUnsubscribe = typeof emailUnsubscribes.$inferInsert;
export type EmailSuppression = typeof emailSuppressions.$inferSelect;
export type NewEmailSuppression = typeof emailSuppressions.$inferInsert;
