import { passkey } from "@better-auth/passkey";
import { db } from "@informach/db";
import {
  accounts,
  invitations,
  members,
  organizations,
  passkeys,
  rateLimit,
  sessions,
  twoFactors,
  users,
  verifications,
} from "@informach/db/schema";
import type { EmailCategory, RenderTemplate, SendEmail } from "@informach/emails";
import { type BetterAuthPlugin, betterAuth, type SecondaryStorage } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { magicLink, organization, twoFactor } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { configureObservability, logAuditEvent } from "./audit";
import {
  buildHelpers,
  ForbiddenError,
  NotImplementedError,
  OrganizationsDisabledError,
  UnauthorizedError,
} from "./helpers";
import type { AuthSecurityEvent, ObservabilityHooks } from "./observability";
import { isRole, type Permission, ROLES, type Role } from "./permissions";

export type { SecondaryStorage } from "better-auth";
export type { AuditEventType } from "./audit";
export type {
  AuthAuditEvent,
  AuthSecurityEvent,
  AuthSecurityEventType,
  ObservabilityHooks,
} from "./observability";
export { PERMISSIONS, roleHasPermission } from "./permissions";
export {
  ForbiddenError,
  NotImplementedError,
  OrganizationsDisabledError,
  type Permission,
  ROLES,
  type Role,
  UnauthorizedError,
};

const DEFAULT_COOKIE_CACHE_MAX_AGE_SECONDS = 300;

export type BuildUnsubscribeUrl = (identifier: string, category: EmailCategory) => string;

export type CreateAuthSessionConfig = {
  cookieCache?: {
    maxAge?: number;
  };
};

export type AllowUserToCreateOrganization =
  | boolean
  | ((user: { id: string; email: string; role?: string }) => boolean | Promise<boolean>);

export type CreateAuthOrganizationsConfig = {
  enabled: boolean;
  allowUserToCreateOrganization?: AllowUserToCreateOrganization;
};

export type CreateAuthGoogleProviderConfig = {
  clientId: string;
  clientSecret: string;
  redirectURI?: string;
};

export type CreateAuthSocialProvidersConfig = {
  google?: CreateAuthGoogleProviderConfig;
};

export type CreateAuthPasskeyConfig = {
  enabled: boolean;
  /** Relying-party name shown in the OS dialog. Defaults to `appName`. */
  rpName?: string;
  /** Relying-party identifier (apex domain). Defaults to the host of `baseUrl`. */
  rpID?: string;
  origin?: string;
};

export type CreateAuthTwoFactorConfig = {
  enabled: boolean;
  /** TOTP issuer label shown in authenticator apps. Defaults to `appName`. */
  issuer?: string;
};

export type CreateAuthAccountDeletionConfig = {
  enabled: boolean;
  /** When true, the user gets a confirmation email before deletion. Default: true. */
  sendDeleteEmail?: boolean;
};

export type RateLimitRule = { window: number; max: number };

/**
 * Default rate limits applied per endpoint. Windows in seconds.
 *
 * `/forget-password` is intentionally tight (3 in 1h) to prevent email
 * enumeration; tests/dev environments can override via `rateLimitRules`.
 */
export const DEFAULT_RATE_LIMIT_RULES = {
  "/sign-in/email": { window: 60, max: 5 },
  "/sign-up/email": { window: 3600, max: 5 },
  "/forget-password": { window: 3600, max: 3 },
  "/sign-in/magic-link": { window: 600, max: 5 },
  "/verify-email": { window: 60, max: 10 },
  "/reset-password": { window: 3600, max: 5 },
} as const satisfies Record<string, RateLimitRule>;

