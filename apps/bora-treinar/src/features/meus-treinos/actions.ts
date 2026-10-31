"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canEditWorkouts } from "@/features/acesso/policy";
import { runAction, verifiedUser } from "@/lib/action";
import { assertAllowed } from "@/lib/errors";
import { audit } from "@/lib/observability";
import { familyView } from "../familia/view";
import { deleteCustomWorkout, saveCustomWorkout } from "./repository";
import { customWorkoutSchema } from "./schema";

async function editor() {
  const user = await verifiedUser();
  const { access } = await familyView(user.id);
  assertAllowed(
    canEditWorkouts(access),
    "PLAN",
    "Montar treinos próprios faz parte da assinatura.",
  );
  return user;
}

export async function saveCustomWorkoutAction(input: unknown, id?: string) {
  return runAction(async () => {
    const workout = customWorkoutSchema.parse(input);
    const workoutId = z.uuid().optional().parse(id);
    const user = await editor();
    const saved = await saveCustomWorkout(user.id, workout, workoutId);
    audit({
      eventType: "bora.custom_workout_saved",
      actorId: user.id,
      payload: { workoutId: saved, created: !workoutId },
    });
    revalidatePath("/", "layout");
    return { id: saved };
  });
}

export async function deleteCustomWorkoutAction(id: string) {
  return runAction(async () => {
    const workoutId = z.uuid().parse(id);
    const user = await editor();
    await deleteCustomWorkout(user.id, workoutId);
    audit({ eventType: "bora.custom_workout_deleted", actorId: user.id, payload: { workoutId } });
    revalidatePath("/", "layout");
  });
}
