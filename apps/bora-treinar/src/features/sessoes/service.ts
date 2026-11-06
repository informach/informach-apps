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
import {
  buildSteps,
  seriesPlanejadas,
  soSeries,
  type Workout,
  workoutById,
} from "@/features/treino/catalog/workouts";
import {
  applySuggestion,
  evaluateSession,
  suggestionFor,
} from "@/features/treino/engine/progression";
import type { SetLog } from "@/features/treino/engine/runner";
import { AppError, assertAllowed } from "@/lib/errors";
import {
  inTransaction,
  lockProfile,
  progressOf,
  saveProgress,
  type Tx,
} from "../familia/repository";
import { customWorkout } from "../meus-treinos/repository";
import {
  grantAchievements,
  insertSession,
  melhoresAnteriores,
  resumosDoPerfil,
} from "./repository";
import type { GroupInput, SessionInput } from "./schema";

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
    await lockProfile(tx, profileId);
    const progress = await progressOf(profileId, tx);
    const st = progress[chainId];
    const suggestion = st && suggestionFor(chainId, st);
    assertAllowed(suggestion, "SUGGESTION", "Este avanço já foi aplicado.");
    await saveProgress(profileId, applySuggestion(progress, suggestion), tx);
    if (suggestion.type === "level") await grantAchievements(tx, profileId, ["novo-nivel"], null);
  });
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

/** As checagens de um treino antes de gravar (plano, perfil, modo, séries): sem banco aberto. */
async function validarSessao(
  userId: string,
  access: Access,
  allowedProfileIds: string[],
  input: SessionInput,
) {
  assertAllowed(
    allowedProfileIds.includes(input.profileId),
    "PROFILE",
    "Este perfil não está disponível no plano atual.",
  );
  const ref = parseWorkoutRef(input.workoutRef);
  assertAllowed(ref, "WORKOUT", "Treino não encontrado.");
  const { name, workout } = await resolveWorkout(userId, access, ref);
  if (input.mode === "camera")
    assertAllowed(canCountWithCamera(access), "PLAN", "A contagem pela câmera é da assinatura.");
  if (input.mode === "pareado")
    assertAllowed(canPairPhone(access), "PLAN", "O celular como câmera é da assinatura.");
  for (const log of input.logs) {
    const rule = exerciseById(log.exerciseId).rule.kind;
    assertAllowed(rule === log.kind, "INPUT", "Série com tipo diferente do exercício.");
  }
  const feitos = input.logs.filter((l) => l.reps > 0 || l.holdSeconds > 0);
  assertAllowed(feitos.length, "EMPTY", "Nenhuma série registrada neste treino.");
  // o aparelho pode estar com o relógio errado: o início nunca fica no futuro
  const startedAt = Math.min(input.startedAt, Date.now());
  return { input, name, workout, feitos, startedAt };
}

type Validada = Awaited<ReturnType<typeof validarSessao>>;

/**
 * Grava um treino validado dentro da transação: trava o perfil, confere as metas pelo plano do
 * servidor, atualiza as trilhas e as conquistas.
 */
async function gravarSessao(tx: Tx, userId: string, v: Validada, timezone: string) {
  const { input, name, workout, feitos, startedAt } = v;
  {
    // o perfil fica travado até o fim: o progresso é lido e regravado aqui dentro
    const { intensity, weeklyGoal } = await lockProfile(tx, input.profileId);
    const progress = await progressOf(input.profileId, tx);
    // o servidor remonta o treino com os níveis e a intensidade do perfil: a meta de cada série e
    // quantas séries havia saem daqui, não do aparelho
    const plano = seriesPlanejadas(
      workout ? buildSteps(workout, levelMap(progress), { intensidade: intensity }) : [],
    );
    const logs = feitos.map((l) => conferirMeta(l, plano.metas));
    const created = await insertSession(tx, userId, {
      id: input.id,
      profileId: input.profileId,
      workoutRef: input.workoutRef,
      workoutName: name,
      startedAt,
      duration: input.durationSeconds,
      mode: input.mode,
      logs,
      feeling: input.feeling ?? null,
      endedEarly: input.endedEarly ?? false,
      groupId: input.groupId ?? null,
    });
    if (!created) return { sessionId: input.id, achievements: [] as string[] };
    // quem parou antes não perde a sequência pelas séries que não fez; só o "difícil" pesa
    if (!input.endedEarly || input.feeling === "dificil") {
      const avaliado = evaluateSession(progress, logs, {
        planejadas: input.endedEarly ? undefined : plano.contagem,
        feeling: input.feeling,
      });
      await saveProgress(input.profileId, avaliado.progress, tx);
    }
    // dois agregados no banco: o histórico resumido e as melhores marcas sem esta sessão
    const history = await resumosDoPerfil(input.profileId, tx);
    const anteriores = await melhoresAnteriores(input.profileId, input.id, tx);
    const achievements = await grantAchievements(
      tx,
      input.profileId,
      conquistasMerecidas(history, Date.now(), timezone, weeklyGoal, {
        duration: input.durationSeconds,
        logs,
        melhoresAnteriores: anteriores,
      }),
      input.id,
    );
    return { sessionId: input.id, achievements };
  }
}

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
  assertAllowed(!input.groupId, "INPUT", "Treino em grupo vai junto com o grupo.");
  const v = await validarSessao(userId, access, allowedProfileIds, input);
  return inTransaction((tx) => gravarSessao(tx, userId, v, timezone));
}

/**
 * Treinar junto: um treino por perfil, gravados numa transação só (ou nenhum). Os perfis são
 * travados em ordem de id, para dois grupos com as mesmas pessoas não se travarem um ao outro.
 */
export async function saveGroupSession(
  userId: string,
  access: Access,
  allowedProfileIds: string[],
  grupo: GroupInput,
  timezone: string,
) {
  assertAllowed(access.unlocked, "PLAN", "Treinar junto é do plano Família.");
  const validadas: Validada[] = [];
  for (const s of [...grupo.sessoes].sort((a, b) => a.profileId.localeCompare(b.profileId))) {
    const v = await validarSessao(userId, access, allowedProfileIds, s);
    assertAllowed(
      v.workout && soSeries(v.workout),
      "WORKOUT",
      "Treinar junto é só com treino de séries.",
    );
    validadas.push(v);
  }
  return inTransaction(async (tx) => {
    const sessoes = [];
    for (const v of validadas) sessoes.push(await gravarSessao(tx, userId, v, timezone));
    return { groupId: grupo.groupId, sessoes };
  });
}

const levelMap = (progress: Awaited<ReturnType<typeof progressOf>>) =>
  Object.fromEntries(
    Object.entries(progress).map(([k, v]) => [k, { level: v.level, bonus: v.bonus }]),
  );

/**
 * A meta de cada série é a que o servidor planejou. Uma meta que o plano não tem (aparelho com
 * nível velho, envio adulterado, prática ou aquecimento) deixa de existir: a série fica guardada,
 * mas não conta para subir de nível.
 */
function conferirMeta(l: SetLog, metas: ReadonlyMap<string, readonly number[]>): SetLog {
  if (l.target === undefined) return l;
  const planejadas = metas.get(l.exerciseId);
  if (!planejadas?.length) return { ...l, target: undefined };
  return planejadas.includes(l.target) ? l : { ...l, target: Math.max(...planejadas) };
}
