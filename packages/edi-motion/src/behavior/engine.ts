import {
  applyDataChanges,
  type DataContext,
  type DataRecord,
  parseDataModels,
  resolveDataPath,
} from "../data";
import { type DrawOrders, evaluatePlaybackDrawOrders, ROOT_DRAW_SCOPE } from "../drawOrder";
import { ease, frameAtSeconds } from "../evaluator";
import {
  type Animation,
  type Easing,
  type Property,
  propertyBounds,
  propertySchema,
  type Transform,
} from "../model";
import {
  evaluateParameters,
  type ParameterContext,
  parameterKey,
  parameterValue,
} from "../parameters";
import { type AnimationDriver, evaluateDrivers, evaluatePlayback } from "../playback";
import { timelineEventsBetween } from "./events";
import { evaluateFormula, type Formula, orderFormulas } from "./formulas";
import {
  type Behavior,
  type BehaviorBinding,
  type BehaviorLayer,
  type BehaviorMachine,
  type BehaviorState,
  type BehaviorTransition,
  type InputValue,
  parseBehavior,
  semanticValue,
  validateInputValue,
} from "./model";

interface Pose {
  transforms: Map<string, Partial<Transform>>;
  parameters: Map<string, number>;
  orders: DrawOrders;
}
interface SourceClock {
  stateId: string;
  seconds: number;
}
interface BlendClock {
  source: SourceClock | Pose;
  elapsed: number;
  duration: number;
  easing: Easing;
  transitionId: string;
  interrupt: "never" | "immediate";
}
export interface LayerClock extends SourceClock {
  blend?: BlendClock;
  entered: boolean;
}
export interface BehaviorSession {
  machineId: string | null;
  inputs: Map<string, InputValue>;
  triggers: Set<string>;
  layers: Map<string, LayerClock>;
  seconds: number;
  data?: Map<string, DataRecord>;
  animationEntered?: boolean;
}
export interface BehaviorContext {
  behavior: Behavior;
  /** Formulas in dependency order, applied after every input write and time step. */
  formulas?: readonly Formula[];
  animations: readonly Animation[];
  objects: ReadonlyMap<string, Transform>;
  drivers?: AnimationDriver[];
  data?: DataContext;
  animation?: Animation;
  parameters?: ParameterContext;
}
/** One artboard owns its runtime objects; globally shared clips are projected
 * to that scope before evaluation, as in the existing composition compiler. */
export function createBehaviorContext(
  input: unknown,
  animations: readonly Animation[],
  objects: ReadonlyMap<string, { tag: string; transform: Transform }>,
  options: {
    drivers?: AnimationDriver[];
    authoredTargets?: ReadonlyMap<string, { tag: string }>;
    animationId?: string;
    parameters?: ParameterContext;
  } = {},
): BehaviorContext {
  const behavior = parseBehavior(
    input,
    options.authoredTargets ?? objects,
    animations,
    options.parameters,
  );
  const animation = options.animationId
    ? animations.find((clip) => clip.id === options.animationId)
    : undefined;
  if (options.animationId && (!animation || behavior.machines.length > 0))
    throw new Error("Clip inicial incompatível com a cena.");
  return {
    behavior,
    objects: new Map([...objects].map(([id, object]) => [id, { ...object.transform }])),
    animations: animations.map((clip) => ({
      ...clip,
      tracks: clip.tracks.filter((track) => objects.has(track.targetId)),
    })),
    drivers: options.drivers,
    data: behavior.data ? parseDataModels(behavior.data) : undefined,
    animation,
    parameters: options.parameters,
    formulas: orderFormulas(behavior.formulas ?? []),
  };
}
/** Recomputes formula inputs from the session's inputs and clock. Numbers are
 * clamped to their input's range; other values must already be valid. */
