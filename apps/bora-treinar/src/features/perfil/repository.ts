import "server-only";
import { and, db, eq } from "@informach/db";
import { boraProfiles } from "@informach/db/schema";
import type { Intensidade } from "@/features/treino/catalog/workouts";
import { assertAllowed } from "@/lib/errors";
import type { Tx } from "../familia/repository";
import { lockTrainerAccess, trainerAccessCondition } from "../familia/scope";

export interface PreferenciasDoPerfil {
  intensity?: Intensidade;
  weeklyGoal?: number;
  minutesPref?: number | null;
  /** marca o primeiro acesso como feito */
  onboarded?: boolean;
}

/** Grava o jeito de treinar do perfil (com leitura e escrita concedidas neste app). */
export async function salvarPreferencias(
  userId: string,
  id: string,
  p: PreferenciasDoPerfil,
  tx?: Tx,
): Promise<void> {
  if (!tx) return db.transaction((transaction) => salvarPreferencias(userId, id, p, transaction));
  await lockTrainerAccess(tx, userId, [id]);
  const updated = await tx
    .update(boraProfiles)
    .set({
      ...(p.intensity ? { intensity: p.intensity } : {}),
      ...(p.weeklyGoal ? { weeklyGoal: p.weeklyGoal } : {}),
      ...(p.minutesPref !== undefined ? { minutesPref: p.minutesPref } : {}),
      ...(p.onboarded ? { onboardedAt: new Date() } : {}),
    })
    .where(and(eq(boraProfiles.id, id), trainerAccessCondition(userId, boraProfiles.id, "write")))
    .returning({ id: boraProfiles.id });
  assertAllowed(updated.length, "PROFILE", "Perfil não encontrado.");
}
