import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { emailOTP } from "better-auth/plugins/email-otp";
import { magicLink } from "better-auth/plugins/magic-link";
import { organization } from "better-auth/plugins/organization";
import { twoFactor } from "better-auth/plugins/two-factor";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAuth } from "../index";

vi.mock("better-auth", () => ({
  betterAuth: vi.fn(() => ({
    api: { getSession: vi.fn() },
    handler: vi.fn(),
    $Infer: { Session: { user: {}, session: {} } },
  })),
}));

vi.mock("better-auth/adapters/drizzle", () => ({
  drizzleAdapter: vi.fn(() => "MOCK_DRIZZLE_ADAPTER"),
}));

vi.mock("better-auth/api", () => ({
  createAuthMiddleware: vi.fn((handler: unknown) => ({ __middleware: true, handler })),
}));

vi.mock("better-auth/plugins/magic-link", () => ({
  magicLink: vi.fn((config: unknown) => ({ id: "magic-link", _config: config })),
}));

vi.mock("better-auth/plugins/email-otp", () => ({
  emailOTP: vi.fn((config: unknown) => ({ id: "email-otp", _config: config })),
}));

vi.mock("better-auth/plugins/organization", () => ({
  organization: vi.fn((config: unknown) => ({ id: "organization", _config: config })),
}));

vi.mock("better-auth/plugins/two-factor", () => ({
  twoFactor: vi.fn((config: unknown) => ({ id: "two-factor", _config: config })),
}));

vi.mock("@better-auth/passkey", () => ({
  passkey: vi.fn((config: unknown) => ({ id: "passkey", _config: config })),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
}));

const dbInsertChain = {
  values: vi.fn(async (_value: Record<string, unknown>) => undefined),
};
const dbDeleteChain = {
  where: vi.fn(async () => undefined),
};
const dbUpdateChain: {
  rows: Array<Record<string, unknown>>;
  set: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  returning: ReturnType<typeof vi.fn>;
} = {
  rows: [],
  set: vi.fn(() => dbUpdateChain),
  where: vi.fn(() => dbUpdateChain),
  returning: vi.fn(async () => dbUpdateChain.rows),
};

vi.mock("@informach/db", () => ({
  db: {
    insert: vi.fn(() => dbInsertChain),
    delete: vi.fn(() => dbDeleteChain),
    update: vi.fn(() => dbUpdateChain),
  },
}));

vi.mock("@informach/db/schema", () => ({
  users: { __mock: "users", id: "users.id", role: "users.role" },
  sessions: { __mock: "sessions", userId: "sessions.user_id" },
  accounts: { __mock: "accounts" },
  verifications: { __mock: "verifications" },
  rateLimit: { __mock: "rateLimit" },
  events: { __mock: "events" },
  organizations: { __mock: "organizations" },
  members: { __mock: "members" },
  invitations: { __mock: "invitations" },
  passkeys: { __mock: "passkeys" },
  twoFactors: { __mock: "twoFactors" },
}));

const mockedBetterAuth = vi.mocked(betterAuth);
const mockedDrizzleAdapter = vi.mocked(drizzleAdapter);
const mockedMagicLink = vi.mocked(magicLink);
const mockedEmailOtp = vi.mocked(emailOTP);
const mockedOrganization = vi.mocked(organization);
const mockedTwoFactor = vi.mocked(twoFactor);
const mockedPasskey = vi.mocked(passkey);
const mockedAuthMiddleware = vi.mocked(createAuthMiddleware);

function expectHashedMessageKey(value: unknown, prefix: string, leakedValue: string): void {
  expect(value).toEqual(expect.stringMatching(new RegExp(`^${prefix}_[a-f0-9]{64}$`)));
  expect(String(value)).not.toContain(leakedValue);
}

function expectTransientMessageKey(value: unknown, prefix: string, leakedValues: string[]): void {
  expect(value).toEqual(expect.stringMatching(new RegExp(`^${prefix}_[0-9a-f-]{36}$`)));
  for (const leakedValue of leakedValues) {
    expect(String(value)).not.toContain(leakedValue);
  }
}

type AdditionalFieldSpec = {
  type?: string;
  required?: boolean;
  defaultValue?: unknown;
  input?: boolean;
};

type DeleteUserConfig = {
  enabled?: boolean;
  sendDeleteAccountVerification?: (data: {
    user: { id: string; email: string };
    url: string;
    token: string;
  }) => Promise<void>;
  beforeDelete?: (user: { id: string; email: string }) => Promise<void>;
  afterDelete?: (user: { id: string; email: string }) => Promise<void>;
};

type CapturedBetterAuthOptions = {
  appName?: string;
  baseURL?: string;
  secret?: string;
  trustedOrigins?: string[];
  session?: {
    cookieCache?: { enabled?: boolean; maxAge?: number };
    additionalFields?: Record<string, AdditionalFieldSpec>;
  };
  user?: {
    additionalFields?: Record<string, AdditionalFieldSpec>;
    deleteUser?: DeleteUserConfig;
  };
  rateLimit?: {
    enabled?: boolean;
    storage?: string;
    modelName?: string;
    window?: number;
    max?: number;
    customRules?: Record<string, { window: number; max: number }>;
  };
  socialProviders?: {
    google?: { clientId?: string; clientSecret?: string; redirectURI?: string };
  };
  secondaryStorage?: unknown;
  emailAndPassword?: {
    enabled?: boolean;
    disableSignUp?: boolean;
    requireEmailVerification?: boolean;
    revokeSessionsOnPasswordReset?: boolean;
    sendResetPassword?: (input: {
      user: { id: string; email: string };
      url: string;
      token: string;
    }) => Promise<void>;
  };
  emailVerification?: {
    sendOnSignUp?: boolean;
    autoSignInAfterVerification?: boolean;
    sendVerificationEmail?: (input: {
      user: { id: string; email: string };
      url: string;
      token: string;
    }) => Promise<void>;
  };
  databaseHooks?: {
    user?: {
      create?: { after?: (user: { id: string; email: string }) => Promise<void> };
      update?: {
        before?: (
          data: Record<string, unknown>,
          ctx?: { context?: { session?: { user?: { id?: string } } | null } },
        ) => Promise<{ data: Record<string, unknown> }>;
      };
    };
    session?: {
      create?: {
        before?: (
          session: { userId: string },
          ctx?: unknown,
        ) => Promise<{ data: Record<string, unknown> } | false>;
        after?: (session: {
          id: string;
          userId: string;
          ipAddress?: string | null;
          userAgent?: string | null;
        }) => Promise<void>;
      };
      delete?: {
        after?: (session: { id: string; userId: string }) => Promise<void>;
      };
    };
    account?: {
      create?: {
        after?: (account: { id: string; userId: string; providerId: string }) => Promise<void>;
      };
    };
  };
  hooks?: { after?: { handler?: (ctx: unknown) => Promise<void> } };
  advanced?: { database?: { generateId?: () => string } };
};

function captureConfig(): CapturedBetterAuthOptions {
  const lastCall = mockedBetterAuth.mock.calls.at(-1);
  if (!lastCall) {
    throw new Error("betterAuth was not called");
  }
  return lastCall[0] as CapturedBetterAuthOptions;
}

