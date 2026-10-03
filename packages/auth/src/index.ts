import { createHash, randomUUID } from "node:crypto";
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
import { APIError, createAuthMiddleware } from "better-auth/api";
import { emailOTP } from "better-auth/plugins/email-otp";
import { magicLink } from "better-auth/plugins/magic-link";
import { organization } from "better-auth/plugins/organization";
import { twoFactor } from "better-auth/plugins/two-factor";
import { eq } from "drizzle-orm";
import { configureObservability, logAuditEvent } from "./audit";
import {
  buildHelpers,
  ForbiddenError,
  isUserBanned,
  NotFoundError,
  NotImplementedError,
  OrganizationsDisabledError,
  UnauthorizedError,
} from "./helpers";
import type { AuthSecurityEvent, ObservabilityHooks } from "./observability";
import { isRole, type Permission, ROLES, type Role } from "./permissions";

export type { SecondaryStorage } from "better-auth";
export type { AuditEventType, AuditPayload } from "./audit";
export { logAuditEvent } from "./audit";
export type {
  AuthAuditEvent,
  AuthSecurityEvent,
  AuthSecurityEventType,
  ObservabilityHooks,
} from "./observability";
export { PERMISSIONS, roleHasPermission } from "./permissions";
export {
  ForbiddenError,
  NotFoundError,
  NotImplementedError,
  OrganizationsDisabledError,
  type Permission,
  ROLES,
  type Role,
  UnauthorizedError,
};

const DEFAULT_COOKIE_CACHE_MAX_AGE_SECONDS = 300;

export type BuildUnsubscribeUrl = (identifier: string, category: EmailCategory) => string;

function opaqueMessageKey(prefix: string, secret: string): string {
  return `${prefix}_${createHash("sha256").update(secret).digest("hex")}`;
}

