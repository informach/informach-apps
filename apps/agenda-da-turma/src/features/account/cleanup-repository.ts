import "server-only";
import { inArray } from "@informach/db";
import { agendaNotices, agendaStudentProfiles } from "@informach/db/schema";
import type { FamilyTransaction } from "@informach/family";
import { AgendaOriginalScopeError } from "./closure-errors";
import { selectAgendaNoticeClosure } from "./notice-closure-repository";

/** The caller establishes school/family authority and the permitted original
 * document scope before invoking the native cascade in this transaction. */
export async function eraseAgendaProfiles(
  tx: FamilyTransaction,
  activationIds: string[],
  actorId: string,
) {
  if (!activationIds.length) return [];
  const profiles = await tx
    .select({ id: agendaStudentProfiles.id })
    .from(agendaStudentProfiles)
    .where(inArray(agendaStudentProfiles.familyProfileId, activationIds));
  const notices = await selectAgendaNoticeClosure(
    tx,
    actorId,
    profiles.map((p) => p.id),
    false,
  );
  if (notices.blocked) throw new AgendaOriginalScopeError();
  if (notices.erase.length)
    await tx.delete(agendaNotices).where(
      inArray(
        agendaNotices.id,
        notices.erase.map((row) => row.id),
      ),
    );
  return tx
    .delete(agendaStudentProfiles)
    .where(inArray(agendaStudentProfiles.familyProfileId, activationIds))
    .returning({ id: agendaStudentProfiles.id });
}