function makeConfig(
  overrides: {
    sendEmail?: ReturnType<typeof vi.fn>;
    renderTemplate?: ReturnType<typeof vi.fn>;
    disableSignup?: boolean;
    cookieCacheMaxAge?: number;
    organizationsEnabled?: boolean;
    google?: { clientId: string; clientSecret: string; redirectURI?: string };
    passkey?: { enabled: boolean; rpName?: string; rpID?: string; origin?: string };
    twoFactor?: { enabled: boolean; issuer?: string };
  } = {},
) {
  const renderTemplate =
    overrides.renderTemplate ??
    vi.fn(
      async (
        category: string,
        props: {
          appName: string;
          url?: string;
          unsubscribeUrl?: string;
          inviterName?: string;
          organizationName?: string;
        },
      ) => {
        const fragments = [
          `<html><body>${category} for ${props.appName}`,
          props.url ? ` <a href="${props.url}">${props.url}</a>` : "",
          props.inviterName ? ` from ${props.inviterName}` : "",
          props.organizationName ? ` to ${props.organizationName}` : "",
          category === "auth.account-deletion" ? " (irreversível)" : "",
          props.unsubscribeUrl ? ` <a href="${props.unsubscribeUrl}">Cancele a assinatura</a>` : "",
          "</body></html>",
        ];
        return {
          subject: `${props.appName} — ${category}`,
          html: fragments.join(""),
          text: fragments.join("").replace(/<[^>]+>/g, " "),
        };
      },
    );
  return {
    appName: "Test App",
    baseUrl: "https://test.example.com",
    secret: "0123456789abcdef0123456789abcdef",
    sendEmail: overrides.sendEmail ?? vi.fn().mockResolvedValue({ ok: true, status: "sent" }),
    renderTemplate,
    buildUnsubscribeUrl: vi.fn(
      (id: string, cat: string) => `https://test.example.com/api/email/unsubscribe?t=${id}-${cat}`,
    ),
    unsubscribeMailto: "unsubscribe@test.example.com",
    trustedOrigins: ["https://other.example.com"],
    disableSignup: overrides.disableSignup,
    session:
      overrides.cookieCacheMaxAge !== undefined
        ? { cookieCache: { maxAge: overrides.cookieCacheMaxAge } }
        : undefined,
    organizations: overrides.organizationsEnabled ? { enabled: true } : undefined,
    socialProviders: overrides.google ? { google: overrides.google } : undefined,
    passkey: overrides.passkey,
    twoFactor: overrides.twoFactor,
  };
}

describe("createAuth — Better Auth wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards appName/baseUrl/secret/trustedOrigins to betterAuth", () => {
    createAuth(makeConfig());
    const cfg = captureConfig();
    expect(cfg.appName).toBe("Test App");
    expect(cfg.baseURL).toBe("https://test.example.com");
    expect(cfg.secret).toBe("0123456789abcdef0123456789abcdef");
    expect(cfg.trustedOrigins).toEqual(["https://other.example.com"]);
  });

  it("uses crypto.randomUUID() as the id generator", () => {
    createAuth(makeConfig());
    const id = captureConfig().advanced?.database?.generateId?.();
    expect(id).toBeDefined();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it("requires email verification, revokes sessions on reset, and sends verification on signup", () => {
    createAuth(makeConfig());
    const cfg = captureConfig();
    expect(cfg.emailAndPassword?.enabled).toBe(true);
    expect(cfg.emailAndPassword?.requireEmailVerification).toBe(true);
    expect(cfg.emailAndPassword?.revokeSessionsOnPasswordReset).toBe(true);
    expect(cfg.emailVerification?.sendOnSignUp).toBe(true);
    expect(cfg.emailVerification?.autoSignInAfterVerification).toBe(true);
  });

  it("does NOT register a link-based sendVerificationEmail callback (OTP plugin owns verification)", () => {
    createAuth(makeConfig());
    const cfg = captureConfig();
    // The OTP plugin's overrideDefaultEmailVerification:true takes over.
    // Leaving sendVerificationEmail defined would be dead code.
    expect(cfg.emailVerification).not.toHaveProperty("sendVerificationEmail");
  });

  it("registers the Drizzle adapter with the auth tables", () => {
    createAuth(makeConfig());
    expect(mockedDrizzleAdapter).toHaveBeenCalledTimes(1);
    const [, options] = mockedDrizzleAdapter.mock.calls[0] ?? [];
    expect(options).toMatchObject({
      provider: "pg",
      schema: {
        user: { __mock: "users" },
        session: { __mock: "sessions" },
        account: { __mock: "accounts" },
        verification: { __mock: "verifications" },
        rateLimit: { __mock: "rateLimit" },
      },
    });
  });

  it("registers the magic link plugin", () => {
    createAuth(makeConfig());
    expect(mockedMagicLink).toHaveBeenCalledTimes(1);
  });

  it("registers the emailOTP plugin by default (verification: 'otp')", () => {
    createAuth(makeConfig());
    expect(mockedEmailOtp).toHaveBeenCalledTimes(1);
  });
});

