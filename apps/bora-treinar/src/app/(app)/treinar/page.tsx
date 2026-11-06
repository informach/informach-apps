import { notFound, redirect } from "next/navigation";
import {
  canCountWithCamera,
  canPairPhone,
  canStartWorkout,
  formatWorkoutRef,
  parseWorkoutRef,
} from "@/features/acesso/policy";
import { progressOf } from "@/features/familia/repository";
import { requireTrainer } from "@/features/familia/view";
import { jaTreinou } from "@/features/sessoes/repository";
import { resolveWorkout } from "@/features/sessoes/service";
import { soSeries } from "@/features/treino/catalog/workouts";
import { MAX_JUNTO, MIN_JUNTO } from "@/features/treino/telas/junto";
import { PlayerLoader } from "@/features/treino/telas/player-loader";

export const metadata = { title: "Treinando" };

export default async function Treinar({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; modo?: string; junto?: string }>;
}) {
  const params = await searchParams;
  const ref = parseWorkoutRef(params.ref ?? "");
  if (!ref) notFound();
  const { user, profile, access, profiles } = await requireTrainer();
  if (!canStartWorkout(access, ref)) redirect("/conta?motivo=treino");
  const pedido = params.modo === "camera" || params.modo === "pareado" ? params.modo : "manual";
  // sem assinatura, a contagem é manual; o servidor também recusa salvar o contrário
  const mode =
    (pedido === "camera" && canCountWithCamera(access)) ||
    (pedido === "pareado" && canPairPhone(access))
      ? pedido
      : "manual";
  const [{ workout, name }, levels, treinou] = await Promise.all([
    resolveWorkout(user.id, access, ref),
    progressOf(profile.id),
    jaTreinou(profile.id),
  ]);
  // treinar junto: 2 a 4 perfis liberados e prontos, num treino só de séries
  const ids = [...new Set((params.junto ?? "").split(",").filter(Boolean))];
  const juntos = ids.length
    ? profiles.filter((p) => ids.includes(p.id) && p.allowed && p.onboardedAt)
    : [];
  if (
    ids.length &&
    (!access.unlocked ||
      juntos.length !== ids.length ||
      juntos.length < MIN_JUNTO ||
      juntos.length > MAX_JUNTO ||
      !workout ||
      !soSeries(workout))
  )
    redirect("/junto");
  const grupo = juntos.length
    ? await Promise.all(
        juntos.map(async (p) => ({
          profileId: p.id,
          name: p.name,
          color: p.color,
          levels: await progressOf(p.id),
          intensidade: p.intensity,
        })),
      )
    : undefined;
  return (
    <PlayerLoader
      // outro treino ou outro modo é outra montagem: o executor nasce uma vez por montagem
      key={`${formatWorkoutRef(ref)}:${mode}:${ids.join(",")}`}
      profile={{
        id: profile.id,
        name: profile.name,
        color: profile.color,
        intensity: profile.intensity,
      }}
      primeiroTreino={!treinou}
      workout={workout}
      practiceExerciseId={ref.kind === "pratica" ? ref.exerciseId : null}
      workoutRef={formatWorkoutRef(ref)}
      workoutName={name}
      mode={mode}
      levels={levels}
      grupo={grupo}
    />
  );
}
