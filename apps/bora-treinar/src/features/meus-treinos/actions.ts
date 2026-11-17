"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { runAction, verifiedUser } from "@/lib/action";
import { audit } from "@/lib/observability";
import { requireFamilyContext } from "../familia/context";
import { deleteCustomWorkout, saveCustomWorkout } from "./repository";
import { customWorkoutSchema } from "./schema";

export async function saveCustomWorkoutAction(input: unknown, id?: string) {
  return runAction(async () => {
    const workout = customWorkoutSchema.parse(input);
    const workoutId = z.uuid().optional().parse(id);
    const user = await verifiedUser();
    const group = await requireFamilyContext(user.id);
    const saved = await saveCustomWorkout(user.id, group.id, workout, workoutId);
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
    const user = await verifiedUser();
    await deleteCustomWorkout(user.id, workoutId);
    audit({ eventType: "bora.custom_workout_deleted", actorId: user.id, payload: { workoutId } });
    revalidatePath("/", "layout");
  });
}