export type CreateAuthConfig = {
  secret: string;
  baseUrl: string;
  appName: string;
  sendEmail: SendEmail;
  renderTemplate: RenderTemplate;
  buildUnsubscribeUrl: BuildUnsubscribeUrl;
  unsubscribeMailto?: string;
  /**
   * Origins permitted to access auth endpoints (CSRF whitelist).
   * Examples: `["https://app.example.com", "https://admin.example.com"]`.
   * Better Auth does not match wildcards — list every concrete origin.
   */
  trustedOrigins?: string[];
  /**
   * When true, blocks `/sign-up/email`. Magic link sign-in continues to create
   * users on first sight (Better Auth limitation in 1.3.x).
   */
  disableSignup?: boolean;
  session?: CreateAuthSessionConfig;
  organizations?: CreateAuthOrganizationsConfig;
  socialProviders?: CreateAuthSocialProvidersConfig;
  passkey?: CreateAuthPasskeyConfig;
  twoFactor?: CreateAuthTwoFactorConfig;
  accountDeletion?: CreateAuthAccountDeletionConfig;
  /**
   * When true, denormalizes `users.role` into `sessions.role` so it travels
   * inside the cached cookie session (Better Auth does NOT cache
   * `user.additionalFields`). Trade-off: when an admin changes a user's role,
   * existing sessions must be revoked to refresh the cache. The package does
   * that automatically via `databaseHooks.user.update.after`.
   *
   * Default: `false` — `getCurrentUser` continues to hit `core.users` per call.
   */
  cacheRoleOnSession?: boolean;
  /**
   * Override default rate-limit windows per endpoint. Useful to loosen the
   * `/forget-password` 3-in-1h rule in dev/test environments.
   */
  rateLimitRules?: Partial<Record<string, RateLimitRule>>;
  /**
   * Optional Redis/KV-backed storage for sessions, verifications and rate
   * limits. When provided, those move out of Postgres into the secondary
   * storage. The package does not ship an adapter — see `PRODUCTION.md`.
   */
  secondaryStorage?: SecondaryStorage;
  /**
   * Hooks invoked on audit and security events. Use to plug
   * OpenTelemetry/Datadog/Sentry without coupling the package to a vendor.
   */
  observability?: ObservabilityHooks;
};

export type AuthInstance = ReturnType<typeof createAuthInstance>;

export type User = AuthInstance["$Infer"]["Session"]["user"];
export type Session = AuthInstance["$Infer"]["Session"]["session"];

function buildMagicLinkPlugin(config: CreateAuthConfig) {
  return magicLink({
    sendMagicLink: async ({ email, url, token }) => {
      const unsubscribeUrl = config.buildUnsubscribeUrl(email, "auth.magic-link");
      const { html, text, subject } = await config.renderTemplate("auth.magic-link", {
        appName: config.appName,
        url,
        unsubscribeUrl,
        unsubscribeMailto: config.unsubscribeMailto,
      });
      await config.sendEmail({
        to: email,
        category: "auth.magic-link",
        messageKey: token,
        unsubscribeUrl,
        unsubscribeMailto: config.unsubscribeMailto,
        subject,
        text,
        html,
      });
    },
  });
}

function buildOrganizationPlugin(config: CreateAuthConfig) {
  return organization({
    allowUserToCreateOrganization: config.organizations?.allowUserToCreateOrganization,
    async sendInvitationEmail(data) {
      const unsubscribeUrl = config.buildUnsubscribeUrl(data.email, "auth.invitation");
      const url = `${config.baseUrl}/accept-invitation/${data.id}`;
      const { html, text, subject } = await config.renderTemplate("auth.invitation", {
        appName: config.appName,
        inviterName: data.inviter.user.name,
        organizationName: data.organization.name,
        url,
        unsubscribeUrl,
        unsubscribeMailto: config.unsubscribeMailto,
      });
      await config.sendEmail({
        to: data.email,
        category: "auth.invitation",
        messageKey: data.id,
        unsubscribeUrl,
        unsubscribeMailto: config.unsubscribeMailto,
        subject,
        text,
        html,
      });
      await logAuditEvent("org.invitation_sent", data.inviter.user.id, {
        invitationId: data.id,
        organizationId: data.organization.id,
        email: data.email,
        role: data.role ?? null,
      });
    },
  });
}

function buildPasskeyPlugin(config: CreateAuthConfig) {
  if (!config.passkey?.enabled) return null;
  const baseUrlHost = (() => {
    try {
      return new URL(config.baseUrl).hostname;
    } catch {
      return undefined;
    }
  })();
  return passkey({
    rpName: config.passkey.rpName ?? config.appName,
    rpID: config.passkey.rpID ?? baseUrlHost,
    origin: config.passkey.origin,
  });
}

function buildTwoFactorPlugin(config: CreateAuthConfig) {
  if (!config.twoFactor?.enabled) return null;
  return twoFactor({
    issuer: config.twoFactor.issuer ?? config.appName,
  });
}

