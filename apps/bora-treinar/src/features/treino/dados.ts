import "server-only";
import { type Access, canStartWorkout } from "@/features/acesso/policy";
import { listCustomWorkouts } from "@/features/meus-treinos/repository";
import { WORKOUTS } from "./catalog/workouts";
import type { WorkoutCard } from "./telas/inicio";

/** Treinos do catálogo e da família, marcando os que o plano ainda não libera. */
export async function workoutCards(userId: string, access: Access): Promise<WorkoutCard[]> {
  const mine = access.paid ? await listCustomWorkouts(userId) : [];
  return [
    ...mine.map((w) => ({ ...w, ref: w.id, locked: false })),
    ...WORKOUTS.map((w) => ({
      ...w,
      ref: `catalogo:${w.id}`,
      locked: !canStartWorkout(access, { kind: "catalogo", id: w.id }),
    })),
  ];
}
