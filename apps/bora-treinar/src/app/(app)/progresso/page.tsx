import { historyLimit } from "@/features/acesso/policy";
import { CONQUISTAS } from "@/features/conquistas/catalogo";
import { progressOf } from "@/features/familia/repository";
import { requireTrainer } from "@/features/familia/view";
import { achievementsOf, sessionsOf } from "@/features/sessoes/repository";
import { ProgressScreen } from "@/features/treino/telas/progresso";
import { FUSO_PADRAO } from "@/lib/datas";

export const metadata = { title: "Progresso" };

export default async function Progresso() {
  const { profile, access, family } = await requireTrainer();
  const [sessions, progress, earned] = await Promise.all([
    // o bastante para o histórico do plano, o gráfico de 8 semanas e os recordes do ano
    sessionsOf(profile.id, { since: new Date(Date.now() - 400 * 86_400_000) }),
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
      paid={access.unlocked}
      historyLimit={historyLimit(access)}
      fuso={family?.timezone ?? FUSO_PADRAO}
    />
  );
}
