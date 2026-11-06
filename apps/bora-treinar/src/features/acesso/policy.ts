import { EXERCISES } from "@/features/treino/catalog/catalog";
import { FREE_WORKOUT_IDS, WORKOUTS } from "@/features/treino/catalog/workouts";

export type Tier = "free" | "individual" | "family";
/**
 * O que a conta pode usar agora.
 * - `subscribed`: tem assinatura (ativa, em teste do Stripe, ou com o pagamento atrasado dentro
 *   da tolerância). É o que as telas de cobrança leem.
 * - `trial`: o teste de 7 dias do app, sem cartão.
 * - `unlocked`: assinante ou em teste: é o que libera os recursos. As regras abaixo leem só isto.
 */
export type Access = {
  subscribed: boolean;
  unlocked: boolean;
  trial: { active: boolean; endsAt: number | null; started: boolean };
  tier: Tier;
  profileLimit: number;
};

export const FREE_ACCESS: Access = {
  subscribed: false,
  unlocked: false,
  trial: { active: false, endsAt: null, started: false },
  tier: "free",
  profileLimit: 1,
};

/** Referência a um treino: do catálogo, montado pela família ou prática livre de um exercício. */
export type WorkoutRef =
  | { kind: "catalogo"; id: string }
  | { kind: "meu"; id: string }
  | { kind: "pratica"; exerciseId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function parseWorkoutRef(value: string): WorkoutRef | null {
  const [kind, id, ...rest] = value.split(":");
  if (!id || rest.length) return null;
  if (kind === "catalogo" && WORKOUTS.some((w) => w.id === id)) return { kind, id };
  if (kind === "meu" && UUID.test(id)) return { kind, id };
  if (kind === "pratica" && EXERCISES.some((e) => e.id === id)) return { kind, exerciseId: id };
  return null;
}

export function formatWorkoutRef(ref: WorkoutRef) {
  return ref.kind === "pratica" ? `pratica:${ref.exerciseId}` : `${ref.kind}:${ref.id}`;
}

/**
 * O que o plano gratuito inclui: um perfil, o "Primeiro treino", o "Aquecimento", a biblioteca
 * com o instrutor 3D e a prática de cada exercício contando à mão. O resto é das assinaturas e
 * do teste de 7 dias.
 */
export function canStartWorkout(access: Access, ref: WorkoutRef) {
  if (ref.kind === "pratica") return true;
  if (ref.kind === "catalogo") return access.unlocked || FREE_WORKOUT_IDS.includes(ref.id);
  return access.unlocked;
}

export const canCountWithCamera = (access: Access) => access.unlocked;
export const canUseProgression = (access: Access) => access.unlocked;
export const canUseChallenges = (access: Access) => access.unlocked;
export const canEditWorkouts = (access: Access) => access.unlocked;
export const canPairPhone = (access: Access) => access.unlocked;

/** Quantos treinos do histórico aparecem no progresso. */
export const historyLimit = (access: Access) => (access.unlocked ? 365 : 5);
