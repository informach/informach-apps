import { canEditWorkouts } from "@/features/acesso/policy";
import { requireTrainer } from "@/features/familia/view";
import { MAX_CUSTOM_WORKOUTS } from "@/features/meus-treinos/repository";
import { buildSteps, estimateMinutes, SEM_IMPACTO } from "@/features/treino/catalog/workouts";
import { workoutCards } from "@/features/treino/dados";
import { TreinosScreen } from "@/features/treino/telas/treinos";

export const metadata = { title: "Treinos" };

/** Treino com algum exercício de salto (os que "leve" troca por versão sem impacto). */
const temPulo = (steps: ReturnType<typeof buildSteps>) =>
  steps.some((s) =>
    s.kind === "amrap"
      ? s.circuit.some((c) => c.exerciseId in SEM_IMPACTO)
      : s.kind === "exercise" && s.exerciseId in SEM_IMPACTO,
  );

export default async function Treinos() {
  const { user, profile, access } = await requireTrainer();
  const cards = await workoutCards(user.id, access);
  return (
    <TreinosScreen
      profile={profile}
      treinos={cards.map((w) => ({
        ...w,
        minutos: estimateMinutes(w),
        semPulo: !temPulo(buildSteps(w)),
      }))}
      podeMontar={canEditWorkouts(access)}
      maxMeus={MAX_CUSTOM_WORKOUTS}
    />
  );
}
