import { startOfToday } from "@/lib/format";
import { AUDIT_PAGE_SIZE, type AuditFilters, periodStart } from "./filters";
import { type DescribedEvent, describeEvents, type Person, peopleIdsOf } from "./humanize";
import { findPerson, listAuditEvents, peopleByIds } from "./repository";

export type AuditPage = {
  filters: AuditFilters;
  /** A conta do filtro por pessoa, quando encontrada. */
  person: Person | null;
  personNotFound: boolean;
  rows: DescribedEvent[];
  hasNext: boolean;
};

export async function getAuditPage(
  filters: AuditFilters,
  now: Date = new Date(),
): Promise<AuditPage> {
  const person = filters.person ? await findPerson(filters.person) : null;
  if (filters.person && !person)
    return { filters, person: null, personNotFound: true, rows: [], hasNext: false };
  const events = await listAuditEvents({
    group: filters.group,
    since: periodStart(filters.period, now, startOfToday(now)),
    personId: person?.id ?? null,
    limit: AUDIT_PAGE_SIZE + 1,
    offset: (filters.page - 1) * AUDIT_PAGE_SIZE,
  });
  const page = events.slice(0, AUDIT_PAGE_SIZE);
  const people = await peopleByIds(peopleIdsOf(page));
  return {
    filters,
    person,
    personNotFound: false,
    rows: describeEvents(page, people),
    hasNext: events.length > AUDIT_PAGE_SIZE,
  };
}