describe("createAuth — email plugin selection (config.email)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("default config: emailOTP loaded with overrideDefaultEmailVerification + sendVerificationOnSignUp", () => {
    createAuth(makeConfig());
    const otpCall = mockedEmailOtp.mock.calls[0]?.[0] as {
      overrideDefaultEmailVerification: boolean;
      sendVerificationOnSignUp: boolean;
      disableSignUp: boolean;
    };
    expect(otpCall.overrideDefaultEmailVerification).toBe(true);
    expect(otpCall.sendVerificationOnSignUp).toBe(true);
    expect(otpCall.disableSignUp).toBe(true);
  });

  it("verification: 'link' — emailOTP NOT loaded, sendVerificationEmail callback IS defined", async () => {
    const sendEmail = vi.fn().mockResolvedValue({ ok: true, status: "sent" });
    createAuth({ ...makeConfig({ sendEmail }), email: { verification: "link" } });
    expect(mockedEmailOtp).not.toHaveBeenCalled();
    const cfg = captureConfig();
    expect(typeof cfg.emailVerification?.sendVerificationEmail).toBe("function");

    await cfg.emailVerification?.sendVerificationEmail?.({
      user: { id: "u1", email: "verify@example.com" },
      url: "https://test.example.com/verify?token=abc",
      token: "tok-abc",
    });
    const payload = sendEmail.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.category).toBe("auth.verify-email");
    expectHashedMessageKey(payload.messageKey, "verify-email", "tok-abc");
  });

  it("verification: 'link' + signIn.otp: true — emailOTP loaded WITHOUT override, send-on-signup off", () => {
    createAuth({
      ...makeConfig(),
      email: { verification: "link", signIn: { otp: true } },
    });
    const otpCall = mockedEmailOtp.mock.calls[0]?.[0] as {
      overrideDefaultEmailVerification: boolean;
      sendVerificationOnSignUp: boolean;
    };
    expect(mockedEmailOtp).toHaveBeenCalledTimes(1);
    expect(otpCall.overrideDefaultEmailVerification).toBe(false);
    expect(otpCall.sendVerificationOnSignUp).toBe(false);
  });

  it("signIn.magicLink: false — magicLink plugin NOT loaded", () => {
    createAuth({ ...makeConfig(), email: { signIn: { magicLink: false } } });
    expect(mockedMagicLink).not.toHaveBeenCalled();
  });

  it("signIn.magicLink defaults to true (preserves backwards compat)", () => {
    createAuth(makeConfig());
    expect(mockedMagicLink).toHaveBeenCalledTimes(1);
  });

  it("forgetPassword: 'link' (default) — sendResetPassword callback IS defined", () => {
    createAuth(makeConfig());
    const cfg = captureConfig();
    expect(typeof cfg.emailAndPassword?.sendResetPassword).toBe("function");
  });

  it("forgetPassword: 'otp' — sendResetPassword callback NOT defined, emailOTP loaded", () => {
    createAuth({ ...makeConfig(), email: { forgetPassword: "otp" } });
    const cfg = captureConfig();
    expect(cfg.emailAndPassword?.sendResetPassword).toBeUndefined();
    expect(mockedEmailOtp).toHaveBeenCalledTimes(1);
  });

  it("OTP callback dispatches auth.sign-in-otp email when signIn.otp is enabled", async () => {
    const sendEmail = vi.fn().mockResolvedValue({ ok: true, status: "sent" });
    createAuth({
      ...makeConfig({ sendEmail }),
      email: { verification: "link", signIn: { otp: true } },
    });
    const otpConfig = mockedEmailOtp.mock.calls[0]?.[0] as {
      sendVerificationOTP: (input: {
        email: string;
        otp: string;
        type: "sign-in" | "email-verification" | "forget-password";
      }) => Promise<void>;
    };

    await otpConfig.sendVerificationOTP({
      email: "user@example.com",
      otp: "987654",
      type: "sign-in",
    });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const payload = sendEmail.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.category).toBe("auth.sign-in-otp");
    expectTransientMessageKey(payload.messageKey, "otp-sign-in", ["user@example.com", "987654"]);
  });

  it("OTP callback dispatches auth.forget-password-otp email when forgetPassword is 'otp'", async () => {
    const sendEmail = vi.fn().mockResolvedValue({ ok: true, status: "sent" });
    createAuth({
      ...makeConfig({ sendEmail }),
      email: { verification: "link", forgetPassword: "otp" },
    });
    const otpConfig = mockedEmailOtp.mock.calls[0]?.[0] as {
      sendVerificationOTP: (input: {
        email: string;
        otp: string;
        type: "sign-in" | "email-verification" | "forget-password";
      }) => Promise<void>;
    };

    await otpConfig.sendVerificationOTP({
      email: "user@example.com",
      otp: "111222",
      type: "forget-password",
    });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const payload = sendEmail.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.category).toBe("auth.forget-password-otp");
    expectTransientMessageKey(payload.messageKey, "otp-forget-password", [
      "user@example.com",
      "111222",
    ]);
  });

  it("OTP callback no-ops for sign-in type when signIn.otp is false", async () => {
    const sendEmail = vi.fn().mockResolvedValue({ ok: true, status: "sent" });
    createAuth({
      ...makeConfig({ sendEmail }),
      email: { verification: "otp", signIn: { otp: false } },
    });
    const otpConfig = mockedEmailOtp.mock.calls[0]?.[0] as {
      sendVerificationOTP: (input: {
        email: string;
        otp: string;
        type: "sign-in" | "email-verification" | "forget-password";
      }) => Promise<void>;
    };
    await otpConfig.sendVerificationOTP({
      email: "user@example.com",
      otp: "999000",
      type: "sign-in",
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("OTP callback no-ops for forget-password type when forgetPassword is 'link'", async () => {
    const sendEmail = vi.fn().mockResolvedValue({ ok: true, status: "sent" });
    createAuth({
      ...makeConfig({ sendEmail }),
      email: { verification: "otp", forgetPassword: "link" },
    });
    const otpConfig = mockedEmailOtp.mock.calls[0]?.[0] as {
      sendVerificationOTP: (input: {
        email: string;
        otp: string;
        type: "sign-in" | "email-verification" | "forget-password";
      }) => Promise<void>;
    };
    await otpConfig.sendVerificationOTP({
      email: "user@example.com",
      otp: "999000",
      type: "forget-password",
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("verification: 'link' + signIn.magicLink: false + forgetPassword: 'link' — neither OTP nor magicLink loaded", () => {
    createAuth({
      ...makeConfig(),
      email: {
        verification: "link",
        signIn: { magicLink: false, otp: false },
        forgetPassword: "link",
      },
    });
    expect(mockedEmailOtp).not.toHaveBeenCalled();
    expect(mockedMagicLink).not.toHaveBeenCalled();
  });
});

describe("createAuth — session cookie cache", () => {
  beforeEach(() => vi.clearAllMocks());

  it("enables cookie cache with a 300s default", () => {
    createAuth(makeConfig());
    const cookieCache = captureConfig().session?.cookieCache;
    expect(cookieCache?.enabled).toBe(true);
    expect(cookieCache?.maxAge).toBe(300);
  });

  it("respects an override on session.cookieCache.maxAge", () => {
    createAuth(makeConfig({ cookieCacheMaxAge: 30 }));
    expect(captureConfig().session?.cookieCache?.maxAge).toBe(30);
  });
});

describe("createAuth — disableSignup", () => {
  beforeEach(() => vi.clearAllMocks());

  it("defaults disableSignUp to false", () => {
    createAuth(makeConfig());
    expect(captureConfig().emailAndPassword?.disableSignUp).toBe(false);
  });

  it("propagates disableSignup to emailAndPassword.disableSignUp", () => {
    createAuth(makeConfig({ disableSignup: true }));
    expect(captureConfig().emailAndPassword?.disableSignUp).toBe(true);
  });
});

describe("createAuth — rate limit", () => {
  beforeEach(() => vi.clearAllMocks());

  it("enables rate limiting with database storage by default", () => {
    createAuth(makeConfig());
    const rl = captureConfig().rateLimit;
    expect(rl?.enabled).toBe(true);
    expect(rl?.storage).toBe("database");
    expect(rl?.modelName).toBe("rateLimit");
  });

  it("switches storage to secondary-storage when secondaryStorage is provided", () => {
    const secondary = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
    createAuth({ ...makeConfig(), secondaryStorage: secondary });
    expect(captureConfig().rateLimit?.storage).toBe("secondary-storage");
  });

  it("defines hardened anti-enumeration rules for sensitive endpoints", () => {
    createAuth(makeConfig());
    const rules = captureConfig().rateLimit?.customRules ?? {};
    expect(rules["/sign-in/email"]).toEqual({ window: 60, max: 5 });
    expect(rules["/sign-in/email-otp"]).toEqual({ window: 600, max: 5 });
    expect(rules["/sign-up/email"]).toEqual({ window: 3600, max: 5 });
    expect(rules["/forget-password"]).toEqual({ window: 3600, max: 3 });
    expect(rules["/forget-password/email-otp"]).toEqual({ window: 3600, max: 3 });
    expect(rules["/sign-in/magic-link"]).toEqual({ window: 600, max: 5 });
    expect(rules["/verify-email"]).toEqual({ window: 60, max: 10 });
    expect(rules["/reset-password"]).toEqual({ window: 3600, max: 5 });
    expect(rules["/email-otp/request-password-reset"]).toEqual({ window: 3600, max: 3 });
    expect(rules["/email-otp/reset-password"]).toEqual({ window: 3600, max: 5 });
    expect(rules["/email-otp/send-verification-otp"]).toEqual({ window: 60, max: 5 });
    expect(rules["/email-otp/verify-email"]).toEqual({ window: 60, max: 10 });
  });

  it("respects rateLimitRules overrides per endpoint", () => {
    createAuth({
      ...makeConfig(),
      rateLimitRules: { "/forget-password": { window: 60, max: 100 } },
    });
    const rules = captureConfig().rateLimit?.customRules ?? {};
    expect(rules["/forget-password"]).toEqual({ window: 60, max: 100 });
    expect(rules["/sign-in/email"]).toEqual({ window: 60, max: 5 });
  });
});

describe("createAuth — secondaryStorage passthrough", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not pass secondaryStorage when not configured", () => {
    createAuth(makeConfig());
    expect(captureConfig().secondaryStorage).toBeUndefined();
  });

  it("passes the secondaryStorage instance through to betterAuth", () => {
    const secondary = { get: vi.fn(), set: vi.fn(), delete: vi.fn() };
    createAuth({ ...makeConfig(), secondaryStorage: secondary });
    expect(captureConfig().secondaryStorage).toBe(secondary);
  });
});

describe("createAuth — observability hooks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("invokes onAuditEvent before persisting via logAuditEvent", async () => {
    const onAuditEvent = vi.fn();
    createAuth({ ...makeConfig(), observability: { onAuditEvent } });
    const cfg = captureConfig();
    await cfg.databaseHooks?.user?.create?.after?.({ id: "u1", email: "u@x.com" });
    expect(onAuditEvent).toHaveBeenCalledWith({
      eventType: "user.created",
      actorId: "u1",
      payload: { email: "u@x.com" },
    });
  });

  it("invokes onSecurityEvent on session.delete", async () => {
    const onSecurityEvent = vi.fn();
    createAuth({ ...makeConfig(), observability: { onSecurityEvent } });
    const cfg = captureConfig();
    await cfg.databaseHooks?.session?.delete?.after?.({ id: "s1", userId: "u1" });
    expect(onSecurityEvent).toHaveBeenCalledWith({
      type: "session_revoked",
      userId: "u1",
      metadata: { sessionId: "s1" },
    });
  });

  it("invokes onSecurityEvent when middleware sees a 429 status", async () => {
    const onSecurityEvent = vi.fn();
    createAuth({ ...makeConfig(), observability: { onSecurityEvent } });
    const handler = mockedAuthMiddleware.mock.calls.at(-1)?.[0] as (ctx: unknown) => Promise<void>;
    await handler({
      path: "/sign-in/email",
      context: { session: null, returned: { status: 429 } },
      body: {},
    });
    expect(onSecurityEvent).toHaveBeenCalledWith({
      type: "rate_limit_hit",
      userId: undefined,
      metadata: { path: "/sign-in/email" },
    });
  });

  it("does not break audit pipeline when observability hook throws", async () => {
    const onAuditEvent = vi.fn(() => {
      throw new Error("boom");
    });
    createAuth({ ...makeConfig(), observability: { onAuditEvent } });
    const cfg = captureConfig();
    await expect(
      cfg.databaseHooks?.user?.create?.after?.({ id: "u1", email: "u@x.com" }),
    ).resolves.not.toThrow();
  });

  it("does not break auth hooks when audit persistence fails", async () => {
    const onAuditPersistenceFailure = vi.fn();
    dbInsertChain.values.mockRejectedValueOnce(new Error("audit db down"));
    createAuth({ ...makeConfig(), observability: { onAuditPersistenceFailure } });
    const cfg = captureConfig();
    await expect(
      cfg.databaseHooks?.user?.create?.after?.({ id: "u1", email: "u@x.com" }),
    ).resolves.not.toThrow();
    expect(onAuditPersistenceFailure).toHaveBeenCalledWith({
      eventType: "user.created",
      actorId: "u1",
      payloadKeys: ["email"],
      error: {
        name: "Error",
        message: "audit db down",
      },
    });
  });
});

