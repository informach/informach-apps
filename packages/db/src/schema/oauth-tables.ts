import { boolean, index, integer, jsonb, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { core, sessions, users } from "./core";

// One schema contract, separate persistence for the desktop and web issuers.
export function createOAuthTables(prefix: "oauth" | "sso") {
  // Field names follow the installed Better Auth 1.7 OAuth/JWT plugin schemas.
  const oauthJwks = core.table(`${prefix}_jwks`, {
    id: text("id").primaryKey(),
    publicKey: text("public_key").notNull(),
    privateKey: text("private_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    alg: text("alg"),
    crv: text("crv"),
  });
  const oauthClients = core.table(
    `${prefix}_clients`,
    {
      id: text("id").primaryKey(),
      clientId: text("client_id").notNull().unique(),
      clientSecret: text("client_secret"),
      clientDiscoveryId: text("client_discovery_id"),
      disabled: boolean("disabled").default(false),
      skipConsent: boolean("skip_consent"),
      enableEndSession: boolean("enable_end_session"),
      subjectType: text("subject_type"),
      scopes: text("scopes").array(),
      clientCredentialsScopes: text("client_credentials_scopes").array().default([]),
      userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
      createdAt: timestamp("created_at", { withTimezone: true }),
      updatedAt: timestamp("updated_at", { withTimezone: true }),
      name: text("name"),
      uri: text("uri"),
      icon: text("icon"),
      contacts: text("contacts").array(),
      tos: text("tos"),
      policy: text("policy"),
      softwareId: text("software_id"),
      softwareVersion: text("software_version"),
      softwareStatement: text("software_statement"),
      redirectUris: text("redirect_uris").array().notNull(),
      postLogoutRedirectUris: text("post_logout_redirect_uris").array(),
      backchannelLogoutUri: text("backchannel_logout_uri"),
      backchannelLogoutSessionRequired: boolean("backchannel_logout_session_required"),
      tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
      applicationType: text("application_type"),
      jwks: text("jwks"),
      jwksUri: text("jwks_uri"),
      grantTypes: text("grant_types").array(),
      responseTypes: text("response_types").array(),
      requirePKCE: boolean("require_pkce"),
      dpopBoundAccessTokens: boolean("dpop_bound_access_tokens").default(false),
      referenceId: text("reference_id"),
      metadata: jsonb("metadata"),
    },
    (t) => [index(`${prefix}_clients_user_idx`).on(t.userId)],
  );
  const oauthResources = core.table(`${prefix}_resources`, {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull().unique(),
    name: text("name").notNull(),
    accessTokenTtl: integer("access_token_ttl"),
    refreshTokenTtl: integer("refresh_token_ttl"),
    signingAlgorithm: text("signing_algorithm"),
    signingKeyId: text("signing_key_id"),
    allowedScopes: text("allowed_scopes").array(),
    customClaims: jsonb("custom_claims"),
    dpopBoundAccessTokensRequired: boolean("dpop_bound_access_tokens_required").default(false),
    disabled: boolean("disabled").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    policyVersion: integer("policy_version").default(1),
    metadata: jsonb("metadata"),
  });
  const oauthClientResources = core.table(
    `${prefix}_client_resources`,
    {
      id: text("id").primaryKey(),
      clientId: text("client_id")
        .notNull()
        .references(() => oauthClients.clientId, { onDelete: "cascade" }),
      resourceId: text("resource_id")
        .notNull()
        .references(() => oauthResources.identifier, { onDelete: "cascade" }),
      metadata: jsonb("metadata"),
      createdAt: timestamp("created_at", { withTimezone: true }),
    },
    (t) => [
      uniqueIndex(`${prefix}_client_resource_uniq`).on(t.clientId, t.resourceId),
      index(`${prefix}_client_resource_resource_idx`).on(t.resourceId),
    ],
  );
  const oauthRefreshTokens = core.table(
    `${prefix}_refresh_tokens`,
    {
      id: text("id").primaryKey(),
      token: text("token").notNull().unique(),
      clientId: text("client_id")
        .notNull()
        .references(() => oauthClients.clientId, { onDelete: "cascade" }),
      sessionId: text("session_id").references(() => sessions.id, { onDelete: "set null" }),
      userId: text("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
      referenceId: text("reference_id"),
      authorizationCodeId: text("authorization_code_id"),
      resources: text("resources").array(),
      requestedUserInfoClaims: text("requested_user_info_claims").array(),
      expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
      revoked: timestamp("revoked", { withTimezone: true }),
      rotatedAt: timestamp("rotated_at", { withTimezone: true }),
      rotationReplayResponse: text("rotation_replay_response"),
      rotationReplayExpiresAt: timestamp("rotation_replay_expires_at", { withTimezone: true }),
      authTime: timestamp("auth_time", { withTimezone: true }),
      confirmation: jsonb("confirmation"),
      scopes: text("scopes").array().notNull(),
    },
    (t) => [
      index(`${prefix}_refresh_client_idx`).on(t.clientId),
      index(`${prefix}_refresh_user_idx`).on(t.userId),
      index(`${prefix}_refresh_session_idx`).on(t.sessionId),
      index(`${prefix}_refresh_code_idx`).on(t.authorizationCodeId),
      index(`${prefix}_refresh_expiry_idx`).on(t.expiresAt),
    ],
  );
  const oauthAccessTokens = core.table(
    `${prefix}_access_tokens`,
    {
      id: text("id").primaryKey(),
      token: text("token").notNull().unique(),
      clientId: text("client_id")
        .notNull()
        .references(() => oauthClients.clientId, { onDelete: "cascade" }),
      sessionId: text("session_id").references(() => sessions.id, { onDelete: "set null" }),
      userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
      referenceId: text("reference_id"),
      authorizationCodeId: text("authorization_code_id"),
      resources: text("resources").array(),
      requestedUserInfoClaims: text("requested_user_info_claims").array(),
      refreshId: text("refresh_id").references(() => oauthRefreshTokens.id, {
        onDelete: "cascade",
      }),
      expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
      revoked: timestamp("revoked", { withTimezone: true }),
      confirmation: jsonb("confirmation"),
      scopes: text("scopes").array().notNull(),
    },
    (t) => [
      index(`${prefix}_access_client_idx`).on(t.clientId),
      index(`${prefix}_access_user_idx`).on(t.userId),
      index(`${prefix}_access_session_idx`).on(t.sessionId),
      index(`${prefix}_access_refresh_idx`).on(t.refreshId),
      index(`${prefix}_access_code_idx`).on(t.authorizationCodeId),
      index(`${prefix}_access_expiry_idx`).on(t.expiresAt),
    ],
  );
  const oauthConsents = core.table(
    `${prefix}_consents`,
    {
      id: text("id").primaryKey(),
      clientId: text("client_id")
        .notNull()
        .references(() => oauthClients.clientId, { onDelete: "cascade" }),
      userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
      referenceId: text("reference_id"),
      resources: text("resources").array(),
      requestedUserInfoClaims: text("requested_user_info_claims").array(),
      scopes: text("scopes").array().notNull(),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
      updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    },
    (t) => [
      index(`${prefix}_consent_client_idx`).on(t.clientId),
      index(`${prefix}_consent_user_idx`).on(t.userId),
    ],
  );
  const oauthClientAssertions = core.table(
    `${prefix}_client_assertions`,
    {
      id: text("id").primaryKey(),
      expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    },
    (t) => [index(`${prefix}_assertions_expiry_idx`).on(t.expiresAt)],
  );

  return {
    oauthJwks,
    oauthClients,
    oauthResources,
    oauthClientResources,
    oauthRefreshTokens,
    oauthAccessTokens,
    oauthConsents,
    oauthClientAssertions,
  };
}

export const oauthDeviceCodes = core.table(
  `oauth_device_codes`,
  {
    id: text("id").primaryKey(),
    deviceCode: text("device_code").notNull().unique(),
    userCode: text("user_code").notNull().unique(),
    userId: text("user_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    status: text("status").notNull(),
    lastPolledAt: timestamp("last_polled_at", { withTimezone: true }),
    pollingInterval: integer("polling_interval"),
    clientId: text("client_id"),
    scope: text("scope"),
    resources: text("resources").array(),
    oauthClientId: text(`oauth_client_id`),
  },
  (t) => [index(`oauth_device_codes_expiry_idx`).on(t.expiresAt)],
);
