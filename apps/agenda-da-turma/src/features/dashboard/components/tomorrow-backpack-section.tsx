import { getTomorrowSubjectsForProfiles } from "../today-subjects-service";
import { TomorrowBackpack } from "./tomorrow-backpack";

/**
 * O slot da mochila no topo da página, à noite.
 *
 * Separado de `tomorrow-backpack.tsx` porque aquele módulo é importado por
 * `routine-view`, que roda no cliente: juntos, o bundler puxava o banco para o
 * navegador.
 */
export async function TomorrowBackpackSection({
  userId,
  profileFilter,
}: {
  userId: string;
  profileFilter: string | null;
}) {
  const schedule = await getTomorrowSubjectsForProfiles(userId, { profileFilter });
  return <TomorrowBackpack schedule={schedule} emphasis />;
}
