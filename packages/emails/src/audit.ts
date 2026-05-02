import { createHash } from "node:crypto";

export type EmailAuditEventType =
  | "email.delivery_sent"
  | "email.delivery_failed"
  | "email.delivery_skipped"
  | "email.unsubscribe_recorded"
  | "email.suppression_recorded";

export type EmailAuditPayload = Record<string, unknown>;

export type EmailAuditEvent = {
  eventType: EmailAuditEventType;
  actorId: string | null;
  payload: EmailAuditPayload;
};

export type EmailAuditHook = (event: EmailAuditEvent) => void | Promise<void>;

export type EmailAuditDeps = {
  onAudit?: EmailAuditHook;
};

export function emailAddressAuditPayload(email: string): {
  emailHash: string;
  emailDomain: string | null;
} {
  const normalized = email.trim().toLowerCase();
  return {
    emailHash: createHash("sha256").update(normalized).digest("hex"),
    emailDomain: normalized.includes("@") ? (normalized.split("@").at(1) ?? null) : null,
  };
}

export function emitEmailAudit(deps: EmailAuditDeps, event: EmailAuditEvent): void {
  if (!deps.onAudit) return;
  try {
    const result = deps.onAudit(event);
    if (result && typeof result.then === "function") {
      void result.catch(() => undefined);
    }
  } catch {
    // Audit hooks must never break email delivery or webhook handling.
  }
}
