import { notFound } from "next/navigation";
import { canCountWithCamera } from "@/features/acesso/policy";
import { requireTrainer } from "@/features/familia/view";
import { sessionsOf } from "@/features/sessoes/repository";
import { EXERCISES } from "@/features/treino/catalog/catalog";
import { exerciseHistory } from "@/features/treino/engine/stats";
import { ExerciseScreen } from "@/features/treino/telas/exercicios";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: EXERCISES.find((e) => e.id === id)?.name ?? "Exercício" };
}

export default async function Exercicio({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!EXERCISES.some((e) => e.id === id)) notFound();
  const { profile, access } = await requireTrainer();
  const history = exerciseHistory(await sessionsOf(profile.id), id);
  const best = history.reduce((m, h) => Math.max(m, h.best), 0);
  return <ExerciseScreen id={id} best={best} cameraAllowed={canCountWithCamera(access)} />;
}
