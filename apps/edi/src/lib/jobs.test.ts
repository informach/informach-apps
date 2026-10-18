import { DatabaseLockBusyError } from "@informach/db";
import * as Sentry from "@sentry/nextjs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { privateTelemetryOptions } from "./telemetry";

// Only database/provider boundaries are replaced. The route, job composition,
// Sentry monitor, sanitizer and envelope transport run together without network.
const deps = vi.hoisted(() => ({
  sweep: vi.fn(),
  lock: vi.fn(),
  billing: "true",
}));
vi.mock("server-only", () => ({}));
vi.mock("@informach/db", () => ({
  DatabaseLockBusyError: class extends Error {},
  withDatabaseLock: (_key: string, operation: () => Promise<unknown>) => deps.lock(operation),
  // O registro em ops.job_runs é do banco; aqui a rotina roda sem ele.
  recordJobRun: (_meta: unknown, run: () => Promise<unknown>) => run(),
}));
vi.mock("../features/billing/reconciliation", () => ({
  reconcileBilling: (...args: unknown[]) => deps.sweep(...args),
}));
vi.mock("../features/billing/lifecycle", () => ({ withCustomerBillingLifecycle: vi.fn() }));
vi.mock("./billing", () => ({ getPaymentReader: () => ({}) }));
vi.mock("./logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("./env", () => ({
  getEnv: () => ({
    CRON_SECRET: "isolated-cron-fixture",
    EDI_BILLING_ENABLED: deps.billing,
    STRIPE_MODE: "dev",
  }),
}));

import { POST } from "../app/api/jobs/reconcile/route";

type Envelope = Parameters<ReturnType<NonNullable<Sentry.NodeOptions["transport"]>>["send"]>[0];

describe("reconciliation monitoring", () => {
  const envelopes: Envelope[] = [];
  const request = (authorized = true) =>
    new Request("https://edi.test/api/jobs/reconcile", {
      method: "POST",
      headers: { authorization: authorized ? "Bearer isolated-cron-fixture" : "invalid" },
    });
  const checkIns = () =>
    envelopes.flatMap(([, items]) =>
      items.filter(([header]) => header.type === "check_in").map(([, payload]) => payload),
    );
  beforeEach(() => {
    envelopes.length = 0;
    deps.billing = "true";
    deps.sweep.mockReset().mockResolvedValue({ attempted: 1, processed: 1 });
    deps.lock.mockReset().mockImplementation((operation: () => Promise<unknown>) => operation());
  });
  beforeAll(() => {
    Sentry.init({
      ...privateTelemetryOptions,
      dsn: "https://public@example.invalid/1",
      environment: "test",
      defaultIntegrations: false,
      transport: () => ({
        send: async (envelope: Envelope) => {
          envelopes.push(envelope);
          return { statusCode: 200 };
        },
        flush: async () => true,
      }),
    });
  });
  afterAll(async () => {
    await Sentry.close();
  });

  it("checks in only an authorized, enabled execution with the five-minute UTC schedule", async () => {
    expect((await POST(request(false))).status).toBe(401);
    deps.billing = "false";
    expect((await POST(request())).status).toBe(503);
    expect(deps.sweep).not.toHaveBeenCalled();
    expect(checkIns()).toEqual([]);
    deps.billing = "true";
    expect(await (await POST(request())).json()).toEqual({ attempted: 1, processed: 1 });
    await Sentry.flush(2000);
    expect(checkIns()).toMatchObject([
      {
        monitor_slug: "edi-reconcile",
        status: "in_progress",
        monitor_config: {
          schedule: { type: "crontab", value: "*/5 * * * *" },
          checkin_margin: 2,
          max_runtime: 2,
          timezone: "UTC",
        },
      },
      { monitor_slug: "edi-reconcile", status: "ok" },
    ]);
  });

  it("propagates infrastructure exceptions and sends an error check-in", async () => {
    const error = new Error("database unavailable");
    deps.sweep.mockRejectedValueOnce(error);
    await expect(POST(request())).rejects.toBe(error);
    await Sentry.flush(2000);
    expect(checkIns()).toMatchObject([{ status: "in_progress" }, { status: "error" }]);
  });

  it("does not start a second monitor while another process owns the database lock", async () => {
    deps.lock.mockRejectedValueOnce(new DatabaseLockBusyError());
    expect(await (await POST(request())).json()).toEqual({
      processed: 0,
      attempted: 0,
      busy: true,
    });
    await Sentry.flush(2000);
    expect(checkIns()).toEqual([]);
    expect(deps.sweep).not.toHaveBeenCalled();
  });

  it("does not mark a partial sweep successful after customer retries were scheduled", async () => {
    deps.sweep.mockImplementationOnce(
      async (input: { onError: (id: string, error: unknown) => void }) => {
        input.onError("cus_fixture", new Error("provider_private_payload"));
        return { attempted: 2, processed: 1 };
      },
    );
    await expect(POST(request())).rejects.toThrow("billing.reconciliation_incomplete");
    await Sentry.flush(2000);
    expect(checkIns()).toMatchObject([{ status: "in_progress" }, { status: "error" }]);
    expect(JSON.stringify(envelopes)).toContain("billing.reconciliation_failed");
    expect(JSON.stringify(envelopes)).not.toContain("provider_private_payload");
  });
});