function buildPlugins(config: CreateAuthConfig): BetterAuthPlugin[] {
  const plugins: BetterAuthPlugin[] = [buildMagicLinkPlugin(config)];
  if (config.organizations?.enabled) {
    plugins.push(buildOrganizationPlugin(config));
  }
  const passkeyPlugin = buildPasskeyPlugin(config);
  if (passkeyPlugin) plugins.push(passkeyPlugin);
  const twoFactorPlugin = buildTwoFactorPlugin(config);
  if (twoFactorPlugin) plugins.push(twoFactorPlugin);
  return plugins;
}

function mergeRateLimitRules(
  overrides: CreateAuthConfig["rateLimitRules"],
): Record<string, RateLimitRule> {
  return { ...DEFAULT_RATE_LIMIT_RULES, ...(overrides ?? {}) } as Record<string, RateLimitRule>;
}

function createAuthInstance(config: CreateAuthConfig) {
  configureObservability(config.observability);

  const cookieCacheMaxAge =
    config.session?.cookieCache?.maxAge ?? DEFAULT_COOKIE_CACHE_MAX_AGE_SECONDS;
  const organizationsEnabled = config.organizations?.enabled === true;
  const passkeyEnabled = config.passkey?.enabled === true;
  const twoFactorEnabled = config.twoFactor?.enabled === true;
  const cacheRoleOnSession = config.cacheRoleOnSession === true;
  const plugins = buildPlugins(config);

  return betterAuth({
    appName: config.appName,
    baseURL: config.baseUrl,
    secret: config.secret,
    socialProviders: config.socialProviders,
    secondaryStorage: config.secondaryStorage,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: users,
        session: sessions,
        account: accounts,
        verification: verifications,
        rateLimit,
        ...(organizationsEnabled
          ? { organization: organizations, member: members, invitation: invitations }
          : {}),
        ...(passkeyEnabled ? { passkey: passkeys } : {}),
        ...(twoFactorEnabled ? { twoFactor: twoFactors } : {}),
      },
    }),
    advanced: {
      database: {
        generateId: () => crypto.randomUUID(),
      },
    },
    trustedOrigins: config.trustedOrigins,
    session: {
      cookieCache: {
        enabled: true,
        maxAge: cookieCacheMaxAge,
      },
      ...(cacheRoleOnSession
        ? {
            additionalFields: {
              role: { type: "string", required: false },
            },
          }
        : {}),
    },
    user: {
      additionalFields: {
        role: {
          type: "string",
          required: false,
          defaultValue: "member",
          input: false,
        },
        banned: {
          type: "boolean",
          required: false,
          defaultValue: false,
          input: false,
        },
        banReason: {
          type: "string",
          required: false,
          input: false,
        },
        banExpiresAt: {
          type: "date",
          required: false,
          input: false,
        },
      },
      ...(config.accountDeletion?.enabled
        ? {
            deleteUser: {
              enabled: true,
              ...(config.accountDeletion.sendDeleteEmail !== false
                ? {
                    sendDeleteAccountVerification: async (data: {
                      user: { id: string; email: string };
                      url: string;
                      token: string;
                    }) => {
                      const unsubscribeUrl = config.buildUnsubscribeUrl(
                        data.user.email,
                        "auth.account-deletion",
                      );
                      const { html, text, subject } = await config.renderTemplate(
                        "auth.account-deletion",
                        {
                          appName: config.appName,
                          url: data.url,
                          unsubscribeUrl,
                          unsubscribeMailto: config.unsubscribeMailto,
                        },
                      );
                      await config.sendEmail({
                        to: data.user.email,
                        category: "auth.account-deletion",
                        messageKey: data.token,
                        userId: data.user.id,
                        unsubscribeUrl,
                        unsubscribeMailto: config.unsubscribeMailto,
                        subject,
                        text,
                        html,
                      });
                    },
                  }
                : {}),
              beforeDelete: async (user: { id: string; email: string }) => {
                await logAuditEvent("user.deletion_requested", user.id, {
                  email: user.email,
                });
              },
              afterDelete: async (user: { id: string; email: string }) => {
                await logAuditEvent("user.deleted", null, { email: user.email });
              },
            },
          }
        : {}),
    },
    rateLimit: {
      enabled: true,
      storage: config.secondaryStorage ? "secondary-storage" : "database",
      modelName: "rateLimit",
      window: 60,
      max: 100,
      customRules: mergeRateLimitRules(config.rateLimitRules),
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: config.disableSignup ?? false,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url, token }) => {
        const unsubscribeUrl = config.buildUnsubscribeUrl(user.email, "auth.password-reset");
        const { html, text, subject } = await config.renderTemplate("auth.password-reset", {
          appName: config.appName,
          url,
          unsubscribeUrl,
          unsubscribeMailto: config.unsubscribeMailto,
        });
        await config.sendEmail({
          to: user.email,
          category: "auth.password-reset",
          messageKey: token,
          userId: user.id,
          unsubscribeUrl,
          unsubscribeMailto: config.unsubscribeMailto,
          subject,
          text,
          html,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url, token }) => {
        const unsubscribeUrl = config.buildUnsubscribeUrl(user.email, "auth.verify-email");
        const { html, text, subject } = await config.renderTemplate("auth.verify-email", {
          appName: config.appName,
          url,
          unsubscribeUrl,
          unsubscribeMailto: config.unsubscribeMailto,
        });
        await config.sendEmail({
          to: user.email,
          category: "auth.verify-email",
          messageKey: token,
          userId: user.id,
          unsubscribeUrl,
          unsubscribeMailto: config.unsubscribeMailto,
          subject,
          text,
          html,
        });
      },
    },
    plugins,
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await logAuditEvent("user.created", user.id, { email: user.email });
          },
        },
        update: {
          before: async (data, ctx) => {
            const targetId =
              typeof data === "object" && data !== null && "id" in data
                ? String((data as { id?: unknown }).id ?? "")
                : "";
            const actorId = ctx?.context?.session?.user?.id ?? null;
            if ("role" in data && isRole((data as { role?: unknown }).role)) {
              await logAuditEvent("user.role_changed", actorId, {
                targetId,
                newRole: (data as { role: Role }).role,
              });
              if (cacheRoleOnSession && targetId) {
                await db.delete(sessions).where(eq(sessions.userId, targetId));
              }
            }
            if ("banned" in data) {
              const banned = Boolean((data as { banned?: unknown }).banned);
              await logAuditEvent(banned ? "user.banned" : "user.unbanned", actorId, {
                targetId,
                reason:
                  "banReason" in data
                    ? ((data as { banReason?: unknown }).banReason ?? null)
                    : null,
              });
            }
            return { data };
          },
        },
      },
      session: {
        create: {
          ...(cacheRoleOnSession
            ? {
                before: async (session: { userId: string }, ctx: unknown) => {
                  const adapter = (ctx as { context?: { adapter?: AuthAdapterFindOne } } | null)
                    ?.context?.adapter;
                  const user = await adapter?.findOne?.<{ role?: string }>({
                    model: "user",
                    where: [{ field: "id", value: session.userId }],
                  });
                  const role = user?.role ?? null;
                  return { data: { ...session, role } };
                },
              }
            : {}),
          after: async (session) => {
            await logAuditEvent("session.created", session.userId, {
              sessionId: session.id,
              ipAddress: session.ipAddress ?? null,
              userAgent: session.userAgent ?? null,
            });
          },
        },
        delete: {
          after: async (session) => {
            await logAuditEvent("session.revoked", session.userId, {
              sessionId: session.id,
            });
            emitSecurityEvent(config, {
              type: "session_revoked",
              userId: session.userId,
              metadata: { sessionId: session.id },
            });
          },
        },
      },
      account: {
        create: {
          after: async (account) => {
            await logAuditEvent("account.linked", account.userId, {
              accountId: account.id,
              providerId: account.providerId,
            });
          },
        },
      },
    },
    hooks: {
      after: createAuthMiddleware(async (ctx) => {
        const path = ctx.path;
        const session = ctx.context.session;
        const userId = session?.user?.id ?? null;

        if (path === "/sign-out") {
          await logAuditEvent("auth.sign_out", userId, {});
          return;
        }
        if (path === "/forget-password") {
          const email =
            typeof ctx.body === "object" && ctx.body && "email" in ctx.body
              ? String((ctx.body as { email?: unknown }).email ?? "")
              : null;
          await logAuditEvent("auth.forget_password_requested", null, {
            email: email ?? null,
          });
          return;
        }
        if (path === "/reset-password") {
          await logAuditEvent("auth.password_reset_completed", userId, {});
          return;
        }
        if (path === "/verify-email") {
          await logAuditEvent("email.verified", userId, {});
          return;
        }
        if (path === "/change-password") {
          await logAuditEvent("user.password_changed", userId, {});
          return;
        }
        if (path === "/change-email") {
          const newEmail =
            typeof ctx.body === "object" && ctx.body && "newEmail" in ctx.body
              ? String((ctx.body as { newEmail?: unknown }).newEmail ?? "")
              : null;
          await logAuditEvent("user.email_changed", userId, { newEmail });
          return;
        }
        if (path === "/organization/create") {
          await logAuditEvent("org.created", userId, {});
          return;
        }
        if (path === "/organization/accept-invitation") {
          await logAuditEvent("org.member_added", userId, {});
          return;
        }
        if (path === "/organization/remove-member") {
          await logAuditEvent("org.member_removed", userId, {});
          return;
        }
        if (path === "/two-factor/enable") {
          await logAuditEvent("auth.two_factor_enabled", userId, {});
          return;
        }
        if (path === "/two-factor/disable") {
          await logAuditEvent("auth.two_factor_disabled", userId, {});
          return;
        }
        if (path === "/two-factor/verify-totp") {
          const status = (ctx.context as { returned?: { status?: number } } | undefined)?.returned
            ?.status;
          if (status && status >= 400) {
            emitSecurityEvent(config, {
              type: "two_factor_failed",
              userId: userId ?? undefined,
              metadata: { method: "totp", status },
            });
          } else {
            await logAuditEvent("auth.two_factor_verified", userId, {});
          }
          return;
        }
        if (path === "/two-factor/verify-backup-code") {
          const verifyStatus = (ctx.context as { returned?: { status?: number } } | undefined)
            ?.returned?.status;
          if (verifyStatus && verifyStatus >= 400) {
            emitSecurityEvent(config, {
              type: "two_factor_failed",
              userId: userId ?? undefined,
              metadata: { method: "backup_code", status: verifyStatus },
            });
          } else {
            await logAuditEvent("auth.backup_code_used", userId, {});
          }
          return;
        }

        const status = (ctx.context as { returned?: { status?: number } } | undefined)?.returned
          ?.status;
        if (status === 429) {
          emitSecurityEvent(config, {
            type: "rate_limit_hit",
            userId: userId ?? undefined,
            metadata: { path },
          });
        }
      }),
    },
  });
}