function withFormulas(context: BehaviorContext, source: BehaviorSession): BehaviorSession {
  if (!context.formulas?.length) return source;
  const inputs = new Map(source.inputs);
  for (const formula of context.formulas) {
    const input = context.behavior.inputs.find((value) => value.id === formula.inputId);
    if (!input || input.kind === "trigger") throw new Error("Input de fórmula ausente.");
    let value = evaluateFormula(
      formula.expression,
      (id) => {
        const current = inputs.get(id);
        if (current === undefined) throw new Error("Fórmula lê input ausente.");
        return current;
      },
      source.seconds,
      semanticValue,
    );
    if (input.kind === "number" && typeof value === "number")
      value = Math.min(input.max, Math.max(input.min, value));
    inputs.set(formula.inputId, validateInputValue(input, value));
  }
  return { ...source, inputs };
}
export interface BehaviorEmission {
  instancePath?: string[];
  layerId: string | null;
  stateId: string | null;
  animationId: string;
  eventId: string;
  name: string;
  data: Record<string, InputValue | null>;
  direction: "forward" | "reverse";
  time: number;
}

function machine(
  context: BehaviorContext,
  session: Pick<BehaviorSession, "machineId">,
): Pick<BehaviorMachine, "layers"> {
  if (session.machineId === null && context.behavior.machines.length === 0) return { layers: [] };
  const result = context.behavior.machines.find((machine) => machine.id === session.machineId);
  if (!result) throw new Error("Máquina não encontrada.");
  return result;
}
function state(layer: BehaviorLayer, id: string) {
  const result = layer.states.find((state) => state.id === id);
  if (!result) throw new Error("Estado não encontrado.");
  return result;
}
function clip(context: BehaviorContext, id: string) {
  const result = context.animations.find((clip) => clip.id === id);
  if (!result) throw new Error("Animação não encontrada.");
  return result;
}
function numberInput(session: BehaviorSession, id: string) {
  const value = session.inputs.get(id);
  if (typeof value !== "number") throw new Error("Input numérico ausente.");
  return value;
}

