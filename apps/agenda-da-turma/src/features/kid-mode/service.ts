import "server-only";
import { addDaysIso } from "@/features/dashboard/date";
import { nextSchoolDayIso } from "@/features/dashboard/day-labels";
import { findAccessibleProfile } from "@/features/family/access";
import type { ActivityOverviewItem } from "@/features/unified-activities/overview-types";
import { getRoutineSnapshot } from "@/features/unified-activities/service";
import { splitKidTurn } from "./turn";

export type KidModeSnapshot = {
  profile: { id: string; name: string };
  todayIso: string;
  /** O dia de aula seguinte: amanhã, ou a segunda quando amanhã é fim de semana. */
  nextSchoolDayIso: string;
  /** O que fazer agora: o "Para hoje" do adulto e o que vence até a próxima aula. */
  todo: ActivityOverviewItem[];
  /** O resto da semana, para o "Quer adiantar?". */
  ahead: ActivityOverviewItem[];
};

/**
 * O que a criança vê.
 *
 * Reusa `getRoutineSnapshot` com o filtro da própria criança: é a MESMA
 * projeção que o responsável vê em Hoje. **Não criar uma consulta própria
 * aqui**: uma segunda lista da mesma coisa foi o que o app passou a não ter, e
 * pai e filha discordarem sobre o que falta é a pior forma disso.
 *
 * A lista vai até a próxima aula (decisão de 17/10/2026): quem estuda de manhã
 * faz em casa, à tarde ou à noite, o que é para amanhã, e numa sexta o que é
 * para segunda. O recorte é `splitKidTurn`, puro e testado.
 *
 * Devolve `null` quando a criança não existe ou não é acessível: a página
 * responde 404, sem dizer qual dos dois.
 */
export async function getKidModeSnapshot(
  userId: string,
  profileId: string,
): Promise<KidModeSnapshot | null> {
  const profile = await findAccessibleProfile(userId, profileId);
  if (!profile) return null;

  const snapshot = await getRoutineSnapshot(userId, { profileFilter: profile.id });
  const nextSchoolDay = nextSchoolDayIso(snapshot.todayIso);
  return {
    profile: { id: profile.id, name: profile.name },
    todayIso: snapshot.todayIso,
    nextSchoolDayIso: nextSchoolDay,
    ...splitKidTurn(snapshot.buckets, {
      nextSchoolDayIso: nextSchoolDay,
      weekEndIso: addDaysIso(snapshot.todayIso, 6),
    }),
  };
}
