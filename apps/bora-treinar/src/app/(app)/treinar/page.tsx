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
import { resolveWorkout } from "@/features/sessoes/service";
import { PlayerLoader } from "@/features/treino/telas/player-loader";

export const metadata = { title: "Treinando" };

export default async function Treinar({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; modo?: string }>;
}) {
  const params = await searchParams;
  const ref = parseWorkoutRef(params.ref ?? "");
  if (!ref) notFound();
  const { user, profile, access } = await requireTrainer();
  if (!canStartWorkout(access, ref)) redirect("/conta?motivo=treino");
  const pedido = params.modo === "camera" || params.modo === "pareado" ? params.modo : "manual";
  // sem assinatura, a contagem é manual; o servidor também recusa salvar o contrário
  const mode =
    (pedido === "camera" && canCountWithCamera(access)) ||
    (pedido === "pareado" && canPairPhone(access))
      ? pedido
      : "manual";
  const [{ workout, name }, levels] = await Promise.all([
    resolveWorkout(user.id, access, ref),
    progressOf(profile.id),
  ]);
  return (
    <PlayerLoader
      profile={{ id: profile.id, name: profile.name, color: profile.color }}
      workout={workout}
      practiceExerciseId={ref.kind === "pratica" ? ref.exerciseId : null}
      workoutRef={formatWorkoutRef(ref)}
      workoutName={name}
      mode={mode}
      levels={levels}
    />
  );
}
