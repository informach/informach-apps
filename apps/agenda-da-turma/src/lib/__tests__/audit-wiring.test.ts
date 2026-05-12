import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildUnsubscribeToken: vi.fn(() => "unsubscribe-token"),
  createAuth: vi.fn(() => ({
    auth: { handler: vi.fn() },
    getCurrentUser: vi.fn(),
    requireUser: vi.fn(),
    getSession: vi.fn(),
    requireRole: vi.fn(),
    requireAdmin: vi.fn(),
    hasRole: vi.fn(),
    assertRole: vi.fn(),
    assertPermission: vi.fn(),
  })),
  createBillingService: vi.fn(() => ({
    cancelBillingForSubject: vi.fn(async () => ({ canceled: 0, failed: 0 })),
  })),
  createEmailService: vi.fn(() => ({
    sendEmail: vi.fn(),
    renderTemplate: vi.fn(),
    getOutbox: vi.fn(() => []),
    clearOutbox: vi.fn(),
  })),
  createServerHelpers: vi.fn(() => ({
    getServerSession: vi.fn(),
    getCurrentUserServer: vi.fn(),
    requireUserServer: vi.fn(),
    redirectIfUnauthenticated: vi.fn(),
  })),
  logAuditEvent: vi.fn(async () => undefined),
}));

type AuthConfig = {
  observability?: {
    onAuditEvent?: unknown;
    onAuditPersistenceFailure?: unknown;
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

vi.mock("server-only", () => ({}));

vi.mock("@informach/auth/server", () => ({
  createServerHelpers: mocks.createServerHelpers,
}));

vi.mock("@informach/billing", () => ({
  createBillingService: mocks.createBillingService,
}));

vi.mock("@informach/config", () => ({
  APPS: {
    agendaDaTurma: { name: "Agenda da Turma", slug: "agenda-da-turma" },
  },
  PRODUCTS: [{ app: "agenda-da-turma", id: "agenda-basic" }],
}));

vi.mock("@informach/db", () => ({
  db: {},
  eq: vi.fn(),
}));

vi.mock("@informach/db/schema", () => ({
  organizations: { id: "organizations.id", slug: "organizations.slug" },
  users: { id: "users.id", email: "users.email" },
}));

vi.mock("@informach/emails", () => ({
  buildUnsubscribeToken: mocks.buildUnsubscribeToken,
  createEmailService: mocks.createEmailService,
}));

vi.mock("@sentry/nextjs", () => ({
  addBreadcrumb: vi.fn(),
  captureMessage: vi.fn(),
}));

function stubEnv(): void {
  vi.stubEnv("DATABASE_URL", "postgresql://user:pass@localhost:5432/app");
  vi.stubEnv("BETTER_AUTH_SECRET", "0123456789abcdef0123456789abcdef");
  vi.stubEnv("BETTER_AUTH_URL", "https://agenda.example.com");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://agenda.example.com");
  vi.stubEnv("SENDGRID_API_KEY", "SG.test");
  vi.stubEnv("SENDGRID_FROM", "noreply@agenda.example.com");
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
    await import("../auth");

    const createAuthCalls = mocks.createAuth.mock.calls as unknown as Array<[AuthConfig]>;
    const authConfig = createAuthCalls[0]?.[0];
    expect(authConfig?.observability?.onAuditEvent).toBeTypeOf("function");
    expect(authConfig?.observability?.onAuditPersistenceFailure).toBeTypeOf("function");

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

  it("keeps agenda domain events connected to the audit pipeline", async () => {
    const { logAgendaAuditEvent } = await import("../audit");

    await logAgendaAuditEvent("agenda.activity_shared_response", "user-1", {
      activityId: "activity-1",
      accepted: true,
    });

    expect(mocks.logAuditEvent).toHaveBeenCalledWith("agenda.activity_shared_response", "user-1", {
      activityId: "activity-1",
      accepted: true,
    });
  });
});
