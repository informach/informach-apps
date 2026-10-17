import "server-only";
import { requireOwnerForAction } from "@/lib/access";
import { auditAs } from "@/lib/action";
import { startOfToday } from "@/lib/format";
import { toCsv } from "./csv";
import { parseAuditFilters, periodStart } from "./filters";
import { eventPeople } from "./humanize";
import { findPerson, listAuditEvents } from "./repository";

/** Teto de linhas por exportação; acima disso, filtre por período ou pessoa. */
export const EXPORT_LIMIT = 10_000;

const HEADER = ["quando_utc", "evento", "quem_id", "sobre_quem_id", "app", "campos_guardados"];

function safeApp(payload: Record<string, unknown>): string {
  const app = payload.app;
  return typeof app === "string" && /^[a-z0-9-]{1,40}$/.test(app) ? app : "";
}

/**
 * Exporta a auditoria com os mesmos filtros da tela. Só para contas owner.
 * Saem apenas horário, tipo de evento, IDs, app e os nomes dos campos
 * guardados, nunca os valores do payload. A exportação entra na própria
 * auditoria (`admin.audit_exported`) em nome de quem exportou, na forma
 * estrita: sem o registro, o arquivo não é devolvido (`AuditPersistenceError`).
 */
export async function exportAuditCsv(
  params: Record<string, string | string[] | undefined>,
  now: Date = new Date(),
): Promise<{ csv: string; filename: string; rows: number }> {
  const staff = await requireOwnerForAction();
  const filters = parseAuditFilters(params);
  const person = filters.person ? await findPerson(filters.person) : null;
  const events =
    filters.person && !person
      ? []
      : await listAuditEvents({
          group: filters.group,
          since: periodStart(filters.period, now, startOfToday(now)),
          personId: person?.id ?? null,
          limit: EXPORT_LIMIT,
          offset: 0,
        });
  const rows = events.map((event) => {
    const { actorId, targetId } = eventPeople(event);
    return [
      event.createdAt.toISOString(),
      event.eventType,
      actorId ?? "",
      targetId ?? "",
      safeApp(event.payload),
      Object.keys(event.payload).sort().join(" "),
    ];
  });
  await auditAs(staff, "admin.audit_exported", {
    filters: { group: filters.group, period: filters.period, personId: person?.id ?? null },
    rows: rows.length,
  });
  return {
    csv: toCsv([HEADER, ...rows]),
    filename: `auditoria-${now.toISOString().slice(0, 10)}.csv`,
    rows: rows.length,
  };
}