export function createBehaviorSession(
  context: BehaviorContext,
  machineId = context.behavior.defaultMachineId,
): BehaviorSession {
  const selected = machine(context, { machineId });
  const session: BehaviorSession = {
    machineId,
    ...(context.animation ? { animationEntered: true } : {}),
    seconds: 0,
    triggers: new Set(),
    inputs: new Map(
      context.behavior.inputs.flatMap((input): [string, InputValue][] =>
        input.kind === "trigger" ? [] : [[input.id, input.initial]],
      ),
    ),
    layers: new Map(
      selected.layers.map((layer) => [
        layer.id,
        { stateId: layer.entryStateId, seconds: 0, entered: true },
      ]),
    ),
  };
  return withFormulas(
    context,
    context.data ? withDataValues(context, session, new Map(context.data.initial)) : session,
  );
}
function withDataValues(
  context: BehaviorContext,
  source: BehaviorSession,
  data: Map<string, DataRecord>,
): BehaviorSession {
  if (!context.data) throw new Error("Sessão sem modelos de dados.");
  const inputs = new Map(source.inputs);
  for (const link of context.data.document.links) {
    const input = context.behavior.inputs.find((input) => input.id === link.inputId);
    if (!input) throw new Error("Input vinculado ausente.");
    inputs.set(
      link.inputId,
      validateInputValue(
        input,
        resolveDataPath(context.data, data, link.instanceId, link.path).value,
      ),
    );
  }
  return withFormulas(context, { ...source, data, inputs });
}
export function editBehaviorData(
  context: BehaviorContext,
  source: BehaviorSession,
  changes: unknown,
): BehaviorSession {
  if (!context.data || !source.data) throw new Error("Sessão sem modelos de dados.");
  return withDataValues(context, source, applyDataChanges(context.data, source.data, changes));
}
export function setBehaviorInput(
  context: BehaviorContext,
  source: BehaviorSession,
  id: string,
  value: unknown,
): BehaviorSession {
  const input = context.behavior.inputs.find((input) => input.id === id);
  if (!input) throw new Error("Input não encontrado.");
  if (context.formulas?.some((formula) => formula.inputId === id))
    throw new Error("Input calculado por fórmula é somente leitura.");
  const clean = validateInputValue(input, value);
  if (source.inputs.get(id) === clean) return source;
  const link = context.data?.document.links.find((link) => link.inputId === id);
  if (link) {
    if (link.direction !== "two-way")
      throw new Error("Input é controlado pelo modelo de dados (somente leitura).");
    return editBehaviorData(context, source, [
      { operation: "set", instanceId: link.instanceId, path: link.path, value: clean },
    ]);
  }
  const inputs = new Map(source.inputs);
  inputs.set(id, clean);
  return withFormulas(context, { ...source, inputs });
}
export function fireBehaviorTrigger(
  context: BehaviorContext,
  source: BehaviorSession,
  id: string,
): BehaviorSession {
  if (!context.behavior.inputs.some((input) => input.id === id && input.kind === "trigger"))
    throw new Error("Gatilho não encontrado.");
  return { ...source, triggers: new Set([...source.triggers, id]) };
}
function stateDuration(context: BehaviorContext, value: BehaviorState) {
  if (value.kind === "base") return 1 / value.speed;
  const ids =
    value.kind === "animation"
      ? [value.animationId]
      : value.points.map((point) => point.animationId);
  return (
    Math.max(
      ...ids.map((id) => {
        const animation = clip(context, id);
        return animation.frames / animation.fps;
      }),
    ) / value.speed
  );
}
function blendPair(value: Extract<BehaviorState, { kind: "blend1d" }>, session: BehaviorSession) {
  const input = numberInput(session, value.inputId);
  const first = value.points[0],
    last = value.points.at(-1);
  if (!first || !last) throw new Error("Blend sem pontos.");
  if (input <= first.at) return { a: first, b: first, weight: 0 };
  if (input >= last.at) return { a: last, b: last, weight: 0 };
  const index = value.points.findIndex((point) => point.at > input),
    a = value.points[index - 1],
    b = value.points[index];
  if (!a || !b) throw new Error("Intervalo de blend inválido.");
  return { a, b, weight: (input - a.at) / (b.at - a.at) };
}
function baseValue(context: BehaviorContext, id: string, property: Property) {
  const base = context.objects.get(id);
  if (!base) throw new Error("Pose de referência ausente.");
  return base[property] ?? 0;
}
function mix(context: BehaviorContext, a: Pose, b: Pose, weight: number): Pose {
  // Stacking is discrete, like discrete channels: the nearer pose wins (an absent order is
  // the authored one).
  const result: Pose = {
    transforms: new Map(),
    parameters: new Map(),
    orders: new Map(weight < 0.5 ? a.orders : b.orders),
  };
  for (const id of new Set([...a.transforms.keys(), ...b.transforms.keys()])) {
    const left = a.transforms.get(id),
      right = b.transforms.get(id),
      values: Partial<Transform> = {};
    for (const property of propertySchema.options)
      if (left?.[property] !== undefined || right?.[property] !== undefined) {
        const start = left?.[property] ?? baseValue(context, id, property),
          end = right?.[property] ?? baseValue(context, id, property);
        values[property] = clamp(property, start + (end - start) * weight);
      }
    result.transforms.set(id, values);
  }
  for (const key of new Set([...a.parameters.keys(), ...b.parameters.keys()])) {
    const definition = context.parameters?.definitions.get(key);
    if (!definition) throw new Error("Parâmetro de blend órfão.");
    const start = a.parameters.get(key) ?? definition.initial,
      end = b.parameters.get(key) ?? definition.initial;
    result.parameters.set(
      key,
      definition.discrete
        ? weight < 0.5
          ? start
          : end
        : parameterValue(definition, start + (end - start) * weight),
    );
  }
  return result;
}
function sampledPose(
  context: BehaviorContext,
  animation: Animation | undefined,
  frame: number,
  seconds: number,
): Pose {
  return {
    transforms: animation
      ? evaluatePlayback(animation, frame, context.drivers ?? [])
      : evaluateDrivers(seconds, context.drivers ?? []),
    parameters: evaluateParameters(
      context.parameters,
      animation,
      frame,
      seconds,
      context.drivers ?? [],
    ),
    orders: evaluatePlaybackDrawOrders(animation, frame, seconds, context.drivers ?? []),
  };
}
function statePose(
  context: BehaviorContext,
  session: BehaviorSession,
  value: BehaviorState,
  seconds: number,
): Pose {
  if (value.kind === "base") return sampledPose(context, undefined, 0, seconds * value.speed);
  const phase = seconds / stateDuration(context, value);
  const evaluate = (id: string) => {
    const animation = clip(context, id);
    const frame = frameAtSeconds((phase * animation.frames) / animation.fps, animation);
    return sampledPose(context, animation, frame, frame / animation.fps);
  };
  if (value.kind === "animation") return evaluate(value.animationId);
  const pair = blendPair(value, session);
  return mix(context, evaluate(pair.a.animationId), evaluate(pair.b.animationId), pair.weight);
}
function layerPose(
  context: BehaviorContext,
  session: BehaviorSession,
  layer: BehaviorLayer,
  clock: LayerClock,
) {
  const target = statePose(context, session, state(layer, clock.stateId), clock.seconds);
  if (!clock.blend) return target;
  const from =
    "transforms" in clock.blend.source
      ? clock.blend.source
      : statePose(
          context,
          session,
          state(layer, clock.blend.source.stateId),
          clock.blend.source.seconds,
        );
  return mix(
    context,
    from,
    target,
    ease(clock.blend.elapsed / clock.blend.duration, clock.blend.easing),
  );
}
function condition(session: BehaviorSession, value: BehaviorTransition["conditions"][number]) {
  if (value.operator === "trigger") return session.triggers.has(value.inputId);
  const current = session.inputs.get(value.inputId);
  if (value.operator === "eq") return current === value.value;
  if (value.operator === "neq") return current !== value.value;
  if (typeof current !== "number" || typeof value.value !== "number")
    throw new Error("Condição numérica incompatível.");
  if (value.operator === "gt") return current > value.value;
  if (value.operator === "gte") return current >= value.value;
  if (value.operator === "lt") return current < value.value;
  return current <= value.value;
}
function eligible(session: BehaviorSession, layer: BehaviorLayer, clock: LayerClock) {
  if (clock.blend?.interrupt === "never") return [];
  return layer.transitions
    .filter(
      (transition) =>
        (transition.from === "*" || transition.from === clock.stateId) &&
        transition.to !== clock.stateId &&
        transition.conditions.every((conditionValue) => condition(session, conditionValue)),
    )
    .sort((a, b) => b.priority - a.priority);
}
function clamp(property: Property, value: number) {
  const [min, max] = propertyBounds[property];
  if (!Number.isFinite(value)) throw new Error("Pose calculada excedeu o intervalo numérico.");
  return Math.max(min, Math.min(max, value));
}

