import { notFound } from "next/navigation";
import { formatWorkoutRef, parseWorkoutRef } from "@/features/acesso/policy";
import { JogadorPlayground } from "@/features/playground/jogador";
import { exerciseById } from "@/features/treino/catalog/catalog";
import { workoutById } from "@/features/treino/catalog/workouts";

export const metadata = { title: "Treino (playground)" };

/** Só em desenvolvimento: o player de verdade, sem conta e sem salvar no servidor. */
export default async function TreinoPlayground({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string; modo?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const ref = parseWorkoutRef(params.ref ?? "");
  // treinos montados no editor vivem no banco, que o playground não usa
  if (!ref || ref.kind === "meu") notFound();
  const workout = ref.kind === "catalogo" ? workoutById(ref.id) : null;
  const practice = ref.kind === "pratica" ? ref.exerciseId : null;
  return (
    <JogadorPlayground
      workout={workout}
      practiceExerciseId={practice}
      workoutRef={formatWorkoutRef(ref)}
      workoutName={workout?.name ?? `Prática: ${exerciseById(practice ?? "").name}`}
      mode={params.modo === "camera" ? "camera" : "manual"}
    />
  );
}