describe("createAuth — email callbacks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sendResetPassword uses the auth.password-reset category", async () => {
    const sendEmail = vi.fn().mockResolvedValue({ ok: true, status: "sent" });
    createAuth(makeConfig({ sendEmail }));
    const cfg = captureConfig();

    await cfg.emailAndPassword?.sendResetPassword?.({
      user: { id: "u2", email: "reset@example.com" },
      url: "https://test.example.com/reset?token=xyz",
      token: "tok-xyz",
    });

    const payload = sendEmail.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.category).toBe("auth.password-reset");
    expectHashedMessageKey(payload.messageKey, "password-reset", "tok-xyz");
    expect(payload.userId).toBe("u2");
  });

  it("emailOTP.sendVerificationOTP uses auth.verify-email-otp category for email-verification type", async () => {
    const sendEmail = vi.fn().mockResolvedValue({ ok: true, status: "sent" });
    createAuth(makeConfig({ sendEmail }));

    const otpConfig = mockedEmailOtp.mock.calls[0]?.[0] as {
      otpLength: number;
      expiresIn: number;
      allowedAttempts: number;
      sendVerificationOnSignUp: boolean;
      overrideDefaultEmailVerification: boolean;
      sendVerificationOTP: (input: {
        email: string;
        otp: string;
        type: "sign-in" | "email-verification" | "forget-password";
      }) => Promise<void>;
    };

    expect(otpConfig.otpLength).toBe(6);
    expect(otpConfig.expiresIn).toBe(600);
    expect(otpConfig.allowedAttempts).toBe(3);
    expect(otpConfig.sendVerificationOnSignUp).toBe(true);
    expect(otpConfig.overrideDefaultEmailVerification).toBe(true);

    await otpConfig.sendVerificationOTP({
      email: "verify@example.com",
      otp: "123456",
      type: "email-verification",
    });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const payload = sendEmail.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.to).toBe("verify@example.com");
    expect(payload.category).toBe("auth.verify-email-otp");
    expectTransientMessageKey(payload.messageKey, "otp-email-verification", [
      "verify@example.com",
      "123456",
    ]);
    expect(payload.unsubscribeUrl).toBe(
      "https://test.example.com/api/email/unsubscribe?t=verify@example.com-auth.verify-email-otp",
    );
    expect(payload.unsubscribeMailto).toBe("unsubscribe@test.example.com");
    expect(payload.subject).toContain("Test App");
    expect(String(payload.html)).toContain("Cancele a assinatura");
  });

  it("emailOTP.sendVerificationOTP no-ops for sign-in / forget-password types (V1 scope)", async () => {
    const sendEmail = vi.fn().mockResolvedValue({ ok: true, status: "sent" });
    createAuth(makeConfig({ sendEmail }));

    const otpConfig = mockedEmailOtp.mock.calls[0]?.[0] as {
      sendVerificationOTP: (input: {
        email: string;
        otp: string;
        type: "sign-in" | "email-verification" | "forget-password";
      }) => Promise<void>;
    };

    await otpConfig.sendVerificationOTP({
      email: "u@x.com",
      otp: "999111",
      type: "sign-in",
    });
    await otpConfig.sendVerificationOTP({
      email: "u@x.com",
      otp: "999222",
      type: "forget-password",
    });

    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("magicLink.sendMagicLink uses email as identifier (no userId required)", async () => {
    const sendEmail = vi.fn().mockResolvedValue({ ok: true, status: "sent" });
    createAuth(makeConfig({ sendEmail }));

    const magicLinkConfig = mockedMagicLink.mock.calls[0]?.[0] as {
      sendMagicLink: (input: { email: string; url: string; token: string }) => Promise<void>;
    };

    await magicLinkConfig.sendMagicLink({
      email: "magic@example.com",
      url: "https://test.example.com/magic?token=qqq",
      token: "tok-qqq",
    });

    const payload = sendEmail.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.category).toBe("auth.magic-link");
    expectHashedMessageKey(payload.messageKey, "magic-link", "tok-qqq");
    expect(payload.userId).toBeUndefined();
    expect(payload.unsubscribeUrl).toContain("magic@example.com-auth.magic-link");
  });
});

