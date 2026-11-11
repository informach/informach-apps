import { redirect } from "next/navigation";
import { canUseProgression } from "@/features/acesso/policy";
import { CartaoDoDesafio } from "@/features/desafios/cartao";
import { dadosDoDesafio } from "@/features/desafios/service";
import { progressOf } from "@/features/familia/repository";
import { requireTrainer } from "@/features/familia/view";
import { sessionsOf } from "@/features/sessoes/repository";
import { estimateMinutes } from "@/features/treino/catalog/workouts";
import { workoutCards } from "@/features/treino/dados";
import { historicoDeSemanas, semanaAtual } from "@/features/treino/engine/habito";
import { pendingSuggestions } from "@/features/treino/engine/progression";
import { recomendar } from "@/features/treino/engine/recomendar";
import { weeklyReps } from "@/features/treino/engine/stats";
import { HomeScreen } from "@/features/treino/telas/inicio";
import { FUSO_PADRAO, numeroDoDia } from "@/lib/datas";

export const metadata = { title: "Início" };

export default async function Inicio() {
  const { user, profile, access, family } = await requireTrainer();
  // perfil que ainda não fez o primeiro acesso responde as três perguntas antes
  if (!profile.onboardedAt) redirect(`/perfis/${profile.id}/comecar`);
  const fuso = family?.timezone ?? FUSO_PADRAO;
  const agora = Date.now();
  const [sessions, progress, workouts, desafio] = await Promise.all([
    // o bastante para as semanas cumpridas (até ~10 semanas seguidas) e a semana atual
    sessionsOf(user.id, profile.id, { since: new Date(agora - 120 * 86_400_000) }),
    progressOf(user.id, profile.id),
    workoutCards(user.id, access),
    dadosDoDesafio(user.id, profile.id, fuso, access),
  ]);
  const hoje = numeroDoDia(agora, fuso);
  const rec = recomendar({
    candidatos: workouts.map((w) => ({
      ref: w.ref,
      name: w.name,
      focus: w.focus,
      level: w.level,
      minutos: estimateMinutes(w),
      locked: w.locked,
    })),
    recentes: sessions.slice(-5),
    minutosPref: profile.minutesPref,
    intensidade: profile.intensity,
    treinouHoje: sessions.some((s) => numeroDoDia(s.startedAt, fuso) === hoje),
    dia: hoje,
  });
  const card = rec && workouts.find((w) => w.ref === rec.ref);
  const semana = semanaAtual(sessions, agora, fuso, profile.weeklyGoal);
  const historico = historicoDeSemanas(sessions, agora, fuso, profile.weeklyGoal);
  const volume = weeklyReps(sessions, 1, agora, fuso)[0] ?? { reps: 0, minutes: 0 };
  return (
    <HomeScreen
      profile={profile}
      hoje={card && rec ? { card, motivo: rec.motivo } : null}
      semana={{
        ...semana,
        seguidas: historico.seguidas,
        reps: volume.reps,
        minutos: volume.minutes,
      }}
      sugestoes={pendingSuggestions(progress)}
      progress={progress}
      paid={canUseProgression(access)}
      desafio={desafio.liberado ? <CartaoDoDesafio dados={desafio} /> : null}
    />
  );
}
