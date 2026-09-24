import { addDaysIso } from "@/features/dashboard/date";
import type { DayLoad } from "@/features/unified-activities/load";

/**
 * Onde encaixar as sessões de estudo antes de uma prova.
 *
 * É aritmética, não adivinhação: os dias entre hoje e a véspera, os mais
 * livres primeiro. A família pede o plano, escolhe quantas sessões e de quanto
 * tempo; a Agenda só reparte. É por isso que isto pode existir sem contradizer
 * a regra de que **a IA não cria sessão de estudo a partir de um recado** — o
 * que a escola mandou é uma coisa, o que a casa decide estudar é outra.
 *
 * Determinístico: mesma entrada, mesmas datas, sempre. Dois toques no botão
 * não produzem planos diferentes.
 */
export const MAX_STUDY_SESSIONS = 7;

export function planStudySessions(input: {
  /** Prazo da prova, "YYYY-MM-DD". */
  examDueAt: string;
  todayIso: string;
  sessions: number;
  /** Carga já conhecida de cada dia, para fugir dos dias cheios. */
  loadByDay?: readonly DayLoad[];
}): string[] {
  const last = addDaysIso(input.examDueAt, -1);
  if (last < input.todayIso) return [];
  const wanted = Math.max(1, Math.min(MAX_STUDY_SESSIONS, Math.trunc(input.sessions)));
  const available: string[] = [];
  for (let day = input.todayIso; day <= last; day = addDaysIso(day, 1)) available.push(day);
  if (!available.length) return [];

  const load = new Map(input.loadByDay?.map((day) => [day.iso, day]) ?? []);
  const weight = (iso: string) => {
    const day = load.get(iso);
    // Sessão de estudo de OUTRA prova pesa como qualquer compromisso: ela
    // ocupa o dia igual. O que não pesa é o plano que está sendo refeito, e
    // isso quem tira é a consulta (`findLoadUntilExam`).
    return day ? (day.deliveries + day.study) * 60 + day.minutes : 0;
  };
  // Os dias mais livres primeiro; empate pelo mais próximo de hoje, para que a
  // criança comece cedo em vez de acumular na véspera.
  return [...available]
    .sort((a, b) => weight(a) - weight(b) || (a < b ? -1 : 1))
    .slice(0, Math.min(wanted, available.length))
    .sort((a, b) => (a < b ? -1 : 1));
}