describe("createAuth — audit hooks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("databaseHooks.user.create.after writes a user.created audit event", async () => {
    createAuth(makeConfig());
    const cfg = captureConfig();
    await cfg.databaseHooks?.user?.create?.after?.({ id: "u1", email: "u@x.com" });
    expect(dbInsertChain.values).toHaveBeenCalledTimes(1);
    const args = dbInsertChain.values.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(args.eventType).toBe("user.created");
    expect(args.actorId).toBe("u1");
    expect(args.payload).toEqual({ email: "u@x.com" });
  });

  it("databaseHooks.session.create.after writes session.created with ip/ua", async () => {
    createAuth(makeConfig());
    const cfg = captureConfig();
    await cfg.databaseHooks?.session?.create?.after?.({
      id: "s1",
      userId: "u1",
      ipAddress: "1.2.3.4",
      userAgent: "ua",
    });
    const args = dbInsertChain.values.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(args.eventType).toBe("session.created");
    expect(args.actorId).toBe("u1");
    expect((args.payload as Record<string, unknown>).sessionId).toBe("s1");
    expect((args.payload as Record<string, unknown>).ipAddress).toBe("1.2.3.4");
  });

  it("databaseHooks.session.delete.after writes a session.revoked audit event", async () => {
    createAuth(makeConfig());
    const cfg = captureConfig();
    await cfg.databaseHooks?.session?.delete?.after?.({ id: "s9", userId: "u1" });
    const args = dbInsertChain.values.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(args.eventType).toBe("session.revoked");
    expect(args.actorId).toBe("u1");
    expect((args.payload as Record<string, unknown>).sessionId).toBe("s9");
  });

  it("databaseHooks.account.create.after writes account.linked with providerId", async () => {
    createAuth(makeConfig());
    const cfg = captureConfig();
    await cfg.databaseHooks?.account?.create?.after?.({
      id: "a1",
      userId: "u1",
      providerId: "google",
    });
    const args = dbInsertChain.values.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(args.eventType).toBe("account.linked");
    expect(args.actorId).toBe("u1");
    expect((args.payload as Record<string, unknown>).providerId).toBe("google");
    expect((args.payload as Record<string, unknown>).accountId).toBe("a1");
  });

  it("hooks.after for /sign-out logs auth.sign_out for the current user", async () => {
    createAuth(makeConfig());
    const handler = mockedAuthMiddleware.mock.calls.at(-1)?.[0] as (ctx: unknown) => Promise<void>;
    expect(handler).toBeTypeOf("function");
    await handler({
      path: "/sign-out",
      context: { session: { user: { id: "u1" } } },
      body: {},
    });
    const args = dbInsertChain.values.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(args.eventType).toBe("auth.sign_out");
    expect(args.actorId).toBe("u1");
  });

  it("hooks.after for /forget-password logs the email and a null actor (pre-auth)", async () => {
    createAuth(makeConfig());
    const handler = mockedAuthMiddleware.mock.calls.at(-1)?.[0] as (ctx: unknown) => Promise<void>;
    await handler({
      path: "/forget-password",
      context: { session: null },
      body: { email: "forget@x.com" },
    });
    const args = dbInsertChain.values.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(args.eventType).toBe("auth.forget_password_requested");
    expect(args.actorId).toBeNull();
    expect((args.payload as Record<string, unknown>).email).toBe("forget@x.com");
  });

  it("hooks.after for OTP password-reset requests logs the email and a null actor", async () => {
    createAuth(makeConfig());
    const handler = mockedAuthMiddleware.mock.calls.at(-1)?.[0] as (ctx: unknown) => Promise<void>;
    await handler({
      path: "/email-otp/request-password-reset",
      context: { session: null },
      body: { email: "forget-otp@x.com" },
    });
    const args = dbInsertChain.values.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(args.eventType).toBe("auth.forget_password_requested");
    expect(args.actorId).toBeNull();
    expect((args.payload as Record<string, unknown>).email).toBe("forget-otp@x.com");
  });

  it("hooks.after for /email-otp/send-verification-otp audits sign-in OTP requests", async () => {
    createAuth(makeConfig());
    const handler = mockedAuthMiddleware.mock.calls.at(-1)?.[0] as (ctx: unknown) => Promise<void>;
    await handler({
      path: "/email-otp/send-verification-otp",
      context: { session: null },
      body: { email: "signin@x.com", type: "sign-in" },
    });
    const args = dbInsertChain.values.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(args.eventType).toBe("auth.sign_in_otp_requested");
    expect(args.actorId).toBeNull();
    expect((args.payload as Record<string, unknown>).email).toBe("signin@x.com");
  });

  it("hooks.after for /email-otp/send-verification-otp audits forget-password OTP requests", async () => {
    createAuth(makeConfig());
    const handler = mockedAuthMiddleware.mock.calls.at(-1)?.[0] as (ctx: unknown) => Promise<void>;
    await handler({
      path: "/email-otp/send-verification-otp",
      context: { session: null },
      body: { email: "forget-via-send@x.com", type: "forget-password" },
    });
    const args = dbInsertChain.values.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(args.eventType).toBe("auth.forget_password_requested");
    expect(args.actorId).toBeNull();
    expect((args.payload as Record<string, unknown>).email).toBe("forget-via-send@x.com");
  });

  it("hooks.after for /reset-password logs auth.password_reset_completed", async () => {
    createAuth(makeConfig());
    const handler = mockedAuthMiddleware.mock.calls.at(-1)?.[0] as (ctx: unknown) => Promise<void>;
    await handler({
      path: "/reset-password",
      context: { session: { user: { id: "u1" } } },
      body: {},
    });
    const args = dbInsertChain.values.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(args.eventType).toBe("auth.password_reset_completed");
    expect(args.actorId).toBe("u1");
  });

  it("hooks.after for /email-otp/reset-password logs auth.password_reset_completed with email", async () => {
    createAuth(makeConfig());
    const handler = mockedAuthMiddleware.mock.calls.at(-1)?.[0] as (ctx: unknown) => Promise<void>;
    await handler({
      path: "/email-otp/reset-password",
      context: { session: null },
      body: { email: "reset-otp@x.com" },
    });
    const args = dbInsertChain.values.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(args.eventType).toBe("auth.password_reset_completed");
    expect(args.actorId).toBeNull();
    expect((args.payload as Record<string, unknown>).email).toBe("reset-otp@x.com");
  });

  it("hooks.after does not log success audit events for failed responses", async () => {
    createAuth(makeConfig());
    const handler = mockedAuthMiddleware.mock.calls.at(-1)?.[0] as (ctx: unknown) => Promise<void>;
    const before = dbInsertChain.values.mock.calls.length;
    await handler({
      path: "/reset-password",
      context: { session: { user: { id: "u1" } }, returned: { status: 400 } },
      body: {},
    });
    expect(dbInsertChain.values.mock.calls.length).toBe(before);
  });

  it("hooks.after for /verify-email logs email.verified", async () => {
    createAuth(makeConfig());
    const handler = mockedAuthMiddleware.mock.calls.at(-1)?.[0] as (ctx: unknown) => Promise<void>;
    await handler({
      path: "/verify-email",
      context: { session: { user: { id: "u1" } } },
      body: {},
    });
    const args = dbInsertChain.values.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(args.eventType).toBe("email.verified");
    expect(args.actorId).toBe("u1");
  });

  it("hooks.after for /email-otp/verify-email logs email.verified", async () => {
    createAuth(makeConfig());
    const handler = mockedAuthMiddleware.mock.calls.at(-1)?.[0] as (ctx: unknown) => Promise<void>;
    await handler({
      path: "/email-otp/verify-email",
      context: { session: { user: { id: "u1" } } },
      body: {},
    });
    const args = dbInsertChain.values.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(args.eventType).toBe("email.verified");
    expect(args.actorId).toBe("u1");
  });

  it("hooks.after for /change-password logs user.password_changed", async () => {
    createAuth(makeConfig());
    const handler = mockedAuthMiddleware.mock.calls.at(-1)?.[0] as (ctx: unknown) => Promise<void>;
    await handler({
      path: "/change-password",
      context: { session: { user: { id: "u1" } } },
      body: {},
    });
    const args = dbInsertChain.values.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(args.eventType).toBe("user.password_changed");
    expect(args.actorId).toBe("u1");
  });

  it("hooks.after for /two-factor/enable logs auth.two_factor_enabled", async () => {
    createAuth(makeConfig());
    const handler = mockedAuthMiddleware.mock.calls.at(-1)?.[0] as (ctx: unknown) => Promise<void>;
    await handler({
      path: "/two-factor/enable",
      context: { session: { user: { id: "u1" } } },
      body: {},
    });
    const args = dbInsertChain.values.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(args.eventType).toBe("auth.two_factor_enabled");
    expect(args.actorId).toBe("u1");
  });

  it("hooks.after for /two-factor/disable logs auth.two_factor_disabled", async () => {
    createAuth(makeConfig());
    const handler = mockedAuthMiddleware.mock.calls.at(-1)?.[0] as (ctx: unknown) => Promise<void>;
    await handler({
      path: "/two-factor/disable",
      context: { session: { user: { id: "u1" } } },
      body: {},
    });
    const args = dbInsertChain.values.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(args.eventType).toBe("auth.two_factor_disabled");
  });

  it("hooks.after for /two-factor/verify-totp logs verification on success and emits security event on failure", async () => {
    const onSecurityEvent = vi.fn();
    createAuth({ ...makeConfig(), observability: { onSecurityEvent } });
    const handler = mockedAuthMiddleware.mock.calls.at(-1)?.[0] as (ctx: unknown) => Promise<void>;

    await handler({
      path: "/two-factor/verify-totp",
      context: { session: { user: { id: "u1" } }, returned: { status: 200 } },
      body: {},
    });
    expect(dbInsertChain.values.mock.calls.at(-1)?.[0]).toMatchObject({
      eventType: "auth.two_factor_verified",
      actorId: "u1",
    });

    const beforeFail = dbInsertChain.values.mock.calls.length;
    await handler({
      path: "/two-factor/verify-totp",
      context: { session: { user: { id: "u1" } }, returned: { status: 401 } },
      body: {},
    });
    expect(dbInsertChain.values.mock.calls.length).toBe(beforeFail);
    expect(onSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "two_factor_failed", userId: "u1" }),
    );
  });

  it("hooks.after for /two-factor/verify-backup-code logs auth.backup_code_used on success", async () => {
    createAuth(makeConfig());
    const handler = mockedAuthMiddleware.mock.calls.at(-1)?.[0] as (ctx: unknown) => Promise<void>;
    await handler({
      path: "/two-factor/verify-backup-code",
      context: { session: { user: { id: "u1" } }, returned: { status: 200 } },
      body: {},
    });
    expect(dbInsertChain.values.mock.calls.at(-1)?.[0]).toMatchObject({
      eventType: "auth.backup_code_used",
      actorId: "u1",
    });
  });

  it("hooks.after for /change-email logs user.email_changed with the new email", async () => {
    createAuth(makeConfig());
    const handler = mockedAuthMiddleware.mock.calls.at(-1)?.[0] as (ctx: unknown) => Promise<void>;
    await handler({
      path: "/change-email",
      context: { session: { user: { id: "u1" } } },
      body: { newEmail: "new@example.com" },
    });
    const args = dbInsertChain.values.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(args.eventType).toBe("user.email_changed");
    expect(args.actorId).toBe("u1");
    expect((args.payload as Record<string, unknown>).newEmail).toBe("new@example.com");
  });

  it("hooks.after ignores unrelated paths", async () => {
    createAuth(makeConfig());
    const handler = mockedAuthMiddleware.mock.calls.at(-1)?.[0] as (ctx: unknown) => Promise<void>;
    const before = dbInsertChain.values.mock.calls.length;
    await handler({ path: "/some/other/path", context: { session: null }, body: {} });
    expect(dbInsertChain.values.mock.calls.length).toBe(before);
  });
});

