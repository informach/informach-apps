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
  | "auth.forget_password_requested"
  | "auth.password_reset_completed"
  | "auth.two_factor_enabled"
  | "auth.two_factor_disabled"
  | "auth.two_factor_verified"
  | "auth.backup_code_used"
  | "email.verified"
  | "org.created"
  | "org.member_added"
  | "org.member_removed"
  | "org.invitation_sent";

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
  await db.insert(auditEvents).values({
    id: crypto.randomUUID(),
    eventType,
    actorId,
    payload,
  });
}
