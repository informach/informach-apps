import * as Sentry from "@sentry/nextjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authObservability, packageLogger } from "./observability";

const mocks = vi.hoisted(() => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  sentry: {
    addBreadcrumb: vi.fn(),
    captureException: vi.fn(),
    captureMessage: vi.fn(),
  },
}));

vi.mock("./logger", () => ({
  logger: mocks.logger,
}));

vi.mock("@sentry/nextjs", () => mocks.sentry);

describe("observability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redacts sensitive package logger context before writing to Pino and Sentry", () => {
    packageLogger.warn?.("email.delivery_failed", {
      email: "user@example.com",
      messageKey: "password-reset_raw-token",
      nested: {
        token: "secret-token",
        safe: "visible",
      },
    });

    const pinoContext = mocks.logger.warn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(pinoContext).toEqual({
      email: "[redacted]",
      messageKey: "[redacted]",
      nested: {
        token: "[redacted]",
        safe: "visible",
      },
    });
    expect(JSON.stringify(pinoContext)).not.toContain("user@example.com");
    expect(JSON.stringify(pinoContext)).not.toContain("raw-token");

    expect(Sentry.captureMessage).toHaveBeenCalledWith(
      "email.delivery_failed",
      expect.objectContaining({
        extra: {
          context: pinoContext,
        },
      }),
    );
  });

  it("redacts auth security metadata before writing to Pino", () => {
    authObservability.onSecurityEvent?.({
      type: "rate_limit_hit",
      userId: "user-1",
      metadata: {
        email: "target@example.com",
        callbackUrl: "https://app.example.com/reset?token=abc",
      },
    });

    const pinoContext = mocks.logger.warn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(pinoContext).toEqual({
      userId: "user-1",
      metadata: {
        email: "[redacted]",
        callbackUrl: "[redacted]",
      },
    });
    expect(JSON.stringify(pinoContext)).not.toContain("target@example.com");
    expect(JSON.stringify(pinoContext)).not.toContain("token=abc");
  });
});
