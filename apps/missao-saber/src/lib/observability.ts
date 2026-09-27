import type { ObservabilityHooks } from "@informach/auth";
import type { BillingAuditEvent } from "@informach/billing";
import type { EmailAuditEvent } from "@informach/emails";
import * as Sentry from "@sentry/nextjs";
import { logger } from "./logger";
import { safeContext, safeText } from "./telemetry";

function log(level: "debug" | "info" | "warn" | "error", message: string, context?: object) {
  const name = safeText(message);
  logger[level]({ context: safeContext(context) }, name);
  // Só erro vira evento no Sentry. Os avisos dos pacotes (retentativa de
  // e-mail, evento de segurança já tratado) ficam no log estruturado.
  if (level === "error") Sentry.captureMessage(name, "error");
}

export const packageLogger = {
  debug: (message: string, context?: object) => log("debug", message, context),
  info: (message: string, context?: object) => log("info", message, context),
  warn: (message: string, context?: object) => log("warn", message, context),
  error: (message: string, context?: object) => log("error", message, context),
};

/** Eventos de domínio do Missão Saber: só IDs e nomes de campo, ver docs/audit-payload-policy.md. */
export type MissaoAuditEvent = {
  eventType: "missao.profile_updated" | "missao.consent_recorded";
  actorId: string;
  payload: Record<string, unknown>;
};

export function audit(event: BillingAuditEvent | EmailAuditEvent | MissaoAuditEvent) {
  // Lazy import avoids the auth -> email -> audit initialization cycle.
  void import("@informach/auth")
    .then(({ logAuditEvent }) =>
      logAuditEvent(
        event.eventType,
        event.actorId,
        { ...event.payload, app: "missao-saber" },
        authObservability,
      ),
    )
    .catch(() => packageLogger.error("audit.persistence_failed", { eventType: event.eventType }));
}

export const authObservability: ObservabilityHooks = {
  onAuditPersistenceFailure: ({ eventType }) =>
    packageLogger.error("auth.audit_failed", { eventType }),
  onSecurityEvent: ({ type }) => packageLogger.warn("auth.security_event", { type }),
};

export function reportError(error: unknown, incident: string) {
  Sentry.captureException(error, { tags: { incident, app: "missao-saber" } });
  logger.error(
    { incident, errorType: error instanceof Error ? error.name : "unknown" },
    "operation.failed",
  );
}