describe("createAuth — additional user fields", () => {
  beforeEach(() => vi.clearAllMocks());

  it("declares role/banned/banReason/banExpiresAt as additionalFields with input:false", () => {
    createAuth(makeConfig());
    const fields = captureConfig().user?.additionalFields ?? {};
    expect(fields.role).toMatchObject({ type: "string", defaultValue: "member", input: false });
    expect(fields.banned).toMatchObject({ type: "boolean", defaultValue: false, input: false });
    expect(fields.banReason).toMatchObject({ type: "string", input: false });
    expect(fields.banExpiresAt).toMatchObject({ type: "date", input: false });
  });
});

describe("createAuth — role/ban management helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbUpdateChain.rows = [{ id: "target1" }];
  });

  function mockCurrentSession(user: { id: string; role: string }) {
    const authInstance = mockedBetterAuth.mock.results.at(-1)?.value as {
      api: { getSession: ReturnType<typeof vi.fn> };
    };
    authInstance.api.getSession.mockResolvedValue({ user, session: { id: "s1" } });
  }

  it("does not rely on user.update database hooks for role/ban side effects", () => {
    createAuth(makeConfig());
    expect(captureConfig().databaseHooks?.user?.update).toBeUndefined();
  });

  it("setUserRole updates the target, audits actor/target, and revokes cached role sessions", async () => {
    const result = createAuth({ ...makeConfig(), cacheRoleOnSession: true });
    mockCurrentSession({ id: "actor1", role: "owner" });

    await result.setUserRole(new Headers(), "target1", "admin");

    expect(dbUpdateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ role: "admin", updatedAt: expect.any(Date) }),
    );
    expect(dbUpdateChain.where).toHaveBeenCalledWith({ field: "users.id", value: "target1" });
    const args = dbInsertChain.values.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(args.eventType).toBe("user.role_changed");
    expect(args.actorId).toBe("actor1");
    expect((args.payload as Record<string, unknown>).targetId).toBe("target1");
    expect((args.payload as Record<string, unknown>).newRole).toBe("admin");
    expect(dbDeleteChain.where).toHaveBeenCalledWith({
      field: "sessions.user_id",
      value: "target1",
    });
  });

  it("setUserRole rejects callers without users.set_role permission", async () => {
    const result = createAuth(makeConfig());
    mockCurrentSession({ id: "actor1", role: "admin" });

    await expect(result.setUserRole(new Headers(), "target1", "owner")).rejects.toThrow(
      /permission "users\.set_role" denied/,
    );
    expect(dbUpdateChain.set).not.toHaveBeenCalled();
  });

  it("setUserBanState audits active bans and revokes the target sessions", async () => {
    const result = createAuth(makeConfig());
    mockCurrentSession({ id: "actor1", role: "admin" });

    await result.setUserBanState(new Headers(), {
      userId: "target1",
      banned: true,
      banReason: "spam",
    });

    expect(dbUpdateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        banned: true,
        banReason: "spam",
        banExpiresAt: null,
        updatedAt: expect.any(Date),
      }),
    );
    const args = dbInsertChain.values.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(args.eventType).toBe("user.banned");
    expect(args.actorId).toBe("actor1");
    expect((args.payload as Record<string, unknown>).targetId).toBe("target1");
    expect((args.payload as Record<string, unknown>).reason).toBe("spam");
    expect(dbDeleteChain.where).toHaveBeenCalledWith({
      field: "sessions.user_id",
      value: "target1",
    });
  });

  it("setUserBanState does not revoke sessions for already-expired bans", async () => {
    const result = createAuth(makeConfig());
    mockCurrentSession({ id: "actor1", role: "admin" });

    await result.setUserBanState(new Headers(), {
      userId: "target1",
      banned: true,
      banExpiresAt: new Date(Date.now() - 60_000),
    });

    expect(dbDeleteChain.where).not.toHaveBeenCalled();
  });

  it("setUserBanState clears ban metadata when unbanning", async () => {
    const result = createAuth(makeConfig());
    mockCurrentSession({ id: "actor1", role: "admin" });

    await result.setUserBanState(new Headers(), { userId: "target1", banned: false });

    expect(dbUpdateChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        banned: false,
        banReason: null,
        banExpiresAt: null,
        updatedAt: expect.any(Date),
      }),
    );
    const args = dbInsertChain.values.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(args.eventType).toBe("user.unbanned");
    expect(args.actorId).toBe("actor1");
    expect(dbDeleteChain.where).not.toHaveBeenCalled();
  });

  it("throws NotFoundError when the target user does not exist", async () => {
    dbUpdateChain.rows = [];
    const result = createAuth(makeConfig());
    mockCurrentSession({ id: "actor1", role: "owner" });

    await expect(result.setUserRole(new Headers(), "missing", "admin")).rejects.toThrow(
      /target user not found/,
    );
  });
});

describe("createAuth — organization plugin (opt-in)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not register the organization plugin when organizations is undefined", () => {
    createAuth(makeConfig());
    expect(mockedOrganization).not.toHaveBeenCalled();
  });

  it("does not register the organization plugin when organizations.enabled is false", () => {
    const cfg = { ...makeConfig(), organizations: { enabled: false } };
    createAuth(cfg);
    expect(mockedOrganization).not.toHaveBeenCalled();
  });

  it("registers the organization plugin when organizations.enabled is true", () => {
    createAuth(makeConfig({ organizationsEnabled: true }));
    expect(mockedOrganization).toHaveBeenCalledTimes(1);
  });

  it("excludes organization tables from the drizzle schema when disabled", () => {
    createAuth(makeConfig());
    const [, options] = mockedDrizzleAdapter.mock.calls[0] ?? [];
    const schema = (options as { schema: Record<string, unknown> }).schema;
    expect(schema.organization).toBeUndefined();
    expect(schema.member).toBeUndefined();
    expect(schema.invitation).toBeUndefined();
  });

  it("includes organization tables in the drizzle schema when enabled", () => {
    createAuth(makeConfig({ organizationsEnabled: true }));
    const [, options] = mockedDrizzleAdapter.mock.calls[0] ?? [];
    const schema = (options as { schema: Record<string, unknown> }).schema;
    expect(schema.organization).toEqual({ __mock: "organizations" });
    expect(schema.member).toEqual({ __mock: "members" });
    expect(schema.invitation).toEqual({ __mock: "invitations" });
  });

  it("sendInvitationEmail uses category auth.invitation, the inviter id, and emits org.invitation_sent", async () => {
    const sendEmail = vi.fn().mockResolvedValue({ ok: true, status: "sent" });
    createAuth(makeConfig({ sendEmail, organizationsEnabled: true }));

    const orgConfig = mockedOrganization.mock.calls[0]?.[0] as {
      sendInvitationEmail: (data: {
        id: string;
        email: string;
        role?: string;
        organization: { id: string; name: string };
        inviter: { user: { id: string; name: string } };
      }) => Promise<void>;
    };

    await orgConfig.sendInvitationEmail({
      id: "inv1",
      email: "guest@example.com",
      role: "member",
      organization: { id: "org1", name: "Acme" },
      inviter: { user: { id: "u1", name: "Helena" } },
    });

    const emailPayload = sendEmail.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(emailPayload.to).toBe("guest@example.com");
    expect(emailPayload.category).toBe("auth.invitation");
    expectHashedMessageKey(emailPayload.messageKey, "invitation", "inv1");
    expect(String(emailPayload.html)).toContain("Helena");
    expect(String(emailPayload.html)).toContain("Acme");
    expect(String(emailPayload.html)).toContain("/accept-invitation/inv1");

    const auditArgs = dbInsertChain.values.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(auditArgs.eventType).toBe("org.invitation_sent");
    expect(auditArgs.actorId).toBe("u1");
    expect((auditArgs.payload as Record<string, unknown>).invitationId).toBe("inv1");
    expect((auditArgs.payload as Record<string, unknown>).organizationId).toBe("org1");
  });

  it("hooks.after for /organization/create logs org.created", async () => {
    createAuth(makeConfig({ organizationsEnabled: true }));
    const handler = mockedAuthMiddleware.mock.calls.at(-1)?.[0] as (ctx: unknown) => Promise<void>;
    await handler({
      path: "/organization/create",
      context: { session: { user: { id: "u1" } } },
      body: {},
    });
    const args = dbInsertChain.values.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(args.eventType).toBe("org.created");
    expect(args.actorId).toBe("u1");
  });

  it("hooks.after for /organization/accept-invitation logs org.member_added", async () => {
    createAuth(makeConfig({ organizationsEnabled: true }));
    const handler = mockedAuthMiddleware.mock.calls.at(-1)?.[0] as (ctx: unknown) => Promise<void>;
    await handler({
      path: "/organization/accept-invitation",
      context: { session: { user: { id: "u2" } } },
      body: {},
    });
    const args = dbInsertChain.values.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(args.eventType).toBe("org.member_added");
    expect(args.actorId).toBe("u2");
  });

  it("hooks.after for /organization/remove-member logs org.member_removed", async () => {
    createAuth(makeConfig({ organizationsEnabled: true }));
    const handler = mockedAuthMiddleware.mock.calls.at(-1)?.[0] as (ctx: unknown) => Promise<void>;
    await handler({
      path: "/organization/remove-member",
      context: { session: { user: { id: "u3" } } },
      body: {},
    });
    const args = dbInsertChain.values.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(args.eventType).toBe("org.member_removed");
    expect(args.actorId).toBe("u3");
  });
});

