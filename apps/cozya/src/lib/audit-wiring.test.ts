import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildUnsubscribeToken: vi.fn(() => "unsubscribe-token"),
  createAuth: vi.fn(() => ({
    auth: { handler: vi.fn() },
    getCurrentUser: vi.fn(),
    requireUser: vi.fn(),
    getSession: vi.fn(),
    hasRole: vi.fn(),
    assertRole: vi.fn(),
    assertPermission: vi.fn(),
  })),
  createBillingService: vi.fn(() => ({
    cancelBillingForSubject: vi.fn(async () => ({ canceled: 0, failed: 0 })),
    reconcileSubscriptions: vi.fn(),
    expireMonthlyBonusCredits: vi.fn(),
    releaseExpiredReservations: vi.fn(),
    retryDunningEmails: vi.fn(),
  })),
  createEmailService: vi.fn(() => ({
    sendEmail: vi.fn(),
    renderTemplate: vi.fn(),
    getOutbox: vi.fn(() => []),
    clearOutbox: vi.fn(),
  })),
  createSendGridSend: vi.fn(() => vi.fn()),
  createServerHelpers: vi.fn(() => ({
    getServerSession: vi.fn(),
    getCurrentUserServer: vi.fn(),
    requireUserServer: vi.fn(),
    redirectIfUnauthenticated: vi.fn(),
  })),
  handleSendgridEvents: vi.fn(),
  logAuditEvent: vi.fn(async () => undefined),
  processUnsubscribe: vi.fn(),
  recoverStaleDeliveries: vi.fn(),
  retryFailedDeliveries: vi.fn(),
  syncSendgridSuppressions: vi.fn(),
}));

type AuthConfig = {
  unsubscribeMailto?: string;
  observability?: {
    onAuditEvent?: unknown;
    onAuditPersistenceFailure?: unknown;
  };
  accountDeletion?: {
    onBeforeDelete?: (user: { id: string }) => Promise<void>;
  };
};

type AuditHookConfig = {
  onAudit?: (event: {
    eventType: string;
    actorId: string | null;
    payload: Record<string, unknown>;
  }) => void;
};

vi.mock("@informach/auth", () => ({
  createAuth: mocks.createAuth,
  logAuditEvent: mocks.logAuditEvent,
}));

vi.mock("@informach/auth/server", () => ({
  createServerHelpers: mocks.createServerHelpers,
}));

vi.mock("@/features/account/repository", () => ({
  hasOtherAppSubscriptions: vi.fn(async () => false),
  clearCozyaData: vi.fn(async () => undefined),
}));
vi.mock("@/features/account/legacy-ai", () => ({ purgeLegacyCozyaAi: vi.fn(async () => 0) }));

vi.mock("@informach/billing", () => ({
  createBillingService: mocks.createBillingService,
}));

vi.mock("@informach/config", () => ({
  APPS: {
    cozya: { name: "Cozya", slug: "cozya" },
  },
  PRODUCTS: [{ app: "cozya", id: "cozya-basic" }],
}));

vi.mock("@informach/db", () => ({
  db: {},
  eq: vi.fn(),
}));

vi.mock("@informach/db/schema", () => ({
  users: { id: "users.id", email: "users.email" },
}));

vi.mock("@informach/emails", () => ({
  buildUnsubscribeToken: mocks.buildUnsubscribeToken,
  createEmailService: mocks.createEmailService,
  createSendGridSend: mocks.createSendGridSend,
}));

vi.mock("@informach/emails/sweepers", () => ({
  recoverStaleDeliveries: mocks.recoverStaleDeliveries,
  retryFailedDeliveries: mocks.retryFailedDeliveries,
  syncSendgridSuppressions: mocks.syncSendgridSuppressions,
}));

vi.mock("@informach/emails/unsubscribe", () => ({
  processUnsubscribe: mocks.processUnsubscribe,
}));

vi.mock("@informach/emails/webhook", () => ({
  handleSendgridEvents: mocks.handleSendgridEvents,
}));

vi.mock("@sentry/nextjs", () => ({
  addBreadcrumb: vi.fn(),
  captureMessage: vi.fn(),
}));

function stubEnv(): void {
  vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost:5432/app");
  vi.stubEnv("BETTER_AUTH_SECRET", "0123456789abcdef0123456789abcdef");
  vi.stubEnv("BETTER_AUTH_URL", "https://cozya.example.com");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://cozya.example.com");
  vi.stubEnv("SENDGRID_API_KEY", "SG.test");
  vi.stubEnv("SENDGRID_FROM", "noreply@cozya.example.com");
  vi.stubEnv("EMAIL_SANDBOX_MODE", "memory");
  vi.stubEnv("CRON_SECRET", "0123456789abcdef0123456789abcdef");
  vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_123");
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_123");
  vi.stubEnv("OPENROUTER_API_KEY", "sk-or-test");
}

describe("audit wiring", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    stubEnv();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps auth, billing and emails connected to the audit pipeline", async () => {
    await import("./auth");

    const createAuthCalls = mocks.createAuth.mock.calls as unknown as Array<[AuthConfig]>;
    const authConfig = createAuthCalls[0]?.[0];
    expect(authConfig?.unsubscribeMailto).toBe("unsubscribe@cozya.example.com");
    expect(authConfig?.observability?.onAuditEvent).toBeTypeOf("function");
    expect(authConfig?.observability?.onAuditPersistenceFailure).toBeTypeOf("function");
    expect(mocks.createBillingService).not.toHaveBeenCalled();
    expect(authConfig?.accountDeletion?.onBeforeDelete).toBeTypeOf("function");
    if (!authConfig?.accountDeletion?.onBeforeDelete) {
      throw new Error("missing account deletion hook");
    }

    await authConfig.accountDeletion.onBeforeDelete({ id: "user-1" });

    const createBillingServiceCalls = mocks.createBillingService.mock.calls as unknown as Array<
      [AuditHookConfig]
    >;
    const billingConfig = createBillingServiceCalls[0]?.[0];
    expect(billingConfig?.onAudit).toBeTypeOf("function");
    if (!billingConfig?.onAudit) throw new Error("missing billing audit hook");
    billingConfig.onAudit({
      eventType: "billing.payment_succeeded",
      actorId: "user-1",
      payload: { invoiceId: "in_123" },
    });
    expect(mocks.logAuditEvent).toHaveBeenCalledWith("billing.payment_succeeded", "user-1", {
      invoiceId: "in_123",
      app: "cozya",
    });

    const createEmailServiceCalls = mocks.createEmailService.mock.calls as unknown as Array<
      [AuditHookConfig]
    >;
    const emailConfig = createEmailServiceCalls[0]?.[0];
    expect(emailConfig?.onAudit).toBeTypeOf("function");
    if (!emailConfig?.onAudit) throw new Error("missing email audit hook");
    emailConfig.onAudit({
      eventType: "email.delivery_sent",
      actorId: "user-1",
      payload: { deliveryId: "delivery-1" },
    });
    expect(mocks.logAuditEvent).toHaveBeenCalledWith("email.delivery_sent", "user-1", {
      deliveryId: "delivery-1",
    });
  });

  it("uses the sender domain for unsubscribe mailto when app URL is localhost", async () => {
    vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3002");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3002");
    vi.stubEnv("SENDGRID_FROM", "noreply@cozya.example.com");

    await import("./auth");

    const createAuthCalls = mocks.createAuth.mock.calls as unknown as Array<[AuthConfig]>;
    const authConfig = createAuthCalls[0]?.[0];
    expect(authConfig?.unsubscribeMailto).toBe("unsubscribe@cozya.example.com");
  });
});
