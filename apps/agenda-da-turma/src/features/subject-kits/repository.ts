import "server-only";
import { err, ok } from "@informach/auth/server-actions";
import { and, db, eq, inArray, sql } from "@informach/db";
import {
  agendaProfileSubjects,
  agendaStudentProfiles,
  agendaSubjectKits,
  agendaSubjects,
  agendaTurmaMembers,
} from "@informach/db/schema";
import type { FamilyTransaction } from "@informach/family";
import { accessibleProfileCondition } from "@/features/family/access";
import type { AgendaAuthority } from "@/features/family/authority";
import { atomicAgendaResult } from "@/features/family/transaction-repository";
import { lockAgendaUse } from "@/features/family/use-repository";
import {
  assertTaskSchoolContexts,
  lockTaskSchoolContexts,
} from "@/features/turmas/transaction-repository";

export async function findSubjectKits(actor: AgendaAuthority, profileIds: string[]) {
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
        and(inArray(agendaSubjectKits.profileId, profileIds), accessibleProfileCondition(actor)),
      )
  );
}

/** A matéria é da turma em que a criança participa AGORA, ou extracurricular dela. */
async function subjectBelongsToProfile(
  tx: FamilyTransaction,
  profileId: string,
  input: { subjectId: string | null; profileSubjectId: string | null },
) {
  if (input.subjectId) {
    const [row] = await tx
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
  const [row] = await tx
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

/**
 * Grava a lista do "levar sempre", criando ou substituindo.
 *
 * O conflito é resolvido pelo **banco**, nos dois índices únicos parciais que a
 * migração 0059 criou. Ler e depois escrever deixava duas abas (ou um toque
 * duplo que escapasse do `useTransition`) acharem as duas que não existia
 * linha, inserirem as duas, e a segunda levar uma violação de índice na cara da
 * pessoa em vez de simplesmente juntar.
 *
 * São dois índices porque a matéria é da turma **ou** extracurricular, nunca as
 * duas (CHECK `agenda_subject_kit_target_check`), e um índice único comum sobre
 * colunas anuláveis não impede duplicata no Postgres.
 */
export async function upsertSubjectKit(
  actor: AgendaAuthority,
  input: {
    profileId: string;
    subjectId: string | null;
    profileSubjectId: string | null;
    items: string[];
  },
) {
  return atomicAgendaResult(async (tx) => {
    const dependencies = { subjectIds: input.subjectId ? [input.subjectId] : [] };
    const schoolLocks = await lockTaskSchoolContexts(tx, dependencies);
    await lockAgendaUse(tx, actor, [input.profileId]);
    await assertTaskSchoolContexts(tx, schoolLocks, dependencies);
    if (!(await subjectBelongsToProfile(tx, input.profileId, input)))
      return err({ code: "INVALID_SUBJECT" } as const);
    const values = { ...input, updatedAt: new Date() };
    if (input.subjectId) {
      await tx
        .insert(agendaSubjectKits)
        .values(values)
        .onConflictDoUpdate({
          target: [agendaSubjectKits.profileId, agendaSubjectKits.subjectId],
          targetWhere: sql`${agendaSubjectKits.subjectId} IS NOT NULL`,
          set: { items: input.items, updatedAt: values.updatedAt },
        });
      return ok({ items: input.items });
    }
    await tx
      .insert(agendaSubjectKits)
      .values(values)
      .onConflictDoUpdate({
        target: [agendaSubjectKits.profileId, agendaSubjectKits.profileSubjectId],
        targetWhere: sql`${agendaSubjectKits.profileSubjectId} IS NOT NULL`,
        set: { items: input.items, updatedAt: values.updatedAt },
      });
    return ok({ items: input.items });
  });
}
