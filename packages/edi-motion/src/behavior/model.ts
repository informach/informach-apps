import { z } from "zod";
import { dataModelSchema, parseDataModels, resolveDataPath } from "../data/model";
import { type Animation, easingSchema, objectIdSchema, propertySchema } from "../model";
import { type ParameterContext, parameterKey } from "../parameters";
import type { SemanticMetadata } from "../visual/semantics";
import { isXmlText } from "../xmlText";

const id = z.string().regex(/^[a-z]+-[\w-]{1,100}$/);
const name = z.string().trim().min(1).max(120);
const fieldBase = { id, name };
export const inputSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    ...fieldBase,
    kind: z.literal("number"),
    initial: z.number().min(-1e7).max(1e7),
    min: z.number().min(-1e7).max(1e7),
    max: z.number().min(-1e7).max(1e7),
  }),
  z.strictObject({ ...fieldBase, kind: z.literal("boolean"), initial: z.boolean() }),
  z.strictObject({ ...fieldBase, kind: z.literal("string"), initial: z.string().max(10000) }),
  z.strictObject({
    ...fieldBase,
    kind: z.literal("color"),
    initial: z.string().regex(/^#[\da-f]{6}$/i),
  }),
  z.strictObject({
    ...fieldBase,
    kind: z.literal("enum"),
    initial: z.string().max(120),
    values: z.array(z.string().min(1).max(120)).min(1).max(100),
  }),
  z.strictObject({ ...fieldBase, kind: z.literal("trigger") }),
]);
export type BehaviorInput = z.infer<typeof inputSchema>;
export type InputValue = string | number | boolean;
const conditionSchema = z.discriminatedUnion("operator", [
  z.strictObject({ inputId: id, operator: z.literal("trigger") }),
  z.strictObject({
    inputId: id,
    operator: z.enum(["eq", "neq"]),
    value: z.union([z.number().min(-1e7).max(1e7), z.boolean(), z.string().max(10000)]),
  }),
  z.strictObject({
    inputId: id,
    operator: z.enum(["gt", "gte", "lt", "lte"]),
    value: z.number().min(-1e7).max(1e7),
  }),
]);
const stateBase = {
  id,
  name,
  x: z.number().min(-10000).max(10000),
  y: z.number().min(-10000).max(10000),
  speed: z.number().min(0.01).max(20),
};
export const stateSchema = z.discriminatedUnion("kind", [
  z.strictObject({ ...stateBase, kind: z.literal("base") }),
  z.strictObject({ ...stateBase, kind: z.literal("animation"), animationId: id }),
  z.strictObject({
    ...stateBase,
    kind: z.literal("blend1d"),
    inputId: id,
    points: z
      .array(z.strictObject({ at: z.number().min(-1e7).max(1e7), animationId: id }))
      .min(2)
      .max(32),
  }),
]);
export type BehaviorState = z.infer<typeof stateSchema>;
export const transitionSchema = z.strictObject({
  id,
  from: z.union([id, z.literal("*")]),
  to: id,
  conditions: z.array(conditionSchema).max(32),
  priority: z.number().int().min(-10000).max(10000),
  exitAt: z.number().min(0).max(1000).nullable(),
  duration: z.number().min(0).max(60),
  easing: easingSchema,
  interrupt: z.enum(["never", "immediate"]),
});
export type BehaviorTransition = z.infer<typeof transitionSchema>;
export const layerSchema = z.strictObject({
  id,
  name,
  entryStateId: id,
  weight: z.number().min(0).max(1),
  mode: z.enum(["override", "additive"]),
  targetIds: z.array(objectIdSchema).max(2000),
  properties: z.array(propertySchema).min(1).max(9),
  states: z.array(stateSchema).min(1).max(100),
  transitions: z.array(transitionSchema).max(1000),
});
export type BehaviorLayer = z.infer<typeof layerSchema>;
export const machineSchema = z.strictObject({
  id,
  name,
  layers: z.array(layerSchema).min(1).max(32),
});
export type BehaviorMachine = z.infer<typeof machineSchema>;
export const timelineEventSchema = z.strictObject({
  id,
  animationId: id,
  frame: z.number().min(0).max(360000),
  name,
  data: z
    .record(
      z.string().min(1).max(80),
      z.union([z.string().max(1000), z.number().min(-1e7).max(1e7), z.boolean(), z.null()]),
    )
    .refine((value) => Object.keys(value).length <= 20),
});
export type TimelineEvent = z.infer<typeof timelineEventSchema>;
export const bindingSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    id,
    kind: z.literal("parameter"),
    inputId: id,
    targetId: z.string().regex(/^(?:constraint|morph|solo|trim|joystick)-[\w-]{1,100}$/),
    property: z.enum([
      "strength",
      "progress",
      "weight",
      "activeIndex",
      "start",
      "end",
      "offset",
      "x",
      "y",
    ]),
    scale: z.number().min(-10000).max(10000),
    offset: z.number().min(-10000).max(10000),
    direction: z.enum(["one-way", "two-way"]),
  }),
  z.strictObject({
    id,
    kind: z.literal("transform"),
    inputId: id,
    targetId: objectIdSchema,
    property: propertySchema,
    scale: z.number().min(-10000).max(10000),
    offset: z.number().min(-10000).max(10000),
    direction: z.enum(["one-way", "two-way"]),
  }),
  z.strictObject({
    id,
    kind: z.literal("text"),
    inputId: id,
    targetId: objectIdSchema,
    direction: z.enum(["one-way", "two-way"]),
  }),
  z.strictObject({
    id,
    kind: z.literal("visibility"),
    inputId: id,
    targetId: objectIdSchema,
    invert: z.boolean(),
    direction: z.literal("one-way"),
  }),
  z.strictObject({
    id,
    kind: z.literal("color"),
    inputId: id,
    targetId: objectIdSchema,
    property: z.enum(["fill", "stroke"]),
    direction: z.enum(["one-way", "two-way"]),
  }),
  // The accessible name or description follows an input through a template
  // with one {valor} slot; it is announced when the object is a live region.
  z.strictObject({
    id,
    kind: z.literal("semantics"),
    inputId: id,
    targetId: objectIdSchema,
    property: z.enum(["label", "description"]),
    template: z
      .string()
      .min(1)
      .max(500)
      .refine(
        (value) => value.split("{valor}").length === 2 && isXmlText(value),
        "Modelo semântico requer um único {valor} e texto XML válido.",
      ),
    direction: z.literal("one-way"),
  }),
]);
export type BehaviorBinding = z.infer<typeof bindingSchema>;
/** Spoken form of an input value: Brazilian number format, sim/não for booleans. */
export function semanticValue(value: InputValue) {
  if (typeof value === "number")
    return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 6 }).format(value);
  if (typeof value === "boolean") return value ? "sim" : "não";
  return value;
}
const actionSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("set-input"),
    inputId: id,
    value: z.union([z.string().max(10000), z.number().min(-1e7).max(1e7), z.boolean()]),
  }),
  z.strictObject({ kind: z.literal("trigger"), inputId: id }),
  z.strictObject({
    kind: z.literal("pointer-coordinate"),
    inputId: id,
    axis: z.enum(["x", "y"]),
    normalized: z.boolean(),
  }),
]);
export const listenerSchema = z.strictObject({
  id,
  targetId: objectIdSchema.nullable(),
  event: z.enum(["enter", "leave", "activate", "move"]),
  actions: z.array(actionSchema).min(1).max(16),
});
export type BehaviorListener = z.infer<typeof listenerSchema>;
export const behaviorSchema = z.strictObject({
  version: z.union([z.literal(1), z.literal(2)]),
  inputs: z.array(inputSchema).max(100),
  machines: z.array(machineSchema).max(20),
  bindings: z.array(bindingSchema).max(1000),
  listeners: z.array(listenerSchema).max(1000),
  events: z.array(timelineEventSchema).max(10000),
  defaultMachineId: id.nullable(),
  data: dataModelSchema.optional(),
});
export type Behavior = z.infer<typeof behaviorSchema>;
export const emptyBehavior = (): Behavior => ({
  version: 1,
  inputs: [],
  machines: [],
  bindings: [],
  listeners: [],
  events: [],
  defaultMachineId: null,
});

