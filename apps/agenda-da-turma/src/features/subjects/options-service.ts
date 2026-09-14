import "server-only";

import { listAccessibleProfiles } from "@/features/family/access";
import { listActiveProfileSubjectsForProfiles } from "@/features/profile-subjects/repository";
import { listMembershipsForProfiles } from "@/features/turmas/repository";
import type { AgendaClassDay } from "./class-days";
import { attachAlternatingSlots, listSubjectsForTurma } from "./repository";

/**
 * Uma matéria oferecível a uma criança: da turma em que ela participa, ou
 * extracurricular dela.
 *
 * Carrega `classDays` e `alternatingSlots` porque o formulário calcula no
 * cliente a próxima aula da matéria para sugerir o prazo — os dois campos são
 * exatamente o que `nextClassDayIso` precisa, e evitam uma ida ao servidor a
 * cada troca de matéria.
 */
export type SubjectOption = {
  id: string;
  name: string;
  colorIndex: number;
  source: "turma" | "extra";
  classDays: AgendaClassDay[];
  alternatingSlots: Array<{ day: AgendaClassDay; anchorIso: string }>;
};

export type SubjectOptionsByProfile = Record<string, SubjectOption[]>;

/**
 * Matérias disponíveis por criança, para os formulários de atividade.
 *
 * Mesma disciplina de consultas do horário do dia: participações, matérias
 * por turma DISTINTA e extras saem em três consultas, independentemente do
 * número de filhos. A participação é conferida aqui porque `active_turma_id`
 * sozinho é preferência — mas quem autoriza de verdade é o serviço, na
 * gravação; isto aqui só decide o que aparece na lista.
 */
export async function listSubjectOptionsByProfile(
  userId: string,
): Promise<SubjectOptionsByProfile> {
  const profiles = await listAccessibleProfiles(userId);
  if (profiles.length === 0) return {};

  const profileIds = profiles.map((p) => p.id);
  const [memberships, extras] = await Promise.all([
    listMembershipsForProfiles(profileIds),
    listActiveProfileSubjectsForProfiles(profileIds),
  ]);

  const membershipKeys = new Set(memberships.map((m) => `${m.profileId}:${m.turmaId}`));
  const turmaIdByProfile = new Map<string, string>();
  for (const profile of profiles) {
    if (profile.activeTurmaId && membershipKeys.has(`${profile.id}:${profile.activeTurmaId}`)) {
      turmaIdByProfile.set(profile.id, profile.activeTurmaId);
    }
  }

  const distinctTurmaIds = [...new Set(turmaIdByProfile.values())];
  const optionsByTurma = new Map<string, SubjectOption[]>();
  if (distinctTurmaIds.length > 0) {
    const perTurma = await Promise.all(distinctTurmaIds.map((id) => listSubjectsForTurma(id)));
    const withSlots = await attachAlternatingSlots(perTurma.flat());
    for (const [index, turmaId] of distinctTurmaIds.entries()) {
      const ids = new Set(perTurma[index]?.map((s) => s.id));
      optionsByTurma.set(
        turmaId,
        withSlots
          .filter((subject) => ids.has(subject.id))
          .map((subject) => ({
            id: subject.id,
            name: subject.name,
            colorIndex: subject.colorIndex,
            source: "turma" as const,
            classDays: subject.classDays,
            alternatingSlots: subject.alternatingSlots.map((slot) => ({
              day: slot.dayOfWeek,
              anchorIso: slot.anchorDate,
            })),
          })),
      );
    }
  }

  const result: SubjectOptionsByProfile = {};
  for (const profile of profiles) {
    const turmaId = turmaIdByProfile.get(profile.id);
    result[profile.id] = [
      ...(turmaId ? (optionsByTurma.get(turmaId) ?? []) : []),
      ...extras
        .filter((extra) => extra.profileId === profile.id)
        .map((extra) => ({
          id: extra.id,
          name: extra.name,
          colorIndex: extra.colorIndex,
          source: "extra" as const,
          // Extracurriculares não têm revezamento quinzenal na v1.
          classDays: extra.classDays.filter((day): day is AgendaClassDay =>
            (["mon", "tue", "wed", "thu", "fri"] as const).includes(day as AgendaClassDay),
          ),
          alternatingSlots: [],
        })),
    ];
  }
  return result;
}
