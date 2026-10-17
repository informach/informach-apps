import { type Database, db } from "@informach/db";
import { events as auditEvents } from "@informach/db/schema";
import type { AuthAuditEvent, ObservabilityHooks } from "./observability";

export type AuditEventType =
  | "user.created"
  | "user.email_changed"
  | "user.password_changed"
  | "user.role_changed"
  | "user.banned"
  | "user.unbanned"
  | "user.deletion_requested"
  | "user.deleted"
  | "session.created"
  | "session.revoked"
  | "account.linked"
  | "auth.sign_out"
  | "auth.sign_in_otp_requested"
  | "auth.signup_attempt_on_existing"
  | "auth.forget_password_requested"
  | "auth.password_reset_completed"
  | "auth.two_factor_enabled"
  | "auth.two_factor_disabled"
  | "auth.two_factor_verified"
  | "auth.backup_code_used"
  | "email.verified"
  | "email.delivery_sent"
  | "email.delivery_failed"
  | "email.delivery_skipped"
  | "email.unsubscribe_recorded"
  | "email.suppression_recorded"
  | "org.created"
  | "org.member_added"
  | "org.member_removed"
  | "org.invitation_sent"
  | "billing.checkout_started"
  | "billing.subscription_created"
  | "billing.subscription_updated"
  | "billing.subscription_canceled"
  | "billing.payment_succeeded"
  | "billing.payment_failed"
  | "billing.credits_granted"
  | "billing.credits_consumed"
  | "billing.credits_refunded"
  | "billing.credits_warning_sent"
  | "agenda.student_profile_created"
  | "agenda.student_profile_updated"
  | "agenda.student_profile_deleted"
  | "agenda.turma_created_or_joined"
  | "agenda.turma_joined_by_code"
  | "agenda.turma_set_active"
  | "agenda.turma_left"
  | "agenda.turma_deleted"
  | "agenda.turma_updated"
  | "agenda.subject_created"
  | "agenda.subject_updated"
  | "agenda.subject_deleted"
  | "agenda.activity_created"
  | "agenda.activity_updated"
  | "agenda.activity_deleted"
  | "agenda.activity_status_set"
  | "agenda.activity_shared_response"
  | "agenda.profile_subject_created"
  | "agenda.profile_subject_updated"
  | "agenda.profile_subject_status_changed"
  | "agenda.profile_subject_deleted"
  | "agenda.profile_subject_activity_created"
  | "agenda.profile_subject_activity_updated"
  | "agenda.profile_subject_activity_deleted"
  | "agenda.profile_subject_activity_status_set"
  | "missao.profile_updated"
  | "missao.study_connected"
  | "missao.study_code_issued"
  | "missao.study_revoked"
  | "missao.consent_recorded"
  // Bastidores (apps/admin): consultas e ações da equipe sobre uma conta.
  | "admin.user_viewed"
  | "admin.sessions_revoked"
  | "admin.verification_resent"
  | "admin.edi_device_disconnected"
  | "admin.audit_exported";

export type AuditPayload = Record<string, unknown>;

let observability: ObservabilityHooks | undefined;

export function configureObservability(hooks: ObservabilityHooks | undefined): void {
  observability = hooks;
}

/** Quem grava o evento: o cliente do banco ou uma transação aberta por quem chama. */
export type AuditWriter = Pick<Database, "insert">;

/**
 * Grava o evento e avisa a observabilidade. Devolve o erro de gravação, já
 * reportado em `onAuditPersistenceFailure`, ou `null` quando gravou.
 */
async function writeAuditEvent(
  eventType: AuditEventType,
  actorId: string | null,
  payload: AuditPayload,
  hooks: ObservabilityHooks | undefined,
  writer: AuditWriter,
): Promise<unknown> {
  const event: AuthAuditEvent = { eventType, actorId, payload };
  try {
    hooks?.onAuditEvent?.(event);
  } catch {
    // observability hooks must not break the audit pipeline
  }
  try {
    await writer.insert(auditEvents).values({
      id: crypto.randomUUID(),
      eventType,
      actorId,
      payload,
    });
    return null;
  } catch (error) {
    try {
      hooks?.onAuditPersistenceFailure?.({
        eventType,
        actorId,
        payloadKeys: Object.keys(payload),
        error: sanitizeAuditError(error),
      });
    } catch {
      // observability hooks must not break the audit pipeline
    }
    return error ?? new Error("audit insert failed");
  }
}

/** Forma padrão: se a gravação falhar, o fluxo continua (o auth não cai junto com o banco de auditoria). */
export async function logAuditEvent(
  eventType: AuditEventType,
  actorId: string | null,
  payload: AuditPayload,
  hooks: ObservabilityHooks | undefined = observability,
): Promise<void> {
  // audit persistence must not break auth flows
  await writeAuditEvent(eventType, actorId, payload, hooks, db);
}

/** O evento não foi gravado; a falha já foi entregue a `onAuditPersistenceFailure`. */
export class AuditPersistenceError extends Error {
  readonly eventType: AuditEventType;
  constructor(eventType: AuditEventType, cause: unknown) {
    super(`@informach/auth: audit event ${eventType} was not recorded`, { cause });
    this.name = "AuditPersistenceError";
    this.eventType = eventType;
  }
}

/**
 * Forma estrita, opcional: para quem só pode mostrar um dado ou concluir uma
 * ação com o rastro gravado (o Bastidores). Avisa a observabilidade como a
 * forma padrão e, em vez de seguir, lança `AuditPersistenceError`. Com
 * `writer` igual a uma transação, o evento entra junto com a mudança: se a
 * gravação falhar, a transação inteira volta.
 */
export async function logAuditEventStrict(
  eventType: AuditEventType,
  actorId: string | null,
  payload: AuditPayload,
  options: { writer?: AuditWriter; hooks?: ObservabilityHooks } = {},
): Promise<void> {
  const failure = await writeAuditEvent(
    eventType,
    actorId,
    payload,
    options.hooks ?? observability,
    options.writer ?? db,
  );
  if (failure) throw new AuditPersistenceError(eventType, failure);
}

function sanitizeAuditError(error: unknown): { name: string; message: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
    };
  }
  return {
    name: "UnknownError",
    message: String(error),
  };
}
