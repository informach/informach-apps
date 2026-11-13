import { historyLimit } from "@/features/acesso/policy";
import { CONQUISTAS } from "@/features/conquistas/catalogo";
import { CartaoDoDesafio } from "@/features/desafios/cartao";
import { dadosDoDesafio } from "@/features/desafios/service";
import { progressOf } from "@/features/familia/repository";
import { requireTrainer } from "@/features/familia/view";
import { achievementsOf, sessionsOf } from "@/features/sessoes/repository";
import { historicoDeSemanas } from "@/features/treino/engine/habito";
import { ProgressScreen } from "@/features/treino/telas/progresso";
import { FUSO_PADRAO } from "@/lib/datas";

export const metadata = { title: "Progresso" };

export default async function Progresso() {
  const { user, profile, access, family } = await requireTrainer();
  const fuso = family?.timezone ?? FUSO_PADRAO;
  const [sessions, progress, earned, desafio] = await Promise.all([
    // o bastante para o histórico do plano, o gráfico de 8 semanas e os recordes do ano
    sessionsOf(user.id, profile.id, { since: new Date(Date.now() - 400 * 86_400_000) }),
    progressOf(user.id, profile.id),
    achievementsOf(user.id, profile.id),
    dadosDoDesafio(user.id, profile.id, fuso, access),
  ]);
  const semanas = historicoDeSemanas(sessions, Date.now(), fuso, profile.weeklyGoal);
  return (
    <ProgressScreen
      profile={profile}
      sessions={sessions}
      progress={progress}
      achievements={earned.map((a) => a.achievementId)}
      allAchievements={CONQUISTAS}
      paid={access.unlocked}
      historyLimit={historyLimit(access)}
      fuso={fuso}
      meta={profile.weeklyGoal}
      semanas={semanas.semanas}
      seguidas={semanas.seguidas}
      desafio={<CartaoDoDesafio dados={desafio} />}
    />
  );
}
