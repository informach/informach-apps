import "server-only";
import { findAccessibleProfile } from "@/features/family/access";
import type { ActivityOverviewItem } from "@/features/unified-activities/overview-types";
import { getRoutineSnapshot } from "@/features/unified-activities/service";

export type KidModeSnapshot = {
  profile: { id: string; name: string };
  /** O que essa criança precisa cuidar hoje, na ordem em que a rotina mostra. */
  todo: ActivityOverviewItem[];
};

/**
 * O que a criança vê.
 *
 * Reusa `getRoutineSnapshot` com o filtro da própria criança e fica com o
 * bucket `attention` — exatamente a mesma lista que o responsável vê em "Para
 * cuidar hoje", pela mesma projeção SQL. **Não criar uma consulta própria
 * aqui**: uma segunda lista da mesma coisa foi o que o app passou a não ter, e
 * pai e filha discordarem sobre o que falta hoje é a pior forma disso.
 *
 * Devolve `null` quando a criança não existe ou não é acessível — a página
 * responde 404, sem dizer qual dos dois.
 */
export async function getKidModeSnapshot(
  userId: string,
  profileId: string,
): Promise<KidModeSnapshot | null> {
  const profile = await findAccessibleProfile(userId, profileId);
  if (!profile) return null;

  const snapshot = await getRoutineSnapshot(userId, { profileFilter: profile.id });
  return {
    profile: { id: profile.id, name: profile.name },
    // Só o bucket da própria criança: o número da casa inteira é do fecho do
    // dia, na tela do responsável. Aqui o progresso é o dela, no dia dela.
    todo: snapshot.buckets.attention,
  };
}