describe("createAuth — Google OAuth (opt-in)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not pass socialProviders when no Google credentials", () => {
    createAuth(makeConfig());
    expect(captureConfig().socialProviders).toBeUndefined();
  });

  it("forwards Google credentials to socialProviders.google", () => {
    createAuth(
      makeConfig({
        google: { clientId: "google-client-id", clientSecret: "google-client-secret" },
      }),
    );
    const social = captureConfig().socialProviders;
    expect(social?.google?.clientId).toBe("google-client-id");
    expect(social?.google?.clientSecret).toBe("google-client-secret");
  });
});

describe("createAuth — passkey plugin (opt-in)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not register passkey when passkey is undefined", () => {
    createAuth(makeConfig());
    expect(mockedPasskey).not.toHaveBeenCalled();
  });

  it("does not register passkey when passkey.enabled is false", () => {
    createAuth(makeConfig({ passkey: { enabled: false } }));
    expect(mockedPasskey).not.toHaveBeenCalled();
  });

  it("registers passkey with rpName=appName and rpID derived from baseUrl by default", () => {
    createAuth(makeConfig({ passkey: { enabled: true } }));
    expect(mockedPasskey).toHaveBeenCalledTimes(1);
    const passkeyConfig = mockedPasskey.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(passkeyConfig.rpName).toBe("Test App");
    expect(passkeyConfig.rpID).toBe("test.example.com");
  });

  it("respects rpName/rpID/origin overrides", () => {
    createAuth(
      makeConfig({
        passkey: { enabled: true, rpName: "Custom", rpID: "custom.example", origin: "https://x" },
      }),
    );
    const passkeyConfig = mockedPasskey.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(passkeyConfig.rpName).toBe("Custom");
    expect(passkeyConfig.rpID).toBe("custom.example");
    expect(passkeyConfig.origin).toBe("https://x");
  });

  it("excludes passkey from drizzle schema when disabled", () => {
    createAuth(makeConfig());
    const [, options] = mockedDrizzleAdapter.mock.calls[0] ?? [];
    const schema = (options as { schema: Record<string, unknown> }).schema;
    expect(schema.passkey).toBeUndefined();
  });

  it("includes passkey in drizzle schema when enabled", () => {
    createAuth(makeConfig({ passkey: { enabled: true } }));
    const [, options] = mockedDrizzleAdapter.mock.calls[0] ?? [];
    const schema = (options as { schema: Record<string, unknown> }).schema;
    expect(schema.passkey).toEqual({ __mock: "passkeys" });
  });
});

describe("createAuth — twoFactor plugin (opt-in)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not register twoFactor when undefined", () => {
    createAuth(makeConfig());
    expect(mockedTwoFactor).not.toHaveBeenCalled();
  });

  it("does not register twoFactor when enabled is false", () => {
    createAuth(makeConfig({ twoFactor: { enabled: false } }));
    expect(mockedTwoFactor).not.toHaveBeenCalled();
  });

  it("registers twoFactor with issuer=appName by default", () => {
    createAuth(makeConfig({ twoFactor: { enabled: true } }));
    expect(mockedTwoFactor).toHaveBeenCalledTimes(1);
    const twoFactorConfig = mockedTwoFactor.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(twoFactorConfig.issuer).toBe("Test App");
  });

  it("respects an issuer override", () => {
    createAuth(makeConfig({ twoFactor: { enabled: true, issuer: "MyAppIssuer" } }));
    const twoFactorConfig = mockedTwoFactor.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(twoFactorConfig.issuer).toBe("MyAppIssuer");
  });

  it("excludes twoFactor from drizzle schema when disabled", () => {
    createAuth(makeConfig());
    const [, options] = mockedDrizzleAdapter.mock.calls[0] ?? [];
    const schema = (options as { schema: Record<string, unknown> }).schema;
    expect(schema.twoFactor).toBeUndefined();
  });

  it("includes twoFactor in drizzle schema when enabled", () => {
    createAuth(makeConfig({ twoFactor: { enabled: true } }));
    const [, options] = mockedDrizzleAdapter.mock.calls[0] ?? [];
    const schema = (options as { schema: Record<string, unknown> }).schema;
    expect(schema.twoFactor).toEqual({ __mock: "twoFactors" });
  });
});