/** Later layers compose in authored order. Additive uses deltas from bind/base
 * pose, override interpolates current pose. Bindings have explicit final priority. */
export function evaluateBehavior(context: BehaviorContext, session: BehaviorSession) {
  const poses: Map<string, Transform> = new Map(
    [...context.objects].map(([id, transform]) => [id, { ...transform }]),
  );
  const selected = machine(context, session);
  const orders: DrawOrders = new Map();
  const parameters = new Map(
    [...(context.parameters?.definitions ?? [])].map(([key, definition]) => [
      key,
      definition.initial,
    ]),
  );
  if (selected.layers.length === 0) {
    const pose = sampledPose(
      context,
      context.animation,
      context.animation ? frameAtSeconds(session.seconds, context.animation) : 0,
      session.seconds,
    );
    for (const [key, value] of pose.parameters) parameters.set(key, value);
    for (const [scope, order] of pose.orders) orders.set(scope, order);
    for (const [id, patch] of pose.transforms) {
      const target = poses.get(id);
      if (!target) throw new Error("Objeto de componente ausente.");
      Object.assign(target, patch);
    }
  }
  for (const layer of selected.layers) {
    if (layer.weight === 0) continue;
    const clock = session.layers.get(layer.id);
    if (!clock) throw new Error("Relógio de camada ausente.");
    const pose = layerPose(context, session, layer, clock);
    // A draw order belongs to a masked layer when its parent is inside the mask (the root
    // only to unmasked layers); like a discrete channel, it applies from half weight.
    if (layer.weight >= 0.5)
      for (const [scope, order] of pose.orders)
        if (
          !layer.targetIds.length ||
          (scope !== ROOT_DRAW_SCOPE && layer.targetIds.includes(scope))
        )
          orders.set(scope, order);
    for (const [id, values] of pose.transforms) {
      if (layer.targetIds.length && !layer.targetIds.includes(id)) continue;
      const current = poses.get(id);
      if (!current) throw new Error("Objeto de camada ausente.");
      for (const property of layer.properties) {
        const value = values[property];
        if (value === undefined) continue;
        const base = baseValue(context, id, property),
          start = current[property] ?? base;
        current[property] = clamp(
          property,
          layer.mode === "additive"
            ? start + (value - base) * layer.weight
            : start + (value - start) * layer.weight,
        );
      }
    }
    for (const [key, value] of pose.parameters) {
      const definition = context.parameters?.definitions.get(key),
        start = parameters.get(key);
      if (!definition || start === undefined) throw new Error("Parâmetro de camada órfão.");
      // A constraint affecting several bones belongs to a masked layer only
      // when all of its owners are inside that mask. Transform-property masks
      // do not discard the separate, typed parameter channels.
      if (
        layer.targetIds.length &&
        !definition.ownerIds.every((id) => layer.targetIds.includes(id))
      )
        continue;
      if (definition.discrete) {
        if (layer.mode === "additive")
          throw new Error("Canais discretos não admitem camada aditiva.");
        if (layer.weight >= 0.5) parameters.set(key, value);
      } else
        parameters.set(
          key,
          parameterValue(
            definition,
            layer.mode === "additive"
              ? start + (value - definition.initial) * layer.weight
              : start + (value - start) * layer.weight,
          ),
        );
    }
  }
  const text = new Map<string, string>(),
    colors = new Map<string, Partial<Record<"fill" | "stroke", string>>>(),
    visibility = new Map<string, boolean>(),
    semantics = new Map<string, Partial<Record<"label" | "description", string>>>();
  for (const binding of context.behavior.bindings) {
    const value = session.inputs.get(binding.inputId);
    if (binding.kind === "parameter") {
      const key = parameterKey([], binding.targetId, binding.property),
        definition = context.parameters?.definitions.get(key);
      if (!definition || typeof value !== "number")
        throw new Error("Binding de parâmetro inválido.");
      parameters.set(key, parameterValue(definition, value * binding.scale + binding.offset));
    } else if (binding.kind === "transform") {
      const target = poses.get(binding.targetId);
      if (!target || typeof value !== "number") throw new Error("Binding numérico inválido.");
      target[binding.property] = clamp(binding.property, value * binding.scale + binding.offset);
    } else if (binding.kind === "text") {
      if (typeof value !== "string") throw new Error("Binding de texto inválido.");
      text.set(binding.targetId, value);
    } else if (binding.kind === "color") {
      if (typeof value !== "string") throw new Error("Binding de cor inválido.");
      colors.set(binding.targetId, { ...colors.get(binding.targetId), [binding.property]: value });
    } else if (binding.kind === "semantics") {
      if (value === undefined) throw new Error("Binding semântico sem valor.");
      semantics.set(binding.targetId, {
        ...semantics.get(binding.targetId),
        [binding.property]: binding.template.replace("{valor}", () => semanticValue(value)),
      });
    } else {
      if (typeof value !== "boolean") throw new Error("Binding de visibilidade inválido.");
      visibility.set(binding.targetId, binding.invert ? !value : value);
    }
  }
  return { poses, parameters, text, colors, visibility, semantics, orders };
}

