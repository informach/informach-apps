import type { AuditEventType, ObservabilityHooks } from "@informach/auth";
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

/**
 * Eventos de domínio do Recreio. Só ids, nomes de campo e classificadores,
 * nunca o apelido, o nome de um mundo, um código de convite, o e-mail, o IP ou
 * um token: ver docs/audit-payload-policy.md.
 *
 * Por aqui passam os eventos que não acompanham uma gravação: a criação do
 * perfil e as recusas (ingresso recusado, escrita de instância recusada). O
 * que muda o banco numa transação (concessões, sessões de jogo, mundos,
 * convites, posse) grava o evento dentro dela, no repositório.
 */
export type RecreioAuditEvent = {
  eventType: Extract<AuditEventType, `recreio.${string}`>;
  /** A conta que agiu, ou `null` quando quem agiu foi o Recreio ou uma instância. */
  actorId: string | null;
  payload: Record<string, unknown>;
};

export function audit(event: EmailAuditEvent | RecreioAuditEvent) {
  // Lazy import avoids the auth -> email -> audit initialization cycle.
  void import("@informach/auth")
    .then(({ logAuditEvent }) =>
      logAuditEvent(
        event.eventType,
        event.actorId,
        { ...event.payload, app: "recreio" },
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
  Sentry.captureException(error, { tags: { incident, app: "recreio" } });
  logger.error(
    { incident, errorType: error instanceof Error ? error.name : "unknown" },
    "operation.failed",
  );
}