describe("createAuth — account deletion (opt-in)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not configure deleteUser when accountDeletion is undefined", () => {
    createAuth(makeConfig());
    expect(captureConfig().user?.deleteUser).toBeUndefined();
  });

  it("does not configure deleteUser when accountDeletion.enabled is false", () => {
    createAuth({ ...makeConfig(), accountDeletion: { enabled: false } });
    expect(captureConfig().user?.deleteUser).toBeUndefined();
  });

  it("enables deleteUser with verification email by default", () => {
    createAuth({ ...makeConfig(), accountDeletion: { enabled: true } });
    const deleteUser = captureConfig().user?.deleteUser;
    expect(deleteUser?.enabled).toBe(true);
    expect(typeof deleteUser?.sendDeleteAccountVerification).toBe("function");
  });

  it("skips sendDeleteAccountVerification when sendDeleteEmail is false", () => {
    createAuth({
      ...makeConfig(),
      accountDeletion: { enabled: true, sendDeleteEmail: false },
    });
    const deleteUser = captureConfig().user?.deleteUser;
    expect(deleteUser?.enabled).toBe(true);
    expect(deleteUser?.sendDeleteAccountVerification).toBeUndefined();
  });

  it("sendDeleteAccountVerification dispatches an email with the auth.account-deletion category", async () => {
    const sendEmail = vi.fn().mockResolvedValue({ ok: true, status: "sent" });
    createAuth({
      ...makeConfig({ sendEmail }),
      accountDeletion: { enabled: true },
    });
    const cfg = captureConfig();
    await cfg.user?.deleteUser?.sendDeleteAccountVerification?.({
      user: { id: "u1", email: "del@example.com" },
      url: "https://test.example.com/api/auth/delete-user/abc",
      token: "tok-del",
    });
    const payload = sendEmail.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.to).toBe("del@example.com");
    expect(payload.category).toBe("auth.account-deletion");
    expectHashedMessageKey(payload.messageKey, "account-deletion", "tok-del");
    expect(String(payload.html)).toContain("irrevers");
  });

  it("beforeDelete emits user.deletion_requested with the actor id", async () => {
    createAuth({ ...makeConfig(), accountDeletion: { enabled: true } });
    const cfg = captureConfig();
    await cfg.user?.deleteUser?.beforeDelete?.({ id: "u1", email: "del@x" });
    const args = dbInsertChain.values.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(args.eventType).toBe("user.deletion_requested");
    expect(args.actorId).toBe("u1");
    expect((args.payload as Record<string, unknown>).email).toBe("del@x");
  });

  it("afterDelete emits user.deleted with null actor (account already gone)", async () => {
    createAuth({ ...makeConfig(), accountDeletion: { enabled: true } });
    const cfg = captureConfig();
    await cfg.user?.deleteUser?.afterDelete?.({ id: "u1", email: "del@x" });
    const args = dbInsertChain.values.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(args.eventType).toBe("user.deleted");
    expect(args.actorId).toBeNull();
  });

  it("beforeDelete invokes onBeforeDelete hook (LGPD cross-package cleanup)", async () => {
    const onBeforeDelete = vi.fn(async () => undefined);
    createAuth({
      ...makeConfig(),
      accountDeletion: { enabled: true, onBeforeDelete },
    });
    const cfg = captureConfig();
    await cfg.user?.deleteUser?.beforeDelete?.({ id: "u1", email: "del@x" });
    expect(onBeforeDelete).toHaveBeenCalledWith({ id: "u1", email: "del@x" });
  });

  it("afterDelete invokes onAfterDelete hook", async () => {
    const onAfterDelete = vi.fn(async () => undefined);
    createAuth({
      ...makeConfig(),
      accountDeletion: { enabled: true, onAfterDelete },
    });
    const cfg = captureConfig();
    await cfg.user?.deleteUser?.afterDelete?.({ id: "u1", email: "del@x" });
    expect(onAfterDelete).toHaveBeenCalledWith({ id: "u1", email: "del@x" });
  });

  it("onBeforeDelete failure is captured in audit, deletion proceeds", async () => {
    const onBeforeDelete = vi.fn(async () => {
      throw new Error("billing api down");
    });
    createAuth({
      ...makeConfig(),
      accountDeletion: { enabled: true, onBeforeDelete },
    });
    const cfg = captureConfig();
    await expect(
      cfg.user?.deleteUser?.beforeDelete?.({ id: "u1", email: "del@x" }),
    ).resolves.toBeUndefined();
    // The second insert call should be the failure-capture audit event
    const lastInsert = dbInsertChain.values.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(lastInsert.eventType).toBe("user.deletion_requested");
    const payload = lastInsert.payload as Record<string, unknown>;
    expect(payload.hookError).toBe("billing api down");
    expect(payload.stage).toBe("onBeforeDelete");
  });

  it("onAfterDelete failure is captured in audit, does not throw", async () => {
    const onAfterDelete = vi.fn(async () => {
      throw new Error("downstream cleanup failed");
    });
    createAuth({
      ...makeConfig(),
      accountDeletion: { enabled: true, onAfterDelete },
    });
    const cfg = captureConfig();
    await expect(
      cfg.user?.deleteUser?.afterDelete?.({ id: "u1", email: "del@x" }),
    ).resolves.toBeUndefined();
    const lastInsert = dbInsertChain.values.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(lastInsert.eventType).toBe("user.deleted");
    const payload = lastInsert.payload as Record<string, unknown>;
    expect(payload.hookError).toBe("downstream cleanup failed");
    expect(payload.stage).toBe("onAfterDelete");
  });
});

describe("createAuth — cacheRoleOnSession (opt-in)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not declare session.role additionalField by default", () => {
    createAuth(makeConfig());
    expect(captureConfig().session?.additionalFields?.role).toBeUndefined();
  });

  it("declares session.role additionalField when cacheRoleOnSession is true", () => {
    createAuth({ ...makeConfig(), cacheRoleOnSession: true });
    expect(captureConfig().session?.additionalFields?.role).toMatchObject({
      type: "string",
      required: false,
    });
  });

  it("session.create.before populates role from the user when cacheRoleOnSession is true", async () => {
    createAuth({ ...makeConfig(), cacheRoleOnSession: true });
    const beforeHook = captureConfig().databaseHooks?.session?.create?.before;
    if (typeof beforeHook !== "function") throw new Error("session.create.before not registered");
    const findOne = vi.fn().mockResolvedValue({ role: "admin" });
    const result = await beforeHook({ userId: "u1" }, { context: { adapter: { findOne } } });
    if (result === false) throw new Error("session.create.before unexpectedly blocked session");
    expect(findOne).toHaveBeenCalledWith({
      model: "user",
      where: [{ field: "id", value: "u1" }],
    });
    expect(result.data).toMatchObject({ role: "admin", userId: "u1" });
  });

  it("session.create.before handles missing user gracefully", async () => {
    createAuth({ ...makeConfig(), cacheRoleOnSession: true });
    const beforeHook = captureConfig().databaseHooks?.session?.create?.before;
    if (typeof beforeHook !== "function") throw new Error("session.create.before not registered");
    const findOne = vi.fn().mockResolvedValue(null);
    const result = await beforeHook({ userId: "u1" }, { context: { adapter: { findOne } } });
    if (result === false) throw new Error("session.create.before unexpectedly blocked session");
    expect(result.data).toMatchObject({ role: null });
  });

  it("registers session.create.before by default to allow ban checks", () => {
    createAuth(makeConfig());
    expect(captureConfig().databaseHooks?.session?.create?.before).toBeTypeOf("function");
  });

  it("session.create.before blocks active banned users and emits a security event", async () => {
    const onSecurityEvent = vi.fn();
    createAuth({ ...makeConfig(), observability: { onSecurityEvent } });
    const beforeHook = captureConfig().databaseHooks?.session?.create?.before;
    if (typeof beforeHook !== "function") throw new Error("session.create.before not registered");
    const banExpiresAt = new Date(Date.now() + 60_000);
    const findOne = vi.fn().mockResolvedValue({ banned: true, banExpiresAt });
    const result = await beforeHook({ userId: "u1" }, { context: { adapter: { findOne } } });
    expect(result).toBe(false);
    expect(onSecurityEvent).toHaveBeenCalledWith({
      type: "banned_user_signin_attempt",
      userId: "u1",
      metadata: { banExpiresAt },
    });
  });

  it("session.create.before allows expired bans", async () => {
    createAuth(makeConfig());
    const beforeHook = captureConfig().databaseHooks?.session?.create?.before;
    if (typeof beforeHook !== "function") throw new Error("session.create.before not registered");
    const findOne = vi.fn().mockResolvedValue({
      banned: true,
      banExpiresAt: new Date(Date.now() - 60_000),
    });
    const result = await beforeHook({ userId: "u1" }, { context: { adapter: { findOne } } });
    if (result === false) throw new Error("session.create.before unexpectedly blocked session");
    expect(result.data).toEqual({ userId: "u1" });
  });
});

describe("createAuth — return shape", () => {
  beforeEach(() => vi.clearAllMocks());

  it("exposes the auth instance and helpers on the returned object", () => {
    const result = createAuth(makeConfig());
    expect(result.auth).toBeDefined();
    expect(typeof result.getSession).toBe("function");
    expect(typeof result.getCurrentUser).toBe("function");
    expect(typeof result.requireUser).toBe("function");
    expect(typeof result.requireRole).toBe("function");
    expect(typeof result.requireAdmin).toBe("function");
    expect(typeof result.hasRole).toBe("function");
    expect(typeof result.assertRole).toBe("function");
    expect(typeof result.assertPermission).toBe("function");
    expect(typeof result.hasAccessToProduct).toBe("function");
    expect(typeof result.setUserRole).toBe("function");
    expect(typeof result.setUserBanState).toBe("function");
  });
});
