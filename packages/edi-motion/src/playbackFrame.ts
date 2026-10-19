import type { Affine } from "./affine";
import type { Animation, Transform } from "./model";
import { evaluateParameters } from "./parameters";
import { evaluateDrivers, evaluatePlayback, type PlaybackDocument } from "./playback";
import type { RigEvaluationBudget } from "./rig/kinematics";
import {
  applyPlaybackRigs,
  createPlaybackParameterContext,
  createPlaybackRigContext,
} from "./rig/playbackRig";

/** Shared evaluator for authoring, timeline DOM and sampled exports. */
export function createPlaybackContext(document: PlaybackDocument) {
  const rigs = createPlaybackRigContext(document);
  return {
    document,
    bases: new Map(document.objects.map((object) => [object.id, object.transform])),
    rigs,
    parameters: createPlaybackParameterContext(rigs),
  };
}
export type PlaybackContext = ReturnType<typeof createPlaybackContext>;
/** Ephemeral editor inputs applied after clocks, before the shared rig solver. */
function overrideParameters(
  context: PlaybackContext,
  values: Map<string, number>,
  overrides: ReadonlyMap<string, number> | undefined,
  budget: RigEvaluationBudget | undefined,
) {
  if (!overrides) return values;
  if (overrides.size > 2_000) throw new Error("Prévia excede o limite de parâmetros.");
  if (budget) {
    budget.remaining -= overrides.size;
    if (budget.remaining < 0) throw new Error("Prévia excede orçamento de parâmetros.");
  }
  for (const [key, value] of overrides) {
    const definition = context.parameters.definitions.get(key);
    if (!definition) throw new Error("Parâmetro de prévia órfão.");
    if (
      !Number.isFinite(value) ||
      value < definition.bounds[0] ||
      value > definition.bounds[1] ||
      (definition.discrete && !Number.isInteger(value))
    )
      throw new Error("Parâmetro de prévia fora dos limites tipados.");
    values.set(key, value);
  }
  return values;
}
function trackCost(animation: Animation) {
  return animation.tracks.reduce(
    (sum, track) => sum + 1 + Math.ceil(Math.log2(track.keys.length + 1)),
    0,
  );
}
function spendFrameBudget(
  context: PlaybackContext,
  budget: RigEvaluationBudget | undefined,
  animation?: Animation,
) {
  if (!budget) return;
  if (
    !Number.isSafeInteger(budget.remaining) ||
    budget.remaining < 0 ||
    budget.remaining > 2_000_000
  )
    throw new Error("Orçamento compartilhado de avaliação inválido.");
  let cost =
    1 +
    context.bases.size +
    context.parameters.definitions.size +
    (animation ? trackCost(animation) : 0);
  for (const driver of context.document.drivers) cost += 1 + trackCost(driver.animation);
  for (const clip of [
    ...(animation ? [animation] : []),
    ...context.document.drivers.map((driver) => driver.animation),
  ])
    for (const track of context.parameters.clips.get(clip.id) ?? [])
      cost += 1 + Math.ceil(Math.log2(track.keys.length + 1));
  budget.remaining -= cost;
  if (budget.remaining < 0)
    throw new Error("Animação excede orçamento compartilhado de avaliação.");
}
export function evaluatePlaybackFrame(
  context: PlaybackContext,
  animation: Animation,
  frame: number,
  prefixes?: ReadonlyMap<string, Affine>,
  budget?: RigEvaluationBudget,
  parameterOverrides?: ReadonlyMap<string, number>,
) {
  spendFrameBudget(context, budget, animation);
  return completeFrame(
    context,
    evaluatePlayback(animation, frame, context.document.drivers),
    prefixes,
    overrideParameters(
      context,
      evaluateParameters(
        context.parameters,
        animation,
        frame,
        frame / animation.fps,
        context.document.drivers,
      ),
      parameterOverrides,
      budget,
    ),
    budget,
  );
}
/** Static constraints/base geometry do not require a fabricated author clip. */
export function evaluatePlaybackStaticFrame(
  context: PlaybackContext,
  prefixes?: ReadonlyMap<string, Affine>,
  budget?: RigEvaluationBudget,
  parameterOverrides?: ReadonlyMap<string, number>,
) {
  spendFrameBudget(context, budget);
  return completeFrame(
    context,
    evaluateDrivers(0, context.document.drivers),
    prefixes,
    overrideParameters(
      context,
      evaluateParameters(context.parameters, undefined, 0, 0, context.document.drivers),
      parameterOverrides,
      budget,
    ),
    budget,
  );
}
function completeFrame(
  context: PlaybackContext,
  sampled: ReadonlyMap<string, Partial<Transform>>,
  prefixes?: ReadonlyMap<string, Affine>,
  parameters?: ReadonlyMap<string, number>,
  budget?: RigEvaluationBudget,
) {
  const poses = new Map<string, Transform>();
  for (const [id, base] of context.bases) poses.set(id, { ...base, ...sampled.get(id) });
  return applyPlaybackRigs(context.rigs, poses, budget, prefixes, parameters);
}
