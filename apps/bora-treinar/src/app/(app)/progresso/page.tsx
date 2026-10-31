import { historyLimit } from "@/features/acesso/policy";
import { CONQUISTAS } from "@/features/conquistas/catalogo";
import { progressOf } from "@/features/familia/repository";
import { requireTrainer } from "@/features/familia/view";
import { achievementsOf, sessionsOf } from "@/features/sessoes/repository";
import { ProgressScreen } from "@/features/treino/telas/progresso";

export const metadata = { title: "Progresso" };

export default async function Progresso() {
  const { profile, access } = await requireTrainer();
  const [sessions, progress, earned] = await Promise.all([
    sessionsOf(profile.id),
    progressOf(profile.id),
    achievementsOf(profile.id),
  ]);
  return (
    <ProgressScreen
      profile={profile}
      sessions={sessions}
      progress={progress}
      achievements={earned.map((a) => a.achievementId)}
      allAchievements={CONQUISTAS}
      paid={access.paid}
      historyLimit={historyLimit(access)}
    />
  );
}
