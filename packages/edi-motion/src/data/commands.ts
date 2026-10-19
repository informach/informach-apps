import { z } from "zod";
import {
  type DataContext,
  type DataRecord,
  defaultDataRecord,
  resolveDataPath,
  validateDataInstances,
} from "./model";

const id = z.string().regex(/^[a-z]+-[\w-]{1,100}$/),
  path = z.array(id).min(1).max(16),
  base = { instanceId: id, path };
export const dataChangeSchema = z.discriminatedUnion("operation", [
  z.strictObject({ ...base, operation: z.literal("set"), value: z.unknown() }),
  z.strictObject({
    ...base,
    operation: z.literal("insert"),
    id,
    index: z.number().int().min(0).max(1000),
    value: z.unknown().optional(),
  }),
  z.strictObject({ ...base, operation: z.literal("remove"), id }),
  z.strictObject({
    ...base,
    operation: z.literal("move"),
    id,
    index: z.number().int().min(0).max(1000),
  }),
]);
export type DataChange = z.infer<typeof dataChangeSchema>;
export function applyDataChanges(
  context: DataContext,
  source: ReadonlyMap<string, DataRecord>,
  raw: unknown,
): Map<string, DataRecord> {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 100)
    throw new Error("Requer 1–100 mudanças de dados.");
  const changes = z.array(dataChangeSchema).min(1).max(100).parse(raw, { jitless: true }),
    result = structuredClone(new Map(source));
  for (const change of changes) {
    const target = resolveDataPath(context, result, change.instanceId, change.path);
    if (change.operation === "set") {
      // Validate replacement before introducing unknown data into the typed store.
      const instance = context.document.instances.find(
        (instance) => instance.id === change.instanceId,
      );
      if (!instance) throw new Error("Instância ausente.");
      const candidate: Record<string, unknown> = {
        ...target.owner,
        [target.field.id]: change.value,
      };
      const ownerModel = [...context.models.values()].find((model) =>
        model.fields.some((field) => field.id === target.field.id),
      );
      if (!ownerModel) throw new Error("Modelo do campo ausente.");
      const contextValues = validateDataRecordForChange(context, ownerModel.id, candidate);
      const clean = contextValues[target.field.id];
      if (clean === undefined) throw new Error("Campo ausente.");
      target.owner[target.field.id] = clean;
    } else {
      if (target.field.kind !== "list" || !Array.isArray(target.value))
        throw new Error("Operação requer lista.");
      const list = target.value,
        index = list.findIndex((item) => item.id === change.id);
      if (change.operation === "insert") {
        if (index >= 0 || change.index > list.length || list.length >= 1000)
          throw new Error("Inserção de lista inválida.");
        const value =
          change.value === undefined
            ? defaultDataRecord(context, target.field.modelId)
            : validateDataRecordForChange(context, target.field.modelId, change.value);
        list.splice(change.index, 0, { id: change.id, value });
      } else {
        if (index < 0) throw new Error("Item de lista ausente.");
        const item = list.splice(index, 1)[0];
        if (!item) throw new Error("Item de lista ausente.");
        if (change.operation === "move") {
          if (change.index > list.length) throw new Error("Destino da lista inválido.");
          list.splice(change.index, 0, item);
        }
      }
    }
  }
  return validateDataInstances(context, result);
}

import { validateDataRecord as validateDataRecordForChange } from "./model";
