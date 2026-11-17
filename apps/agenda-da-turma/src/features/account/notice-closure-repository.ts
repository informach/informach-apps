import "server-only";
import { and, eq, inArray, or, sql } from "@informach/db";
import { agendaNotices } from "@informach/db/schema";
import type { FamilyTransaction } from "@informach/family";

/** Metadata only. An original can mention children without extracted tasks.
 * Neither the capture child nor the task copies describe its entire scope. */
export async function selectAgendaNoticeClosure(
  tx: FamilyTransaction,
  actorId: string,
  profileIds: string[],
  includePersonal: boolean,
) {
  const removed = new Set(profileIds);
  const erase: { id: string; version: string }[] = [];
  const preserved: string[] = [];
  let blocked = false,
    cursor = "";
  const deadline = performance.now() + 45_000;
  while (true) {
    if (performance.now() >= deadline) throw new Error("Agenda original selection deadline");
    const rows = await tx
      .select({
        id: agendaNotices.id,
        capture: agendaNotices.captureProfileId,
        author: agendaNotices.createdByUserId,
        shared: agendaNotices.sharedWithinFamily,
        scope: agendaNotices.sourceProfileIds,
        version: sql<string>`extract(epoch from ${agendaNotices.updatedAt})::text`,
      })
      .from(agendaNotices)
      .where(
        and(
          sql`${agendaNotices.id}::text > ${cursor}`,
          or(
            includePersonal ? eq(agendaNotices.createdByUserId, actorId) : undefined,
            inArray(agendaNotices.captureProfileId, profileIds),
            sql`exists (select 1 from jsonb_array_elements_text(coalesce(${agendaNotices.sourceProfileIds}, '[]'::jsonb)) s(id) where ${inArray(sql`s.id`, profileIds)})`,
          ),
        ),
      )
      .orderBy(agendaNotices.id)
      .limit(250);
    for (const row of rows) {
      const ownPrivate = row.author === actorId && !row.shared;
      const touchesSelected =
        (row.capture !== null && removed.has(row.capture)) ||
        (row.scope?.some((id) => removed.has(id)) ?? false);
      const wholeSelected = !!row.scope?.length && row.scope.every((id) => removed.has(id));
      if (ownPrivate || (row.shared && wholeSelected))
        erase.push({ id: row.id, version: row.version });
      else {
        preserved.push(row.id);
        // Do not let capture_profile_id CASCADE erase another person's original,
        // or leave a mixed original retaining a child selected for erasure.
        if (touchesSelected) blocked = true;
      }
    }
    if (rows.length < 250) break;
    cursor = rows[rows.length - 1]?.id ?? cursor;
  }
  return { erase, preserved, blocked };
}
