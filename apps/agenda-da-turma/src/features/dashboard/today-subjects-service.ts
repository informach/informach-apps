import "server-only";

import { findStudentProfileByIdForUser } from "@/features/students/repository";
import {
  type AgendaClassDay,
  dayOfWeekToClassDay,
  isSubjectActiveOnDate,
} from "@/features/subjects/class-days";
import { attachAlternatingSlots, listSubjectsForTurma } from "@/features/subjects/repository";
import { todayLocalIso } from "./date";

export type TodaySubject = {
  id: string;
  name: string;
  teacherName: string | null;
  colorIndex: number;
  // True quando a aula de hoje é uma instância de revezamento quinzenal
  // (matéria tem slot pra hoje). UI mostra badge "quinzenal" pra esclarecer.
  isAlternating: boolean;
  // Nome da matéria pareada no slot de hoje, quando aplicável. Útil pro
  // user lembrar "hoje é Artes porque na semana que vem é ACC". Null
  // quando o pair não foi achado (caso defensivo) ou quando o dia é semanal.
  alternatingPairName: string | null;
};

export type TodaySubjectsView = {
  profileName: string;
  todayIso: string;
  // Weekday do `todayIso` no enum AgendaClassDay (Seg-Sex). Null em Sáb/Dom.
  todayDay: AgendaClassDay | null;
  subjects: TodaySubject[];
};

/**
 * Lista das matérias do perfil que têm aula hoje. Retorna null em 3 casos
 * (que devem ESCONDER o widget na UI):
 *
 *   1. Profile não existe ou não pertence ao user.
 *   2. Profile não tem `activeTurmaId` (sem turma vinculada).
 *   3. Nenhuma matéria da turma tem `classDays` cadastrado (feature ainda
 *      não engajada pelo user). Esconde o card em vez de mostrar empty state
 *      vazio + confuso.
 *
 * Quando retorna view com `subjects: []`, significa que existem matérias com
 * horário mas hoje (sáb/dom ou nenhuma matéria no weekday atual) ninguém
 * tem aula — UI mostra mensagem de fim-de-semana / sem aulas.
 */
export async function getTodaySubjectsForProfile(
  userId: string,
  profileId: string,
): Promise<TodaySubjectsView | null> {
  const profile = await findStudentProfileByIdForUser(userId, profileId);
  if (!profile?.activeTurmaId) return null;

  const rows = await listSubjectsForTurma(profile.activeTurmaId);
  const subjects = await attachAlternatingSlots(rows);

  // Se nenhuma matéria da turma tem classDays, esconde o card — user ainda
  // não cadastrou horários. Mostrar empty state aqui seria ruído.
  const hasAnyClassDays = subjects.some((s) => s.classDays.length > 0);
  if (!hasAnyClassDays) return null;

  const todayIso = todayLocalIso();
  const todayJsDay = new Date(`${todayIso}T12:00:00`).getDay();
  const todayDay = dayOfWeekToClassDay(todayJsDay);

  const subjectNameById = new Map(subjects.map((s) => [s.id, s.name]));

  const todaySubjects: TodaySubject[] = subjects
    .filter((s) =>
      isSubjectActiveOnDate(
        todayIso,
        s.classDays,
        s.alternatingSlots.map((slot) => ({ day: slot.dayOfWeek, anchorIso: slot.anchorDate })),
      ),
    )
    .map((s) => {
      // Slot pra hoje (quando existe) — usa pra marcar "quinzenal" + nome do par.
      const todaySlot = todayDay
        ? s.alternatingSlots.find((slot) => slot.dayOfWeek === todayDay)
        : undefined;
      const pairName = todaySlot ? (subjectNameById.get(todaySlot.pairedSubjectId) ?? null) : null;
      return {
        id: s.id,
        name: s.name,
        teacherName: s.teacherName,
        colorIndex: s.colorIndex,
        isAlternating: todaySlot !== undefined,
        alternatingPairName: pairName,
      };
    });

  return {
    profileName: profile.name,
    todayIso,
    todayDay,
    subjects: todaySubjects,
  };
}
