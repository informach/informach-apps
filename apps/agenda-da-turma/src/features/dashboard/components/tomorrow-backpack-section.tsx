import { listSubjectKits } from "@/features/subject-kits/service";
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
  // "Levar sempre" é o que a mochila de amanhã existe para lembrar: tênis na
  // educação física vale toda semana e nunca virou atividade.
  const kits = await listSubjectKits(
    userId,
    schedule.map((view) => view.profileId),
  );
  return <TomorrowBackpack schedule={schedule} kits={Object.fromEntries(kits)} emphasis />;
}
