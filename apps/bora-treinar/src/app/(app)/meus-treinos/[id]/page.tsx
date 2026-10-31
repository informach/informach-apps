import { notFound, redirect } from "next/navigation";
import { canEditWorkouts } from "@/features/acesso/policy";
import { requireTrainer } from "@/features/familia/view";
import { WorkoutEditor } from "@/features/meus-treinos/editor";
import { customWorkout } from "@/features/meus-treinos/repository";

export const metadata = { title: "Montar treino" };

export default async function EditarTreino({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, access } = await requireTrainer();
  if (!canEditWorkouts(access)) redirect("/conta?motivo=editor");
  if (id === "novo") return <WorkoutEditor />;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const workout = await customWorkout(user.id, id);
  if (!workout) notFound();
  const { name, subtitle, level, focus, blocks } = workout;
  return <WorkoutEditor id={id} initial={{ name, subtitle, level, focus, blocks }} />;
}
