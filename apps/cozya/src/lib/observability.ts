import type { ObservabilityHooks } from "@informach/auth";
import type { Logger as BillingLogger } from "@informach/billing";
import type { Logger as EmailLogger } from "@informach/emails";
import * as Sentry from "@sentry/nextjs";
import { logger } from "./logger";

type PackageLogger = BillingLogger & EmailLogger;
type PackageLogLevel = "debug" | "info" | "warn" | "error";
type SentryMessageLevel = "warning" | "error";

const REDACTED = "[redacted]";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSensitiveKey(key: string): boolean {
  const normalizedKey = key.replace(/[-_\s]/g, "").toLowerCase();
  return (
    normalizedKey === "to" ||
    normalizedKey === "from" ||
    normalizedKey === "recipient" ||
    normalizedKey.endsWith("email") ||
    normalizedKey.includes("authorization") ||
    normalizedKey.includes("cookie") ||
    normalizedKey.includes("secret") ||
    normalizedKey.includes("signature") ||
    normalizedKey.includes("token")
  );
}

function sanitizeForSentry(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeForSentry(item));
  if (!isRecord(value)) return value;

  const sanitized: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    sanitized[key] = isSensitiveKey(key) ? REDACTED : sanitizeForSentry(nestedValue);
  }
  return sanitized;
}

function writePino(level: PackageLogLevel, msg: string, ctx?: object): void {
  const context = ctx ?? {};
  switch (level) {
    case "debug":
      logger.debug(context, msg);
      return;
    case "info":
      logger.info(context, msg);
      return;
    case "warn":
      logger.warn(context, msg);
      return;
    case "error":
      logger.error(context, msg);
      return;
  }
}

function capturePackageMessage(level: SentryMessageLevel, msg: string, ctx?: object): void {
  Sentry.captureMessage(msg, {
    level,
    tags: {
      source: "package-logger",
    },
    extra: ctx ? { context: sanitizeForSentry(ctx) } : undefined,
  });
}

export const packageLogger: PackageLogger = {
  debug: (msg, ctx) => writePino("debug", msg, ctx),
  info: (msg, ctx) => writePino("info", msg, ctx),
  warn: (msg, ctx) => {
    writePino("warn", msg, ctx);
    capturePackageMessage("warning", msg, ctx);
  },
  error: (msg, ctx) => {
    writePino("error", msg, ctx);
    capturePackageMessage("error", msg, ctx);
  },
};

export const authObservability: ObservabilityHooks = {
  onAuditEvent: (event) => {
    Sentry.addBreadcrumb({
      category: "auth.audit",
      level: "info",
      message: event.eventType,
      data: {
        actorId: event.actorId,
        payloadKeys: Object.keys(event.payload),
      },
    });
  },
  onAuditPersistenceFailure: (event) => {
    const message = "auth.audit.persist_failed";
    const context = {
      eventType: event.eventType,
      actorId: event.actorId,
      payloadKeys: event.payloadKeys,
      error: event.error,
    };

    logger.error(context, message);
    Sentry.captureMessage(message, {
      level: "error",
      tags: {
        auditEventType: event.eventType,
        source: "auth-observability",
      },
      extra: {
        context: sanitizeForSentry(context),
      },
    });
  },
  onSecurityEvent: (event) => {
    const message = `auth.security.${event.type}`;
    const context = {
      userId: event.userId,
      metadata: event.metadata,
    };

    logger.warn(context, message);
    Sentry.captureMessage(message, {
      level: "warning",
      tags: {
        securityEventType: event.type,
        source: "auth-observability",
      },
      extra: {
        context: sanitizeForSentry(context),
      },
    });
  },
};
