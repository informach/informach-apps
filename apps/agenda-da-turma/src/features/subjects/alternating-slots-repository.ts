import "server-only";
import { and, eq } from "@informach/db";
import { agendaSubjectAlternatingSlots } from "@informach/db/schema";
import type { FamilyTransaction } from "@informach/family";
import { addDaysIso } from "@/features/dashboard/date";
import type { AlternatingSlotInput as SyncSlotInput } from "./types";
/** Internal writer: caller holds classroom and current family authority for the entire transaction. */
export async function syncAlternatingSlotsForSubject(
  subjectId: string,
  newSlots: readonly SyncSlotInput[],
  tx: FamilyTransaction,
): Promise<void> {
  // Se já estamos numa transação (caller passou tx), reusa. Senão abre uma.

  // 1. Severar espelhos atuais.
  const oldSlots = await tx
    .select({
      dayOfWeek: agendaSubjectAlternatingSlots.dayOfWeek,
      pairedSubjectId: agendaSubjectAlternatingSlots.pairedSubjectId,
    })
    .from(agendaSubjectAlternatingSlots)
    .where(eq(agendaSubjectAlternatingSlots.subjectId, subjectId));
  for (const old of oldSlots) {
    await tx
      .delete(agendaSubjectAlternatingSlots)
      .where(
        and(
          eq(agendaSubjectAlternatingSlots.subjectId, old.pairedSubjectId),
          eq(agendaSubjectAlternatingSlots.dayOfWeek, old.dayOfWeek),
          eq(agendaSubjectAlternatingSlots.pairedSubjectId, subjectId),
        ),
      );
  }
  // 2. Apaga slots de A.
  await tx
    .delete(agendaSubjectAlternatingSlots)
    .where(eq(agendaSubjectAlternatingSlots.subjectId, subjectId));

  // 3. Insere novos + espelhos.
  for (const s of newSlots) {
    const [existingOnB] = await tx
      .select({
        pairedSubjectId: agendaSubjectAlternatingSlots.pairedSubjectId,
      })
      .from(agendaSubjectAlternatingSlots)
      .where(
        and(
          eq(agendaSubjectAlternatingSlots.subjectId, s.pairedSubjectId),
          eq(agendaSubjectAlternatingSlots.dayOfWeek, s.dayOfWeek),
        ),
      )
      .limit(1);
    if (existingOnB && existingOnB.pairedSubjectId !== subjectId) {
      // Severa espelho de C apontando pra B.
      await tx
        .delete(agendaSubjectAlternatingSlots)
        .where(
          and(
            eq(agendaSubjectAlternatingSlots.subjectId, existingOnB.pairedSubjectId),
            eq(agendaSubjectAlternatingSlots.dayOfWeek, s.dayOfWeek),
            eq(agendaSubjectAlternatingSlots.pairedSubjectId, s.pairedSubjectId),
          ),
        );
    }
    await tx
      .delete(agendaSubjectAlternatingSlots)
      .where(
        and(
          eq(agendaSubjectAlternatingSlots.subjectId, s.pairedSubjectId),
          eq(agendaSubjectAlternatingSlots.dayOfWeek, s.dayOfWeek),
        ),
      );
    await tx.insert(agendaSubjectAlternatingSlots).values({
      subjectId,
      dayOfWeek: s.dayOfWeek,
      pairedSubjectId: s.pairedSubjectId,
      anchorDate: s.anchorDate,
    });
    await tx.insert(agendaSubjectAlternatingSlots).values({
      subjectId: s.pairedSubjectId,
      dayOfWeek: s.dayOfWeek,
      pairedSubjectId: subjectId,
      anchorDate: addDaysIso(s.anchorDate, 7),
    });
  }
}
