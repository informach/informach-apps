import { type Behavior, emptyBehavior, formulaShape } from "@informach/edi-motion/behavior";
import { z } from "zod";

export const behaviorCollectionSchema = z.enum([
  "inputs",
  "machines",
  "layers",
  "states",
  "transitions",
  "bindings",
  "listeners",
  "events",
  "models",
  "instances",
  "dataLinks",
  "formulas",
]);
export const behaviorReadSchema = z.strictObject({
  collection: behaviorCollectionSchema,
  machineId: z.string().min(1).max(120).optional(),
  layerId: z.string().min(1).max(120).optional(),
  offset: z.number().int().min(0).max(10000).default(0),
  limit: z.number().int().min(1).max(20).default(20),
});
export const behaviorValueSchema = behaviorReadSchema.omit({ offset: true, limit: true }).extend({
  id: z.string().min(1).max(120),
  offset: z.number().int().min(0).max(8000000).default(0),
});
type Request = Pick<z.infer<typeof behaviorReadSchema>, "collection" | "machineId" | "layerId">;
function collection(behavior: Behavior, request: Request) {
  if (request.collection === "models") return behavior.data?.models ?? [];
  if (request.collection === "instances") return behavior.data?.instances ?? [];
  if (request.collection === "dataLinks") return behavior.data?.links ?? [];
  if (request.collection === "formulas") return behavior.formulas ?? [];
  if (
    request.collection === "inputs" ||
    request.collection === "machines" ||
    request.collection === "bindings" ||
    request.collection === "listeners" ||
    request.collection === "events"
  )
    return behavior[request.collection];
  const machine = behavior.machines.find((machine) => machine.id === request.machineId);
  if (!machine) throw new Error("Informe uma máquina válida para esta coleção.");
  if (request.collection === "layers") return machine.layers;
  const layer = machine.layers.find((layer) => layer.id === request.layerId);
  if (!layer) throw new Error("Informe uma camada válida para esta coleção.");
  return request.collection === "states" ? layer.states : layer.transitions;
}
export function inspectBehavior(value: Behavior | undefined, rawRequest: unknown) {
  const request = behaviorReadSchema.parse(rawRequest),
    behavior = value ?? emptyBehavior(),
    list = collection(behavior, request);
  return {
    version: behavior.version,
    defaultMachineId: behavior.defaultMachineId,
    // Replacing behavior without this would silently unbind the artboard's model.
    dataContext: behavior.data?.context ?? null,
    collection: request.collection,
    total: list.length,
    offset: request.offset,
    nextOffset:
      request.offset + request.limit < list.length ? request.offset + request.limit : null,
    items: list.slice(request.offset, request.offset + request.limit).map((item) => ({
      id: item.id,
      ...("name" in item ? { name: item.name } : {}),
      ...("kind" in item ? { kind: item.kind } : {}),
      ...("layers" in item ? { layers: item.layers.length } : {}),
      ...("states" in item
        ? {
            states: item.states.length,
            transitions: item.transitions.length,
            entryStateId: item.entryStateId,
          }
        : {}),
      ...("from" in item
        ? {
            from: item.from,
            to: item.to,
            conditions: item.conditions.length,
            duration: item.duration,
          }
        : {}),
      ...("targetId" in item ? { targetId: item.targetId } : {}),
      ...("expression" in item
        ? { inputId: item.inputId, nodes: formulaShape(item.expression).nodes }
        : {}),
      ...("frame" in item ? { frame: item.frame, animationId: item.animationId } : {}),
      ...("initial" in item
        ? {
            initial:
              typeof item.initial === "string"
                ? {
                    preview: item.initial.slice(0, 512),
                    length: item.initial.length,
                    truncated: item.initial.length > 512,
                  }
                : item.initial,
          }
        : {}),
    })),
  };
}
export function inspectBehaviorValue(value: Behavior | undefined, rawRequest: unknown) {
  const request = behaviorValueSchema.parse(rawRequest),
    item = collection(value ?? emptyBehavior(), request).find((item) => item.id === request.id);
  if (!item) throw new Error("Entidade de lógica não encontrada.");
  const serialized = JSON.stringify(item);
  if (request.offset > serialized.length)
    throw new Error("Offset além do valor atual. Inspecione novamente.");
  return {
    id: item.id,
    encoding: "json" as const,
    totalCharacters: serialized.length,
    offset: request.offset,
    value: serialized.slice(request.offset, request.offset + 20000),
    nextOffset: request.offset + 20000 < serialized.length ? request.offset + 20000 : null,
  };
}
