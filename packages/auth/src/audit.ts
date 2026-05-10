import { db } from "@informach/db";
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
  | "billing.credits_warning_sent";

export type AuditPayload = Record<string, unknown>;

let observability: ObservabilityHooks | undefined;

export function configureObservability(hooks: ObservabilityHooks | undefined): void {
  observability = hooks;
}

export async function logAuditEvent(
  eventType: AuditEventType,
  actorId: string | null,
  payload: AuditPayload,
): Promise<void> {
  const event: AuthAuditEvent = { eventType, actorId, payload };
  try {
    observability?.onAuditEvent?.(event);
  } catch {
    // observability hooks must not break the audit pipeline
  }
  try {
    await db.insert(auditEvents).values({
      id: crypto.randomUUID(),
      eventType,
      actorId,
      payload,
    });
  } catch (error) {
    try {
      observability?.onAuditPersistenceFailure?.({
        eventType,
        actorId,
        payloadKeys: Object.keys(payload),
        error: sanitizeAuditError(error),
      });
    } catch {
      // observability hooks must not break the audit pipeline
    }
    // audit persistence must not break auth flows
  }
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
