import type { AuditEventType, AuditPayload } from "./audit";

export type AuthAuditEvent = {
  eventType: AuditEventType;
  actorId: string | null;
  payload: AuditPayload;
};

export type AuthAuditPersistenceFailureEvent = {
  eventType: AuditEventType;
  actorId: string | null;
  payloadKeys: string[];
  error: {
    name: string;
    message: string;
  };
};

export type AuthSecurityEventType =
  | "rate_limit_hit"
  | "role_mismatch"
  | "banned_user_signin_attempt"
  | "two_factor_failed"
  | "session_revoked"
  /** As duas etapas acabaram de ser ativadas e as outras sessões da conta não puderam ser encerradas. */
  | "two_factor_session_cleanup_failed";

export type AuthSecurityEvent = {
  type: AuthSecurityEventType;
  userId?: string;
  metadata?: Record<string, unknown>;
};

export type ObservabilityHooks = {
  onAuditEvent?: (event: AuthAuditEvent) => void;
  onAuditPersistenceFailure?: (event: AuthAuditPersistenceFailureEvent) => void;
  onSecurityEvent?: (event: AuthSecurityEvent) => void;
};