type AuthAdapterFindOne = {
  findOne?: <T>(input: {
    model: string;
    where: Array<{ field: string; value: string }>;
  }) => Promise<T | null>;
};

function emitSecurityEvent(config: CreateAuthConfig, event: AuthSecurityEvent): void {
  try {
    config.observability?.onSecurityEvent?.(event);
  } catch {
    // observability hooks must not break auth flows
  }
}

export type CreateAuthResult = {
  auth: AuthInstance;
  getSession: (headers: Headers) => Promise<{ user: User; session: Session } | null>;
  getCurrentUser: (headers: Headers) => Promise<User | null>;
  requireUser: (headers: Headers) => Promise<User>;
  requireRole: (headers: Headers, role: Role) => Promise<User>;
  requireAdmin: (headers: Headers) => Promise<User>;
  hasRole: (user: User, role: Role) => boolean;
  assertRole: (user: User, role: Role) => void;
  assertPermission: (user: User, permission: Permission) => void;
  hasAccessToProduct: (userId: string, productId: string) => Promise<boolean>;
  getActiveOrganization: (
    headers: Headers,
  ) => Promise<{ id: string; name?: string; slug?: string } | null>;
  getActiveMember: (headers: Headers) => Promise<{
    id: string;
    userId?: string;
    organizationId?: string;
    role?: string;
  } | null>;
  listUserOrganizations: (
    headers: Headers,
  ) => Promise<Array<{ id: string; name?: string; slug?: string }>>;
  requireOrgMember: (
    headers: Headers,
    role?: string,
  ) => Promise<{
    user: User;
    member: { id: string; userId?: string; organizationId?: string; role?: string };
    organization: { id: string; name?: string; slug?: string } | null;
  }>;
};

export function createAuth(config: CreateAuthConfig): CreateAuthResult {
  const auth = createAuthInstance(config);
  const helpers = buildHelpers<User, Session>(auth);

  return {
    auth,
    ...helpers,
  };
}
