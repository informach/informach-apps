import "server-only";
import { and, db, eq, inArray } from "@informach/db";
import {
  agendaProfileSubjects,
  agendaStudentProfiles,
  agendaSubjectKits,
  agendaSubjects,
  agendaTurmaMembers,
} from "@informach/db/schema";
import { accessibleProfileCondition } from "@/features/family/access";

export async function findSubjectKits(userId: string, profileIds: string[]) {
  if (!profileIds.length) return [];
  return (
    db
      .select({
        profileId: agendaSubjectKits.profileId,
        subjectId: agendaSubjectKits.subjectId,
        profileSubjectId: agendaSubjectKits.profileSubjectId,
        items: agendaSubjectKits.items,
      })
      .from(agendaSubjectKits)
      .innerJoin(agendaStudentProfiles, eq(agendaStudentProfiles.id, agendaSubjectKits.profileId))
      // O acesso por criança vale aqui como em qualquer outra leitura: quem chama
      // hoje só passa as próprias crianças, mas a garantia não pode depender de
      // quem chama.
      .where(
        and(inArray(agendaSubjectKits.profileId, profileIds), accessibleProfileCondition(userId)),
      )
  );
}

/** A matéria é da turma em que a criança participa AGORA, ou extracurricular dela. */
export async function subjectBelongsToProfile(
  profileId: string,
  input: { subjectId: string | null; profileSubjectId: string | null },
) {
  if (input.subjectId) {
    const [row] = await db
      .select({ id: agendaSubjects.id })
      .from(agendaSubjects)
      .innerJoin(agendaTurmaMembers, eq(agendaTurmaMembers.turmaId, agendaSubjects.turmaId))
      .innerJoin(
        agendaStudentProfiles,
        eq(agendaStudentProfiles.id, agendaTurmaMembers.studentProfileId),
      )
      .where(
        and(
          eq(agendaSubjects.id, input.subjectId),
          eq(agendaTurmaMembers.studentProfileId, profileId),
          eq(agendaStudentProfiles.activeTurmaId, agendaSubjects.turmaId),
        ),
      );
    return Boolean(row);
  }
  if (!input.profileSubjectId) return false;
  const [row] = await db
    .select({ id: agendaProfileSubjects.id })
    .from(agendaProfileSubjects)
    .where(
      and(
        eq(agendaProfileSubjects.id, input.profileSubjectId),
        eq(agendaProfileSubjects.profileId, profileId),
      ),
    );
  return Boolean(row);
}

export async function upsertSubjectKit(input: {
  profileId: string;
  subjectId: string | null;
  profileSubjectId: string | null;
  items: string[];
}) {
  const target = input.subjectId
    ? and(
        eq(agendaSubjectKits.profileId, input.profileId),
        eq(agendaSubjectKits.subjectId, input.subjectId),
      )
    : and(
        eq(agendaSubjectKits.profileId, input.profileId),
        eq(agendaSubjectKits.profileSubjectId, input.profileSubjectId ?? ""),
      );
  const [existing] = await db
    .select({ id: agendaSubjectKits.id })
    .from(agendaSubjectKits)
    .where(target);
  if (existing)
    await db
      .update(agendaSubjectKits)
      .set({ items: input.items, updatedAt: new Date() })
      .where(eq(agendaSubjectKits.id, existing.id));
  else await db.insert(agendaSubjectKits).values({ ...input, updatedAt: new Date() });
}
