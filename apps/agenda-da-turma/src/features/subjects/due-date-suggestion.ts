import { todayLocalIso } from "@/features/dashboard/date";
import { type AgendaClassDay, type AlternatingSlot, nextClassDayIso } from "./class-days";

export type ScheduledSubject = {
  name: string;
  classDays: readonly AgendaClassDay[];
  alternatingSlots: readonly AlternatingSlot[];
};

/**
 * Próxima aula da matéria, a partir do horário que a própria família cadastrou.
 *
 * É determinístico, não é palpite: sai de `classDays` e do revezamento
 * quinzenal em `agenda.subject_alternating_slots`. É a diferença que importa —
 * a revisão de 11/09 removeu com razão o preenchimento de prazo pela IA
 * (que inventava datas), mas levou junto este cálculo, que não inventa nada.
 * A IA continua devolvendo `dueAt: null`; quem preenche é isto aqui, no
 * formulário, com a procedência à vista e um toque para alterar.
 *
 * Devolve `null` quando a matéria não tem horário cadastrado — nesse caso o
 * campo fica vazio. Nunca cair em "amanhã" ou "próximo dia útil".
 */
export function suggestDueDateFromSchedule(
  subject: ScheduledSubject,
  todayIso: string = todayLocalIso(),
): { dueAt: string; label: string } | null {
  const dueAt = nextClassDayIso(todayIso, subject.classDays, subject.alternatingSlots);
  if (!dueAt) return null;
  return { dueAt, label: `Calculado pelo horário de ${subject.name}` };
}
