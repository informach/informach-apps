import "server-only";

import { isExtraSubjectActiveOnDate } from "@/features/profile-subjects/class-days";
import { listActiveProfileSubjectsForProfile } from "@/features/profile-subjects/repository";
import { findStudentProfileByIdForUser } from "@/features/students/repository";
import {
  type AgendaClassDay,
  dayOfWeekToClassDay,
  isSubjectActiveOnDate,
} from "@/features/subjects/class-days";
import { attachAlternatingSlots, listSubjectsForTurma } from "@/features/subjects/repository";
import { verifyMembership } from "@/features/turmas/repository";
import { todayLocalIso } from "./date";

// Discriminated union — UI renderer escolhe o conjunto de campos a usar
// segundo `source`. Matérias de turma trazem revezamento quinzenal (slots);
// extras nunca (na v1).
export type TodaySubject =
  | {
      source: "turma";
      id: string;
      name: string;
      teacherName: string | null;
      colorIndex: number;
      isAlternating: boolean;
      alternatingPairName: string | null;
    }
  | {
      source: "extra";
      id: string;
      name: string;
      colorIndex: number;
      // Telemetria pra UI mostrar "Pausada desde X" caso resolva exibir
      // matérias paused futuramente. v1 só active aparece aqui.
      status: "active" | "paused";
    };

export type TodaySubjectsView = {
  profileName: string;
  todayIso: string;
  // Weekday do `todayIso` no enum AgendaClassDay (Seg-Sex). Null em Sáb/Dom.
  todayDay: AgendaClassDay | null;
  // Lista combinada — matérias da turma (com horário cadastrado e que
  // batem hoje) + extras `active` do perfil que rolam hoje.
  subjects: TodaySubject[];
};

/**
 * Matérias do perfil que rolam HOJE. Mistura turma + extracurriculares.
 *
 * Casos onde retorna `null` (esconde o widget):
 *   1. Profile não existe ou não pertence ao user.
 *   2. Profile não tem `activeTurmaId` E nenhuma matéria extra `active`.
 *      Quando há ao menos uma das duas fontes, retorna view (mesmo lista
 *      vazia em sáb/dom — UI exibe "fim de semana, sem aulas").
 *
 * Cobertura:
 *   - Matérias de turma usam `isSubjectActiveOnDate` (considera revezamento
 *     quinzenal) só quando `activeTurmaId` está setado.
 *   - Extras `active` usam `isExtraSubjectActiveOnDate` (lookup direto em
 *     `classDays`, sem revezamento na v1). Suporta Sáb/Dom.
 *
 * Ordena alfabético — turma e extras misturam por nome (UX consistente:
 * mesma lista, sem prioridade artificial entre fontes).
 */
export async function getTodaySubjectsForProfile(
  userId: string,
  profileId: string,
): Promise<TodaySubjectsView | null> {
  const profile = await findStudentProfileByIdForUser(userId, profileId);
  if (!profile) return null;

  const todayIso = todayLocalIso();
  const todayJsDay = new Date(`${todayIso}T12:00:00`).getDay();
  const todayDay = dayOfWeekToClassDay(todayJsDay);
  const activeTurmaId =
    profile.activeTurmaId && (await verifyMembership(profile.id, profile.activeTurmaId))
      ? profile.activeTurmaId
      : null;

  // Buscar turma e extras em paralelo (queries independentes).
  const [turmaRows, extraSubjects] = await Promise.all([
    activeTurmaId ? listSubjectsForTurma(activeTurmaId) : Promise.resolve([]),
    listActiveProfileSubjectsForProfile(profileId),
  ]);

  const subjects = turmaRows.length > 0 ? await attachAlternatingSlots(turmaRows) : [];

  // Se nem turma com matérias nem extras existem, esconde o widget.
  const hasAnyTurmaClassDays = subjects.some((s) => s.classDays.length > 0);
  if (!hasAnyTurmaClassDays && extraSubjects.length === 0) return null;

  const subjectNameById = new Map(subjects.map((s) => [s.id, s.name]));

  const todayTurma: TodaySubject[] = subjects
    .filter((s) =>
      isSubjectActiveOnDate(
        todayIso,
        s.classDays,
        s.alternatingSlots.map((slot) => ({ day: slot.dayOfWeek, anchorIso: slot.anchorDate })),
      ),
    )
    .map((s): TodaySubject => {
      const todaySlot = todayDay
        ? s.alternatingSlots.find((slot) => slot.dayOfWeek === todayDay)
        : undefined;
      const pairName = todaySlot ? (subjectNameById.get(todaySlot.pairedSubjectId) ?? null) : null;
      return {
        source: "turma" as const,
        id: s.id,
        name: s.name,
        teacherName: s.teacherName,
        colorIndex: s.colorIndex,
        isAlternating: todaySlot !== undefined,
        alternatingPairName: pairName,
      };
    });

  const todayExtras: TodaySubject[] = extraSubjects
    .filter((s) => isExtraSubjectActiveOnDate(todayIso, s.classDays))
    .map(
      (s): TodaySubject => ({
        source: "extra" as const,
        id: s.id,
        name: s.name,
        colorIndex: s.colorIndex,
        status: s.status,
      }),
    );

  // Ordem fixa: turma primeiro (alfabético), extras depois (alfabético).
  // Decisão de produto: matérias da turma têm prioridade visual no widget
  // "Matérias de hoje" — são o core do app; extracurriculares são satélite.
  // Manter as duas listas separadas na renderização também ajuda o user a
  // bater o olho e entender "ah, primeiro vem a escola, depois o que mais
  // ele faz hoje".
  const sortByName = (a: TodaySubject, b: TodaySubject) => a.name.localeCompare(b.name, "pt-BR");
  const todaySubjects = [...todayTurma.sort(sortByName), ...todayExtras.sort(sortByName)];

  return {
    profileName: profile.name,
    todayIso,
    todayDay,
    subjects: todaySubjects,
  };
}