function transientMessageKey(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

export type CreateAuthSessionConfig = {
  cookieCache?: {
    /** Apps with immediate role handoff can opt out without changing other apps. */
    enabled?: boolean;
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

/**
 * Configures how email-based flows are delivered. Defaults preserve the cozya
 * setup: OTP verification on signup + magic-link sign-in + link password reset.
 */
export type CreateAuthEmailConfig = {
  /**
   * Mechanism for email verification on signup and email-change.
   * - `"otp"`: 6-digit code via Better Auth's `emailOTP` plugin (overrides the
   *   default link-based verification system-wide).
   * - `"link"`: traditional verification link via `emailVerification.sendVerificationEmail`
   *   (template `auth.verify-email`).
   * Default: `"otp"`.
   */
  verification?: "otp" | "link";
  /**
   * Passwordless sign-in methods to enable. Both default to safe values for
   * backwards compatibility (`magicLink: true`, `otp: false`).
   */
  signIn?: {
    /**
     * Enables `signIn.magicLink({ email })` (Better Auth `magicLink` plugin).
     * Template: `auth.magic-link`. Default: `true`.
     */
    magicLink?: boolean;
    /**
     * Enables `signIn.emailOtp({ email })` (Better Auth `emailOTP` plugin
     * sign-in flow). Template: `auth.sign-in-otp`. Default: `false`.
     */
    otp?: boolean;
  };
  /**
   * Mechanism for password reset (forget-password flow).
   * - `"link"`: traditional reset link via `emailAndPassword.sendResetPassword`
   *   (template `auth.password-reset`).
   * - `"otp"`: OTP-based reset via `forgetPassword.emailOtp({ email })` +
   *   `emailOtp.resetPassword({ email, otp, password })` (template
   *   `auth.forget-password-otp`). The link callback is NOT registered when
   *   this is `"otp"`.
   * Default: `"link"`.
   */
  forgetPassword?: "link" | "otp";
  /**
   * Disparado quando alguém tenta cadastrar com e-mail já existente. Recebe
   * o usuário EXISTENTE (não o tentante). Use para enviar notificação de
   * segurança (ex: "alguém tentou criar conta com seu email").
   *
   * Best-effort: o callback roda fire-and-forget. Erros são logados via
   * `observability.onAuditPersistenceFailure` mas não interrompem o fluxo,
   * que sempre lança `USER_ALREADY_EXISTS` para o cliente.
   *
   * IMPORTANTE: a presença deste campo não controla a detecção de duplicata
   * — ela é sempre feita pelo middleware `/sign-up/email`. Este callback só
   * controla a notificação opcional ao usuário existente.
   */
  onExistingUserSignUp?: (params: {
    user: { id: string; email: string; name: string };
  }) => Promise<void> | void;
};

export type CreateAuthAccountDeletionConfig = {
  enabled: boolean;
  /** When true, the user gets a confirmation email before deletion. Default: true. */
  sendDeleteEmail?: boolean;
  /** Abort deletion if mandatory application cleanup fails (for example subscription cancellation). */
  requireCleanupSuccess?: boolean;
  /**
   * Optional async hook executed BEFORE the user is deleted from `core.users`.
   * Used by apps to clean up cross-package state (cancel billing subscriptions,
   * notify external systems, anonymize PII in app-owned tables).
   *
   * Failures here ARE logged but do NOT abort the deletion — fiscal/compliance
   * cleanup must be best-effort to keep the LGPD right-to-be-forgotten honored.
   * Audit log captures the failure for ops to follow up.
   */
  onBeforeDelete?: (user: { id: string; email: string }) => Promise<void>;
  /**
   * Optional async hook executed AFTER the user is deleted. Same failure model
   * as `onBeforeDelete` — best-effort, errors logged.
   */
  onAfterDelete?: (user: { id: string; email: string }) => Promise<void>;
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
  "/sign-in/email-otp": { window: 600, max: 5 },
  "/sign-up/email": { window: 3600, max: 5 },
  "/forget-password": { window: 3600, max: 3 },
  "/forget-password/email-otp": { window: 3600, max: 3 },
  "/sign-in/magic-link": { window: 600, max: 5 },
  "/verify-email": { window: 60, max: 10 },
  "/reset-password": { window: 3600, max: 5 },
  "/email-otp/request-password-reset": { window: 3600, max: 3 },
  "/email-otp/reset-password": { window: 3600, max: 5 },
  "/email-otp/send-verification-otp": { window: 60, max: 5 },
  "/email-otp/verify-email": { window: 60, max: 10 },
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
  /**
   * Per-app choice of email-based flows: verification, passwordless sign-in,
   * password reset. See {@link CreateAuthEmailConfig} for defaults.
   */
  email?: CreateAuthEmailConfig;
  accountDeletion?: CreateAuthAccountDeletionConfig;
  /** App-specific product instrumentation after a new account is persisted. */
  onUserCreated?: (user: { id: string }) => Promise<void>;
  /**
   * When true, denormalizes `users.role` into `sessions.role` so it travels
   * inside the cached cookie session (Better Auth does NOT cache
   * `user.additionalFields`). Trade-off: when an admin changes a user's role,
   * existing sessions must be revoked to refresh the cache. The package does
   * that automatically when role changes go through `setUserRole`.
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
        messageKey: opaqueMessageKey("magic-link", token),
        unsubscribeUrl,
        unsubscribeMailto: config.unsubscribeMailto,
        subject,
        text,
        html,
      });
    },
  });
}

const EMAIL_OTP_EXPIRES_IN_SECONDS = 600;
const EMAIL_OTP_LENGTH = 6;
const EMAIL_OTP_ALLOWED_ATTEMPTS = 3;

type EmailFlowSelection = {
  verificationOtp: boolean;
  signInOtp: boolean;
  forgetPasswordOtp: boolean;
};

function resolveEmailFlows(config: CreateAuthConfig): EmailFlowSelection {
  return {
    verificationOtp: (config.email?.verification ?? "otp") === "otp",
    signInOtp: config.email?.signIn?.otp === true,
    forgetPasswordOtp: config.email?.forgetPassword === "otp",
  };
}

function magicLinkSignInEnabled(config: CreateAuthConfig): boolean {
  return config.email?.signIn?.magicLink !== false;
}

function emailOtpPluginRequired(flows: EmailFlowSelection): boolean {
  return flows.verificationOtp || flows.signInOtp || flows.forgetPasswordOtp;
}

const EMAIL_OTP_CATEGORY_BY_TYPE = {
  "email-verification": "auth.verify-email-otp",
  "sign-in": "auth.sign-in-otp",
  "forget-password": "auth.forget-password-otp",
} as const satisfies Record<string, EmailCategory>;

type EmailOtpType = keyof typeof EMAIL_OTP_CATEGORY_BY_TYPE;

/**
 * Builds the Better Auth `emailOTP` plugin with a `sendVerificationOTP`
 * callback that fans out to the right template per OTP type. The plugin only
 * sends an email when the corresponding flow is enabled in `config.email` —
 * otherwise the call is a silent no-op (defensive even if the endpoint is hit).
 */
function buildEmailOtpPlugin(config: CreateAuthConfig, flows: EmailFlowSelection) {
  return emailOTP({
    otpLength: EMAIL_OTP_LENGTH,
    expiresIn: EMAIL_OTP_EXPIRES_IN_SECONDS,
    allowedAttempts: EMAIL_OTP_ALLOWED_ATTEMPTS,
    disableSignUp: true,
    sendVerificationOnSignUp: flows.verificationOtp,
    overrideDefaultEmailVerification: flows.verificationOtp,
    sendVerificationOTP: async ({ email, otp, type }) => {
      const otpType = type as EmailOtpType;
      if (otpType === "email-verification" && !flows.verificationOtp) return;
      if (otpType === "sign-in" && !flows.signInOtp) return;
      if (otpType === "forget-password" && !flows.forgetPasswordOtp) return;

      const category = EMAIL_OTP_CATEGORY_BY_TYPE[otpType];
      if (!category) return;

      const unsubscribeUrl = config.buildUnsubscribeUrl(email, category);
      const { html, text, subject } = await config.renderTemplate(category, {
        appName: config.appName,
        otp,
        expiresInMinutes: Math.round(EMAIL_OTP_EXPIRES_IN_SECONDS / 60),
        unsubscribeUrl,
        unsubscribeMailto: config.unsubscribeMailto,
      });
      await config.sendEmail({
        to: email,
        category,
        // OTPs are low entropy and must never be persisted or made derivable
        // from persisted identifiers. Use an opaque per-delivery key instead.
        messageKey: transientMessageKey(`otp-${otpType}`),
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
        messageKey: opaqueMessageKey("invitation", data.id),
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

function buildPlugins(config: CreateAuthConfig, flows: EmailFlowSelection): BetterAuthPlugin[] {
  const plugins: BetterAuthPlugin[] = [];
  if (magicLinkSignInEnabled(config)) {
    plugins.push(buildMagicLinkPlugin(config));
  }
  if (emailOtpPluginRequired(flows)) {
    plugins.push(buildEmailOtpPlugin(config, flows));
  }
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

function returnedStatus(ctx: unknown): number | undefined {
  const returned = (ctx as { context?: { returned?: unknown } }).context?.returned;
  if (typeof returned !== "object" || returned === null) return undefined;
  const status = (returned as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

function returnedSuccessfully(status: number | undefined): boolean {
  return status === undefined || status < 400;
}

function bodyField(ctx: unknown, field: string): string | null {
  const body = (ctx as { body?: unknown }).body;
  if (typeof body !== "object" || body === null || !(field in body)) return null;
  const value = (body as Record<string, unknown>)[field];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function userIdOf(user: unknown): string | null {
  if (typeof user !== "object" || user === null) return null;
  const id = (user as { id?: unknown }).id;
  return typeof id === "string" ? id : null;
}

function createAuthInstance(config: CreateAuthConfig) {
  configureObservability(config.observability);

  const cookieCacheMaxAge =
    config.session?.cookieCache?.maxAge ?? DEFAULT_COOKIE_CACHE_MAX_AGE_SECONDS;
  const organizationsEnabled = config.organizations?.enabled === true;
  const passkeyEnabled = config.passkey?.enabled === true;
  const twoFactorEnabled = config.twoFactor?.enabled === true;
  const cacheRoleOnSession = config.cacheRoleOnSession === true;
  const flows = resolveEmailFlows(config);
  const plugins = buildPlugins(config, flows);

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
        enabled: config.session?.cookieCache?.enabled ?? true,
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
                        messageKey: opaqueMessageKey("account-deletion", data.token),
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
                if (config.accountDeletion?.onBeforeDelete) {
                  try {
                    await config.accountDeletion.onBeforeDelete(user);
                  } catch (err) {
                    await logAuditEvent("user.deletion_requested", user.id, {
                      email: user.email,
                      hookError: err instanceof Error ? err.message : String(err),
                      stage: "onBeforeDelete",
                    });
                    if (config.accountDeletion.requireCleanupSuccess) throw err;
                  }
                }
              },
              afterDelete: async (user: { id: string; email: string }) => {
                await logAuditEvent("user.deleted", null, { email: user.email });
                if (config.accountDeletion?.onAfterDelete) {
                  try {
                    await config.accountDeletion.onAfterDelete(user);
                  } catch (err) {
                    await logAuditEvent("user.deleted", null, {
                      email: user.email,
                      hookError: err instanceof Error ? err.message : String(err),
                      stage: "onAfterDelete",
                    });
                  }
                }
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
      // Link reset is the default; opt-out by setting `email.forgetPassword: "otp"`.
      // When opted-out, the OTP plugin handles reset via `forgetPassword.emailOtp`.
      ...(flows.forgetPasswordOtp
        ? {}
        : {
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
                messageKey: opaqueMessageKey("password-reset", token),
                userId: user.id,
                unsubscribeUrl,
                unsubscribeMailto: config.unsubscribeMailto,
                subject,
                text,
                html,
              });
            },
          }),
    },
    emailVerification: {
      // `sendOnSignUp` + `autoSignInAfterVerification` are always set so Better
      // Auth fires a verification flow at signup and auto-creates a session
      // after `/email-otp/verify-email` or `/verify-email` returns OK.
      // The actual delivery is link-based when `email.verification === "link"`,
      // OTP-based otherwise (overrideDefaultEmailVerification on the OTP plugin).
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      ...(flows.verificationOtp
        ? {}
        : {
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
                messageKey: opaqueMessageKey("verify-email", token),
                userId: user.id,
                unsubscribeUrl,
                unsubscribeMailto: config.unsubscribeMailto,
                subject,
                text,
                html,
              });
            },
          }),
    },
    plugins,
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await logAuditEvent("user.created", user.id, { email: user.email });
            await config.onUserCreated?.({ id: user.id });
          },
        },
      },
      session: {
        create: {
          before: async (session: { userId: string }, ctx: unknown) => {
            const adapter = (ctx as { context?: { adapter?: AuthAdapterFindOne } } | null)?.context
              ?.adapter;
            const user = await adapter?.findOne?.<{
              role?: string | null;
              banned?: boolean | null;
              banExpiresAt?: Date | string | number | null;
            }>({
              model: "user",
              where: [{ field: "id", value: session.userId }],
            });
            if (isUserBanned(user)) {
              emitSecurityEvent(config, {
                type: "banned_user_signin_attempt",
                userId: session.userId,
                metadata: { banExpiresAt: user?.banExpiresAt ?? null },
              });
              return false;
            }
            return {
              data: {
                ...session,
                ...(cacheRoleOnSession ? { role: user?.role ?? null } : {}),
              },
            };
          },
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
      before: createAuthMiddleware(async (ctx) => {
        // Better Auth nativo NÃO retorna USER_ALREADY_EXISTS quando
        // `requireEmailVerification: true` (proteção anti-enumeration via
        // "generic duplicate response"). Para apps consumer single-user esse
        // trade-off prejudica mais a UX do que protege — o usuário fica preso
        // na tela de OTP esperando código que nunca chega. Detectamos a
        // duplicata aqui e retornamos erro explícito.
        if (ctx.path !== "/sign-up/email") return;
        const rawEmail = bodyField(ctx, "email");
        if (!rawEmail) return;
        const normalized = rawEmail.toLowerCase().trim();
        const [existing] = await db
          .select({ id: users.id, email: users.email, name: users.name })
          .from(users)
          .where(eq(users.email, normalized))
          .limit(1);
        if (!existing) return;

        if (config.email?.onExistingUserSignUp) {
          // Fire-and-forget: notificação não pode bloquear a resposta de erro.
          Promise.resolve(
            config.email.onExistingUserSignUp({
              user: { id: existing.id, email: existing.email, name: existing.name },
            }),
          ).catch((err) => {
            try {
              config.observability?.onAuditPersistenceFailure?.({
                eventType: "auth.signup_attempt_on_existing",
                actorId: existing.id,
                payloadKeys: ["error"],
                error: {
                  name: err instanceof Error ? err.name : "UnknownError",
                  message: err instanceof Error ? err.message : String(err),
                },
              });
            } catch {
              // observability hooks must not break auth flows
            }
          });
        }

        await logAuditEvent("auth.signup_attempt_on_existing", existing.id, {
          emailDomain: normalized.split("@")[1] ?? "",
        });

        throw new APIError("BAD_REQUEST", {
          message: "An account with this email already exists.",
          code: "USER_ALREADY_EXISTS",
        });
      }),
      after: createAuthMiddleware(async (ctx) => {
        const path = ctx.path;
        const session = ctx.context.session;
        const userId = session?.user?.id ?? null;
        const status = returnedStatus(ctx);
        const succeeded = returnedSuccessfully(status);

        if (status === 429) {
          emitSecurityEvent(config, {
            type: "rate_limit_hit",
            userId: userId ?? undefined,
            metadata: { path },
          });
        }

        if (path === "/sign-out") {
          if (succeeded) await logAuditEvent("auth.sign_out", userId, {});
          return;
        }
        if (
          path === "/forget-password" ||
          path === "/email-otp/request-password-reset" ||
          path === "/forget-password/email-otp"
        ) {
          const email = bodyField(ctx, "email");
          await logAuditEvent("auth.forget_password_requested", null, {
            email: email ?? null,
          });
          return;
        }
        if (path === "/email-otp/send-verification-otp") {
          const email = bodyField(ctx, "email");
          const type = bodyField(ctx, "type");
          if (type === "forget-password") {
            await logAuditEvent("auth.forget_password_requested", null, {
              email: email ?? null,
            });
          }
          if (type === "sign-in") {
            await logAuditEvent("auth.sign_in_otp_requested", null, {
              email: email ?? null,
            });
          }
          return;
        }
        if (path === "/reset-password" || path === "/email-otp/reset-password") {
          if (succeeded) {
            const email = bodyField(ctx, "email");
            await logAuditEvent("auth.password_reset_completed", userId, {
              ...(email ? { email } : {}),
            });
          }
          return;
        }
        if (path === "/verify-email" || path === "/email-otp/verify-email") {
          if (succeeded) await logAuditEvent("email.verified", userId, {});
          return;
        }
        if (path === "/change-password") {
          if (succeeded) await logAuditEvent("user.password_changed", userId, {});
          return;
        }
        if (path === "/change-email") {
          const newEmail =
            typeof ctx.body === "object" && ctx.body && "newEmail" in ctx.body
              ? String((ctx.body as { newEmail?: unknown }).newEmail ?? "")
              : null;
          if (succeeded) await logAuditEvent("user.email_changed", userId, { newEmail });
          return;
        }
        if (path === "/organization/create") {
          if (succeeded) await logAuditEvent("org.created", userId, {});
          return;
        }
        if (path === "/organization/accept-invitation") {
          if (succeeded) await logAuditEvent("org.member_added", userId, {});
          return;
        }
        if (path === "/organization/remove-member") {
          if (succeeded) await logAuditEvent("org.member_removed", userId, {});
          return;
        }
        if (path === "/two-factor/enable") {
          if (succeeded) await logAuditEvent("auth.two_factor_enabled", userId, {});
          return;
        }
        if (path === "/two-factor/disable") {
          if (succeeded) await logAuditEvent("auth.two_factor_disabled", userId, {});
          return;
        }
        if (path === "/two-factor/verify-totp") {
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
          if (status && status >= 400) {
            emitSecurityEvent(config, {
              type: "two_factor_failed",
              userId: userId ?? undefined,
              metadata: { method: "backup_code", status },
            });
          } else {
            await logAuditEvent("auth.backup_code_used", userId, {});
          }
          return;
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
  setUserRole: (headers: Headers, targetUserId: string, role: Role) => Promise<void>;
  setUserBanState: (headers: Headers, input: SetUserBanStateInput) => Promise<void>;
};

export type SetUserBanStateInput = {
  userId: string;
  banned: boolean;
  banReason?: string | null;
  banExpiresAt?: Date | null;
};

export function createAuth(config: CreateAuthConfig): CreateAuthResult {
  const auth = createAuthInstance(config);
  const helpers = buildHelpers<User, Session>(auth);

  async function setUserRole(headers: Headers, targetUserId: string, role: Role): Promise<void> {
    const actor = await helpers.requireUser(headers);
    helpers.assertPermission(actor, "users.set_role");
    if (!targetUserId) throw new ForbiddenError("target user id is required");
    if (!isRole(role)) throw new ForbiddenError(`unknown role "${role}"`);

    const [updated] = await db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, targetUserId))
      .returning({ id: users.id });

    if (!updated) throw new NotFoundError("target user");

    await logAuditEvent("user.role_changed", userIdOf(actor), {
      targetId: targetUserId,
      newRole: role,
    });
    if (config.cacheRoleOnSession === true) {
      await db.delete(sessions).where(eq(sessions.userId, targetUserId));
    }
  }

  async function setUserBanState(headers: Headers, input: SetUserBanStateInput): Promise<void> {
    const actor = await helpers.requireUser(headers);
    helpers.assertPermission(actor, "users.ban");
    if (!input.userId) throw new ForbiddenError("target user id is required");

    const banState = {
      banned: input.banned,
      banReason: input.banned ? (input.banReason ?? null) : null,
      banExpiresAt: input.banned ? (input.banExpiresAt ?? null) : null,
      updatedAt: new Date(),
    };

    const [updated] = await db
      .update(users)
      .set(banState)
      .where(eq(users.id, input.userId))
      .returning({ id: users.id });

    if (!updated) throw new NotFoundError("target user");

    await logAuditEvent(input.banned ? "user.banned" : "user.unbanned", userIdOf(actor), {
      targetId: input.userId,
      reason: input.banned ? (input.banReason ?? null) : null,
    });
    if (isUserBanned(banState)) {
      await db.delete(sessions).where(eq(sessions.userId, input.userId));
    }
  }

  return {
    auth,
    ...helpers,
    setUserRole,
    setUserBanState,
  };
}