export function validateInputValue(input: BehaviorInput, value: unknown): InputValue {
  if (input.kind === "trigger") throw new Error("Use trigger para disparar um gatilho.");
  if (input.kind === "number") {
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < input.min ||
      value > input.max
    )
      throw new Error("Valor numérico fora do intervalo do input.");
  } else if (input.kind === "boolean") {
    if (typeof value !== "boolean") throw new Error("Input requer booleano.");
  } else {
    if (typeof value !== "string" || value.length > 10000)
      throw new Error("Input requer texto válido.");
    if (input.kind === "color" && !/^#[\da-f]{6}$/i.test(value))
      throw new Error("Input requer cor #RRGGBB.");
    if (input.kind === "enum" && !input.values.includes(value))
      throw new Error("Opção não pertence ao input.");
  }
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean")
    throw new Error("Tipo de input inválido.");
  return value;
}

/** Validate references and aggregate cost before exposing authored behavior.
 * targets describe only this artboard (component internals have separate ownership). */
export function parseBehavior(
  input: unknown,
  targets: ReadonlyMap<string, { tag: string; semantics?: SemanticMetadata }>,
  animations: readonly Animation[],
  parameters?: ParameterContext,
): Behavior {
  const pending: unknown[] = [input];
  let work = 0,
    text = 0;
  while (pending.length) {
    const value = pending.pop();
    if (++work > 200000) throw new Error("Orçamento estrutural de lógica excedido.");
    if (typeof value === "string") text += value.length;
    else if (Array.isArray(value)) {
      if (value.length > 10000) throw new Error("Array de lógica excede o limite.");
      pending.push(...value);
    } else if (typeof value === "object" && value !== null) {
      const entries = Object.entries(value);
      if (entries.length > 1000) throw new Error("Objeto de lógica excede o limite.");
      for (const [key, child] of entries) {
        text += key.length;
        pending.push(child);
      }
    }
    if (text > 2000000) throw new Error("Orçamento textual de lógica excedido.");
  }
  // Avoid a legal per-layer product allocating millions of transitions in Zod.
  let states = 0,
    transitions = 0,
    layers = 0;
  if (
    typeof input === "object" &&
    input !== null &&
    "machines" in input &&
    Array.isArray(input.machines)
  ) {
    if (input.machines.length > 20) throw new Error("Orçamento de máquinas excedido.");
    for (const machine of input.machines)
      if (
        typeof machine === "object" &&
        machine !== null &&
        "layers" in machine &&
        Array.isArray(machine.layers)
      ) {
        layers += machine.layers.length;
        for (const layer of machine.layers)
          if (typeof layer === "object" && layer !== null) {
            if ("states" in layer && Array.isArray(layer.states)) states += layer.states.length;
            if ("transitions" in layer && Array.isArray(layer.transitions))
              transitions += layer.transitions.length;
          }
      }
  }
  if (states > 1000 || transitions > 5000 || layers > 64)
    throw new Error("Orçamento agregado de lógica excedido.");
  const behavior = behaviorSchema.parse(input, { jitless: true }),
    inputs = new Map(behavior.inputs.map((input) => [input.id, input])),
    clips = new Map(animations.map((clip) => [clip.id, clip]));
  const ids = new Set<string>();
  const unique = (id: string) => {
    if (ids.has(id)) throw new Error("IDs de lógica precisam ser únicos.");
    ids.add(id);
  };
  const requireInput = (id: string) => {
    const input = inputs.get(id);
    if (!input) throw new Error("Referência de input órfã.");
    return input;
  };
  const requireTarget = (id: string) => {
    const target = targets.get(id);
    if (!target) throw new Error("Referência de objeto órfã.");
    return target;
  };
  for (const input of behavior.inputs) {
    unique(input.id);
    if (input.kind === "number" && input.min > input.max)
      throw new Error("Intervalo de input invertido.");
    if (input.kind === "enum" && new Set(input.values).size !== input.values.length)
      throw new Error("Opções de input duplicadas.");
    if (input.kind !== "trigger") validateInputValue(input, input.initial);
  }
  for (const machine of behavior.machines) {
    unique(machine.id);
    for (const layer of machine.layers) {
      unique(layer.id);
      if (
        new Set(layer.targetIds).size !== layer.targetIds.length ||
        new Set(layer.properties).size !== layer.properties.length
      )
        throw new Error("Máscara de camada duplicada.");
      for (const target of layer.targetIds) requireTarget(target);
      if (layer.mode === "additive" && layer.weight > 0)
        for (const tracks of parameters?.clips.values() ?? [])
          for (const track of tracks)
            if (typeof track.clockId === "string") {
              const definition = parameters?.definitions.get(track.key);
              if (
                definition?.discrete &&
                (!layer.targetIds.length ||
                  definition.ownerIds.every((id) => layer.targetIds.includes(id)))
              )
                throw new Error("Canal solo discreto de componente não admite camada aditiva.");
            }
      const stateIds = new Set(layer.states.map((state) => state.id));
      if (!stateIds.has(layer.entryStateId)) throw new Error("Estado de entrada órfão.");
      for (const state of layer.states) {
        unique(state.id);
        const stateClips =
          state.kind === "animation"
            ? [state.animationId]
            : state.kind === "blend1d"
              ? state.points.map((point) => point.animationId)
              : [];
        for (const id of stateClips)
          if (!clips.has(id)) throw new Error("Animação de estado órfã.");
        if (layer.mode === "additive" && layer.weight > 0)
          for (const clipId of stateClips)
            for (const track of parameters?.clips.get(clipId) ?? []) {
              const definition = parameters?.definitions.get(track.key);
              if (
                definition?.discrete &&
                (!layer.targetIds.length ||
                  definition.ownerIds.every((id) => layer.targetIds.includes(id)))
              )
                throw new Error("Canal solo discreto não admite camada aditiva.");
            }
        if (state.kind === "blend1d") {
          if (requireInput(state.inputId).kind !== "number")
            throw new Error("Blend 1D requer input numérico.");
          if (
            state.points.some(
              (point, index) => index > 0 && point.at <= (state.points[index - 1]?.at ?? point.at),
            )
          )
            throw new Error("Pontos de blend precisam estar em ordem crescente sem repetição.");
        }
      }
      for (const transition of layer.transitions) {
        unique(transition.id);
        if (
          (transition.from !== "*" && !stateIds.has(transition.from)) ||
          !stateIds.has(transition.to)
        )
          throw new Error("Transição referencia estado órfão.");
        for (const condition of transition.conditions) {
          const input = requireInput(condition.inputId);
          if (condition.operator === "trigger") {
            if (input.kind !== "trigger") throw new Error("Condição trigger requer gatilho.");
          } else {
            validateInputValue(input, condition.value);
            if (!["eq", "neq"].includes(condition.operator) && input.kind !== "number")
              throw new Error("Comparação de ordem requer número.");
          }
        }
      }
    }
  }
  if (
    (behavior.machines.length === 0) !== (behavior.defaultMachineId === null) ||
    (behavior.defaultMachineId !== null &&
      !behavior.machines.some((machine) => machine.id === behavior.defaultMachineId))
  )
    throw new Error("Máquina inicial inválida.");
  const destinations = new Set<string>();
  for (const binding of behavior.bindings) {
    unique(binding.id);
    if (binding.kind === "parameter") {
      const definition = parameters?.definitions.get(
          parameterKey([], binding.targetId, binding.property),
        ),
        input = requireInput(binding.inputId);
      if (behavior.version !== 2 || !definition || input.kind !== "number")
        throw new Error(
          "Binding de parâmetro requer lógica v2, destino existente e input numérico.",
        );
      if (binding.direction === "two-way" && (binding.scale === 0 || definition.discrete))
        throw new Error("Parâmetro bidirecional requer conversão contínua invertível.");
      const destination = parameterKey([], binding.targetId, binding.property);
      if (destinations.has(destination)) throw new Error("Bindings conflitantes no mesmo destino.");
      destinations.add(destination);
      continue;
    }
    if (binding.kind === "semantics") {
      const input = requireInput(binding.inputId),
        semantics = requireTarget(binding.targetId).semantics;
      if (input.kind === "trigger" || input.kind === "color")
        throw new Error("Binding semântico requer input de texto, número, booleano ou lista.");
      if (
        !semantics ||
        semantics.kind === "decorative" ||
        (binding.property === "description" && !semantics.description)
      )
        throw new Error(
          "Binding semântico requer objeto com nome acessível (e descrição, para a descrição).",
        );
      const destination = `${binding.targetId}:semantics:${binding.property}`;
      if (destinations.has(destination)) throw new Error("Bindings conflitantes no mesmo destino.");
      destinations.add(destination);
      continue;
    }
    const input = requireInput(binding.inputId),
      target = requireTarget(binding.targetId),
      kind =
        binding.kind === "transform"
          ? "number"
          : binding.kind === "visibility"
            ? "boolean"
            : binding.kind === "color"
              ? "color"
              : "string";
    if (input.kind !== kind && !(binding.kind === "text" && input.kind === "enum"))
      throw new Error("Tipos incompatíveis no binding.");
    if (binding.kind === "text" && target.tag !== "text")
      throw new Error("Binding textual requer objeto de texto.");
    if (binding.kind === "color" && target.tag === "image")
      throw new Error("Imagens raster não aceitam bindings de preenchimento/contorno vetorial.");
    if (binding.kind === "transform" && binding.direction === "two-way" && binding.scale === 0)
      throw new Error("Conversão bidirecional precisa ser invertível.");
    const destination = `${binding.targetId}:${binding.kind}:${"property" in binding ? binding.property : ""}`;
    if (destinations.has(destination)) throw new Error("Bindings conflitantes no mesmo destino.");
    destinations.add(destination);
  }
  for (const listener of behavior.listeners) {
    unique(listener.id);
    if (listener.targetId !== null) requireTarget(listener.targetId);
    for (const action of listener.actions) {
      const input = requireInput(action.inputId);
      if (action.kind === "set-input") validateInputValue(input, action.value);
      if (action.kind === "trigger" && input.kind !== "trigger")
        throw new Error("Listener requer input trigger.");
      if (action.kind === "pointer-coordinate" && input.kind !== "number")
        throw new Error("Coordenada requer input numérico.");
    }
  }
  for (const event of behavior.events) {
    unique(event.id);
    const clip = clips.get(event.animationId);
    if (!clip || event.frame > clip.frames) throw new Error("Evento fora da animação/prancheta.");
  }
  if (behavior.data) {
    const data = parseDataModels(behavior.data);
    for (const link of data.document.links) {
      const input = requireInput(link.inputId),
        leaf = resolveDataPath(data, data.initial, link.instanceId, link.path),
        field = leaf.field;
      if (field.kind !== input.kind) throw new Error("Link requer input e campo do mesmo tipo.");
      if (
        field.kind === "number" &&
        input.kind === "number" &&
        (field.min < input.min ||
          field.max > input.max ||
          (link.direction === "two-way" && (field.min !== input.min || field.max !== input.max)))
      )
        throw new Error("Intervalos incompatíveis no link de dados.");
      if (
        field.kind === "enum" &&
        input.kind === "enum" &&
        (field.values.some((value) => !input.values.includes(value)) ||
          (link.direction === "two-way" &&
            input.values.some((value) => !field.values.includes(value))))
      )
        throw new Error("Opções incompatíveis no link de dados.");
      validateInputValue(input, leaf.value);
      if (
        link.direction === "one-way" &&
        (behavior.listeners.some((listener) =>
          listener.actions.some((action) => action.inputId === input.id),
        ) ||
          behavior.bindings.some(
            (binding) => binding.inputId === input.id && binding.direction === "two-way",
          ))
      )
        throw new Error(
          "Input controlado por modelo somente leitura não admite listener de escrita/binding bidirecional.",
        );
    }
  }
  return behavior;
}
