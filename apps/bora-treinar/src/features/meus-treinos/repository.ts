import "server-only";
import { and, db, desc, eq, sql } from "@informach/db";
import { boraCustomWorkouts } from "@informach/db/schema";
import type { Workout } from "@/features/treino/catalog/workouts";
import { assertAllowed } from "@/lib/errors";
import { ensureFamily } from "../familia/repository";
import { type CustomWorkoutInput, toWorkout } from "./schema";

export const MAX_CUSTOM_WORKOUTS = 30;

export async function listCustomWorkouts(userId: string): Promise<Workout[]> {
  const rows = await db
    .select()
    .from(boraCustomWorkouts)
    .where(eq(boraCustomWorkouts.userId, userId))
    .orderBy(desc(boraCustomWorkouts.updatedAt));
  return rows.flatMap((row) => {
    const workout = toWorkout(row);
    return workout ? [workout] : [];
  });
}

export async function customWorkout(userId: string, id: string): Promise<Workout | null> {
  const [row] = await db
    .select()
    .from(boraCustomWorkouts)
    .where(and(eq(boraCustomWorkouts.id, id), eq(boraCustomWorkouts.userId, userId)));
  return row ? toWorkout(row) : null;
}

export async function saveCustomWorkout(
  userId: string,
  input: CustomWorkoutInput,
  id?: string,
): Promise<string> {
  if (id) {
    const updated = await db
      .update(boraCustomWorkouts)
      .set({ ...input, updatedAt: sql`now()` })
      .where(and(eq(boraCustomWorkouts.id, id), eq(boraCustomWorkouts.userId, userId)))
      .returning({ id: boraCustomWorkouts.id });
    assertAllowed(updated.length, "WORKOUT", "Treino não encontrado.");
    return id;
  }
  return db.transaction(async (tx) => {
    await ensureFamily(userId, tx);
    const [counted] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(boraCustomWorkouts)
      .where(eq(boraCustomWorkouts.userId, userId));
    assertAllowed(
      (counted?.total ?? 0) < MAX_CUSTOM_WORKOUTS,
      "WORKOUT_LIMIT",
      `Cabem até ${MAX_CUSTOM_WORKOUTS} treinos próprios. Apague algum para criar outro.`,
    );
    const [row] = await tx
      .insert(boraCustomWorkouts)
      .values({ userId, ...input })
      .returning({ id: boraCustomWorkouts.id });
    assertAllowed(row, "WORKOUT", "Não foi possível salvar o treino.");
    return row.id;
  });
}

export async function deleteCustomWorkout(userId: string, id: string) {
  const deleted = await db
    .delete(boraCustomWorkouts)
    .where(and(eq(boraCustomWorkouts.id, id), eq(boraCustomWorkouts.userId, userId)))
    .returning({ id: boraCustomWorkouts.id });
  assertAllowed(deleted.length, "WORKOUT", "Treino não encontrado.");
}
