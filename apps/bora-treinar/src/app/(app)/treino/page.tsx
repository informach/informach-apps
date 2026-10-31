import { notFound, redirect } from "next/navigation";
import { canCountWithCamera, canStartWorkout, parseWorkoutRef } from "@/features/acesso/policy";
import { progressOf } from "@/features/familia/repository";
import { requireTrainer } from "@/features/familia/view";
import { resolveWorkout } from "@/features/sessoes/service";
import { WorkoutScreen } from "@/features/treino/telas/treino";

export const metadata = { title: "Treino" };

export default async function Treino({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const ref = parseWorkoutRef((await searchParams).ref ?? "");
  if (!ref || ref.kind === "pratica") notFound();
  const { user, profile, access } = await requireTrainer();
  if (!canStartWorkout(access, ref)) redirect("/conta?motivo=treino");
  const [{ workout }, levels] = await Promise.all([
    resolveWorkout(user.id, access, ref),
    progressOf(profile.id),
  ]);
  if (!workout) notFound();
  return (
    <WorkoutScreen
      workout={workout}
      workoutRef={ref.kind === "meu" ? `meu:${ref.id}` : `catalogo:${ref.id}`}
      levels={levels}
      cameraAllowed={canCountWithCamera(access)}
      editHref={ref.kind === "meu" ? `/meus-treinos/${ref.id}` : undefined}
    />
  );
}