/** Pure transactional advance: failures/cycles/budgets leave source untouched.
 * Triggers broadcast to eligible layers once per advance, then are consumed.
 * Timed exits and blend boundaries split the step, independent of frame rate. */
export function advanceBehavior(
  context: BehaviorContext,
  source: BehaviorSession,
  deltaSeconds: number,
) {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0 || deltaSeconds > 10)
    throw new Error("Avanço requer 0–10 segundos.");
  if (!Number.isFinite(source.seconds) || source.seconds < 0 || source.seconds + deltaSeconds > 1e9)
    throw new Error("Relógio de sessão fora do intervalo permitido.");
  const session: BehaviorSession = {
    ...source,
    triggers: new Set(source.triggers),
    layers: new Map([...source.layers].map(([id, clock]) => [id, structuredClone(clock)])),
  };
  const selected = machine(context, session),
    events: BehaviorEmission[] = [];
  let remaining = deltaSeconds,
    iterations = 0;
  for (;;) {
    if (++iterations > 256)
      throw new Error("Ciclo de transições ou orçamento de passos excedido; sessão preservada.");
    let changed = false;
    for (const layer of selected.layers) {
      const clock = session.layers.get(layer.id);
      if (!clock) throw new Error("Relógio ausente.");
      const duration = stateDuration(context, state(layer, clock.stateId));
      const transition = eligible(session, layer, clock).find(
        (transition) => transition.exitAt === null || clock.seconds >= transition.exitAt * duration,
      );
      if (!transition) continue;
      const from = clock.blend
        ? layerPose(context, session, layer, clock)
        : { stateId: clock.stateId, seconds: clock.seconds };
      session.layers.set(layer.id, {
        stateId: transition.to,
        seconds: 0,
        entered: true,
        ...(transition.duration > 0
          ? {
              blend: {
                source: from,
                elapsed: 0,
                duration: transition.duration,
                easing: transition.easing,
                transitionId: transition.id,
                interrupt: transition.interrupt,
              },
            }
          : {}),
      });
      changed = true;
    }
    session.triggers.clear();
    if (changed) continue;
    let step = remaining;
    for (const layer of selected.layers) {
      const clock = session.layers.get(layer.id);
      if (!clock) throw new Error("Relógio ausente.");
      const duration = stateDuration(context, state(layer, clock.stateId));
      for (const transition of eligible(session, layer, clock))
        if (transition.exitAt !== null && transition.exitAt * duration > clock.seconds)
          step = Math.min(step, transition.exitAt * duration - clock.seconds);
      if (clock.blend) step = Math.min(step, clock.blend.duration - clock.blend.elapsed);
    }
    if (context.animation && selected.layers.length === 0) {
      for (const occurrence of timelineEventsBetween(
        context.behavior.events,
        context.animation,
        session.seconds,
        session.seconds + step,
        session.animationEntered ?? false,
      )) {
        if (events.length >= 512)
          throw new Error("Orçamento agregado de eventos excedido; sessão preservada.");
        events.push({
          layerId: null,
          stateId: null,
          animationId: context.animation.id,
          eventId: occurrence.event.id,
          name: occurrence.event.name,
          data: { ...occurrence.event.data },
          direction: occurrence.direction,
          time: occurrence.seconds,
        });
      }
      session.animationEntered = false;
    }
    for (const layer of selected.layers) {
      const clock = session.layers.get(layer.id);
      if (!clock) throw new Error("Relógio ausente.");
      const value = state(layer, clock.stateId),
        duration = stateDuration(context, value),
        pair = value.kind === "blend1d" ? blendPair(value, session) : null;
      if (value.kind !== "base") {
        const animation = clip(
          context,
          value.kind === "animation"
            ? value.animationId
            : pair && pair.weight >= 0.5
              ? pair.b.animationId
              : pair
                ? pair.a.animationId
                : "",
        );
        const ratio = animation.frames / animation.fps / duration;
        for (const occurrence of timelineEventsBetween(
          context.behavior.events,
          animation,
          clock.seconds * ratio,
          (clock.seconds + step) * ratio,
          clock.entered,
        )) {
          if (events.length >= 512)
            throw new Error("Orçamento agregado de eventos excedido; sessão preservada.");
          events.push({
            layerId: layer.id,
            stateId: clock.stateId,
            animationId: animation.id,
            eventId: occurrence.event.id,
            name: occurrence.event.name,
            data: { ...occurrence.event.data },
            direction: occurrence.direction,
            time: session.seconds + occurrence.seconds / ratio - clock.seconds,
          });
        }
      }
      clock.entered = false;
      clock.seconds += step;
      if (clock.blend) {
        clock.blend.elapsed += step;
        if (!("transforms" in clock.blend.source)) clock.blend.source.seconds += step;
        if (clock.blend.elapsed >= clock.blend.duration) delete clock.blend;
      }
    }
    session.seconds += step;
    // Time-driven formulas move with the clock, before transitions read them.
    session.inputs = withFormulas(context, session).inputs;
    remaining -= step;
    if (step === 0 && remaining > 0) throw new Error("Relógio não avançou; sessão preservada.");
    if (remaining === 0) {
      // Resolve an exit exactly at the end of the requested interval too.
      const boundary = selected.layers.some((layer) => {
        const clock = session.layers.get(layer.id);
        return (
          clock &&
          eligible(session, layer, clock).some(
            (transition) =>
              transition.exitAt !== null &&
              clock.seconds >=
                transition.exitAt * stateDuration(context, state(layer, clock.stateId)),
          )
        );
      });
      if (!boundary) break;
    }
  }
  const compare = (a: string | null, b: string | null) =>
    a === b ? 0 : a === null ? -1 : b === null ? 1 : a < b ? -1 : 1;
  events.sort(
    (a, b) => a.time - b.time || compare(a.layerId, b.layerId) || compare(a.eventId, b.eventId),
  );
  return { session, events, frame: evaluateBehavior(context, session) };
}

/** Reverse a declared invertible binding through the central input write.
 * No observer graph or recursive propagation is created. */
export function writeBehaviorBinding(
  context: BehaviorContext,
  session: BehaviorSession,
  bindingId: string,
  value: InputValue,
) {
  const binding: BehaviorBinding | undefined = context.behavior.bindings.find(
    (binding) => binding.id === bindingId,
  );
  if (binding?.direction !== "two-way") throw new Error("Binding não permite escrita reversa.");
  if (binding.kind === "transform" || binding.kind === "parameter") {
    if (typeof value !== "number" || binding.scale === 0)
      throw new Error("Conversão reversa inválida.");
    const bounds =
      binding.kind === "transform"
        ? propertyBounds[binding.property]
        : context.parameters?.definitions.get(parameterKey([], binding.targetId, binding.property))
            ?.bounds;
    if (!bounds) throw new Error("Destino reverso ausente.");
    const [min, max] = bounds;
    if (!Number.isFinite(value) || value < min || value > max)
      throw new Error("Valor de destino inválido.");
    return setBehaviorInput(
      context,
      session,
      binding.inputId,
      (value - binding.offset) / binding.scale,
    );
  }
  return setBehaviorInput(context, session, binding.inputId, value);
}
