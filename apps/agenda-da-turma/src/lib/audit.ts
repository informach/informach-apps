import "server-only";

import { type AuditEventType, type AuditPayload, logAuditEvent } from "@informach/auth";

export type AgendaAuditEventType = Extract<AuditEventType, `agenda.${string}`>;

export async function logAgendaAuditEvent(
  eventType: AgendaAuditEventType,
  actorId: string,
  payload: AuditPayload,
): Promise<void> {
  await logAuditEvent(eventType, actorId, payload);
}
