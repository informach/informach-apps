import * as Sentry from "@sentry/nextjs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { privateTelemetryOptions, sanitizeSentryEvent } from "./telemetry";

vi.mock("server-only", () => ({}));
vi.mock("./logger", () => ({ logger: { error: vi.fn() } }));

import { onRequestError } from "../instrumentation";
import { reportOperationalError } from "./observability";

type Envelope = Parameters<ReturnType<NonNullable<Sentry.NodeOptions["transport"]>>["send"]>[0];

describe("private server telemetry", () => {
  const envelopes: Envelope[] = [];
  beforeEach(() => {
    envelopes.length = 0;
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

  it("rebuilds events without PII, arbitrary context, code text, SQL or attachments", () => {
    const secret = "sensitive-fixture@example.test";
    const hint = { attachments: [{ filename: "body.txt", data: secret }] };
    const event = sanitizeSentryEvent(
      {
        message: secret,
        logentry: { message: secret },
        user: { email: secret },
        request: {
          url: `https://edi.test/?token=${secret}`,
          data: secret,
          headers: { authorization: secret },
        },
        server_name: secret,
        transaction: secret,
        breadcrumbs: [{ message: secret }],
        tags: { email: secret, "edi.operation": "stripe.webhook_failed" },
        extra: { actorId: "internal_actor_1", payloadKeys: ["invoiceId", secret], body: secret },
        debug_meta: {
          images: [
            {
              type: "sourcemap",
              debug_id: "12345678-abcd-4321-abcd-123456789012",
              code_file: `C:/Users/${secret}/repo/src/lib/jobs.ts`,
            },
          ],
        },
        contexts: {
          database: { query: secret },
          trace: { trace_id: "a".repeat(32), span_id: "b".repeat(16), data: { token: secret } },
        },
        exception: {
          values: [
            {
              type: "TypeError",
              value: secret,
              mechanism: { type: "custom", data: { token: secret } },
              stacktrace: {
                frames: [
                  {
                    filename: `C:/Users/${secret}/repo/src/lib/jobs.ts?token=${secret}`,
                    function: "runReconciliation",
                    lineno: 12,
                    colno: 5,
                    context_line: secret,
                    pre_context: [secret],
                    vars: { token: secret },
                  },
                ],
              },
            },
          ],
        },
      },
      hint,
    );
    expect(JSON.stringify({ event, hint })).not.toContain(secret);
    expect(event.exception?.values?.[0]).toMatchObject({
      type: "TypeError",
      value: "stripe.webhook_failed",
      stacktrace: {
        frames: [{ filename: "src/lib/jobs.ts", function: "runReconciliation", lineno: 12 }],
      },
    });
    expect(event.extra).toEqual({ actorId: "internal_actor_1", payloadKeys: ["invoiceId"] });
    expect(hint.attachments).toEqual([]);
    expect(event.debug_meta?.images).toEqual([
      {
        type: "sourcemap",
        debug_id: "12345678-abcd-4321-abcd-123456789012",
        code_file: "src/lib/jobs.ts",
      },
    ]);
  });

  it("sends sanitized operational errors through the real SDK transport", async () => {
    const secret = "sk_live_private_fixture";
    Sentry.withScope((scope) => {
      scope.setUser({ email: "private@example.test", ip_address: "192.0.2.1" });
      scope.setExtra("body", secret);
      scope.addAttachment({ filename: "private.txt", data: secret });
      reportOperationalError("billing.reconciliation_failed", new TypeError(secret), {
        customerId: "cus_fixture",
        body: secret,
      });
    });
    await Sentry.flush(2000);
    expect(envelopes).toHaveLength(1);
    const serialized = JSON.stringify(envelopes);
    expect(serialized).toContain("billing.reconciliation_failed");
    expect(serialized).toContain("cus_fixture");
    for (const value of [secret, "private@example.test", "192.0.2.1", "private.txt"])
      expect(serialized).not.toContain(value);
  });

  it("captures the Next request hook without leaking URL, headers or raw exception", async () => {
    onRequestError(
      new Error("password=private-fixture"),
      {
        path: "/api/desktop/license?token=private-fixture",
        method: "POST",
        headers: { authorization: "Bearer private-fixture", cookie: "private-fixture" },
      },
      { routerKind: "App Router", routePath: "/api/desktop/license", routeType: "route" },
    );
    await Sentry.flush(2000);
    expect(envelopes).toHaveLength(1);
    expect(JSON.stringify(envelopes)).toContain("Unhandled Edi server error");
    expect(JSON.stringify(envelopes)).not.toContain("private-fixture");
  });
});
