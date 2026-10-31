import "server-only";
import {
  type Access,
  canCountWithCamera,
  canPairPhone,
  canStartWorkout,
  canUseProgression,
  parseWorkoutRef,
  type WorkoutRef,
} from "@/features/acesso/policy";
import { conquistasMerecidas } from "@/features/conquistas/catalogo";
import { exerciseById } from "@/features/treino/catalog/catalog";
import { type Workout, workoutById } from "@/features/treino/catalog/workouts";
import {
  applySuggestion,
  evaluateSession,
  suggestionFor,
} from "@/features/treino/engine/progression";
import { AppError, assertAllowed } from "@/lib/errors";
import {
  createProfile,
  ensureFamily,
  inTransaction,
  progressOf,
  saveProgress,
} from "../familia/repository";
import { customWorkout } from "../meus-treinos/repository";
import type { ImportedProfile } from "./edibody";
import { grantAchievements, insertSession, sessionsOf } from "./repository";
import type { SessionInput } from "./schema";

/** Aceita o avanço de uma trilha, conferindo de novo se ele ainda vale. */
export async function acceptSuggestion(
  access: Access,
  allowedProfileIds: string[],
  profileId: string,
  chainId: string,
) {
  assertAllowed(canUseProgression(access), "PLAN", "Subir de nível faz parte da assinatura.");
  assertAllowed(allowedProfileIds.includes(profileId), "PROFILE", "Perfil não encontrado.");
  await inTransaction(async (tx) => {
    const progress = await progressOf(profileId, tx);
    const st = progress[chainId];
    const suggestion = st && suggestionFor(chainId, st);
    assertAllowed(suggestion, "SUGGESTION", "Este avanço já foi aplicado.");
    await saveProgress(profileId, applySuggestion(progress, suggestion), tx);
    if (suggestion.type === "level") await grantAchievements(tx, profileId, ["novo-nivel"], null);
  });
}

/**
 * Traz perfis e treinos de um backup do EdiBody para a conta. Os perfis entram
 * até o limite do plano; os que não couberem são informados, não descartados
 * em silêncio.
 */
export async function importProfiles(
  userId: string,
  perfis: ImportedProfile[],
  limit: number,
  existing: number,
) {
  const cabem = perfis.slice(0, Math.max(0, limit - existing));
  let sessoes = 0;
  for (const perfil of cabem) {
    const id = await createProfile(userId, perfil.name, perfil.color, limit);
    await inTransaction(async (tx) => {
      await ensureFamily(userId, tx);
      await saveProgress(id, perfil.progress, tx);
      for (const s of perfil.sessions) {
        const created = await insertSession(tx, userId, {
          id: crypto.randomUUID(),
          profileId: id,
          workoutRef: s.workoutRef,
          workoutName: s.workoutName,
          startedAt: s.startedAt,
          duration: s.durationSeconds,
          mode: s.mode,
          logs: s.logs,
        });
        if (created) sessoes += 1;
      }
    });
  }
  return { perfis: cabem.length, sessoes, ficaramDeFora: perfis.length - cabem.length };
}

/** Treino pronto para o player, já validado contra o plano. */
export async function resolveWorkout(
  userId: string,
  access: Access,
  ref: WorkoutRef,
): Promise<{ workout: Workout | null; name: string }> {
  assertAllowed(
    canStartWorkout(access, ref),
    "PLAN",
    "Este treino faz parte da assinatura. O Primeiro treino e a prática de cada exercício são gratuitos.",
  );
  if (ref.kind === "pratica")
    return { workout: null, name: `Prática: ${exerciseById(ref.exerciseId).name}` };
  if (ref.kind === "catalogo") {
    const workout = workoutById(ref.id);
    return { workout, name: workout.name };
  }
  const workout = await customWorkout(userId, ref.id);
  if (!workout) throw new AppError("WORKOUT", "Treino não encontrado.");
  return { workout, name: workout.name };
}

const resumo = (s: {
  startedAt: number;
  mode: string;
  logs: { reps: number; holdSeconds: number }[];
}) => ({
  startedAt: s.startedAt,
  mode: s.mode as "camera" | "manual" | "pareado",
  reps: s.logs.reduce((t, l) => t + l.reps, 0),
  bestHold: Math.max(0, ...s.logs.map((l) => l.holdSeconds)),
});

/**
 * Grava um treino concluído, atualiza a sequência de cada trilha e as
 * conquistas do perfil. Reenviar a mesma sessão (fila offline) não duplica nada.
 */
export async function saveSession(
  userId: string,
  access: Access,
  allowedProfileIds: string[],
  input: SessionInput,
  timezone: string,
) {
  assertAllowed(
    allowedProfileIds.includes(input.profileId),
    "PROFILE",
    "Este perfil não está disponível no plano atual.",
  );
  const ref = parseWorkoutRef(input.workoutRef);
  assertAllowed(ref, "WORKOUT", "Treino não encontrado.");
  const { name } = await resolveWorkout(userId, access, ref);
  if (input.mode === "camera")
    assertAllowed(canCountWithCamera(access), "PLAN", "A contagem pela câmera é da assinatura.");
  if (input.mode === "pareado")
    assertAllowed(canPairPhone(access), "PLAN", "O celular como câmera é da assinatura.");
  for (const log of input.logs) {
    const rule = exerciseById(log.exerciseId).rule.kind;
    assertAllowed(rule === log.kind, "INPUT", "Série com tipo diferente do exercício.");
  }
  const logs = input.logs.filter((l) => l.reps > 0 || l.holdSeconds > 0);
  assertAllowed(logs.length, "EMPTY", "Nenhuma série registrada neste treino.");
  // o aparelho pode estar com o relógio errado: o início nunca fica no futuro
  const startedAt = Math.min(input.startedAt, Date.now());

  return inTransaction(async (tx) => {
    const created = await insertSession(tx, userId, {
      id: input.id,
      profileId: input.profileId,
      workoutRef: input.workoutRef,
      workoutName: name,
      startedAt,
      duration: input.durationSeconds,
      mode: input.mode,
      logs,
    });
    if (!created) return { sessionId: input.id, achievements: [] as string[] };
    const progress = await progressOf(input.profileId, tx);
    await saveProgress(input.profileId, evaluateSession(progress, logs).progress, tx);
    const history = await sessionsOf(input.profileId, {}, tx);
    const achievements = await grantAchievements(
      tx,
      input.profileId,
      conquistasMerecidas(history.map(resumo), Date.now(), timezone),
      input.id,
    );
    return { sessionId: input.id, achievements };
  });
}
