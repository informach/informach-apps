import {
  type DataContext,
  type DataModelDocument,
  type DataRecord,
  defaultDataRecord,
  isDataRecord,
  parseDataModels,
} from "@informach/edi-motion/data";

/** Definition edits explicitly add defaults/remove deleted fields, while
 * preserving every retained value and stable list identity. No type coercion. */
export function reconcileDataDefinitions(next: DataModelDocument): DataModelDocument {
  const context = parseDataModels({ ...next, context: undefined, instances: [], links: [] });
  let work = 0;
  const record = (modelId: string, source: unknown): DataRecord => {
    const model = context.models.get(modelId);
    if (!model || !isDataRecord(source))
      throw new Error("Instância incompatível com o modelo editado.");
    const defaults = defaultDataRecord(context, modelId);
    return Object.fromEntries(
      model.fields.map((field) => {
        if (++work > 20000) throw new Error("Orçamento de migração dos dados excedido.");
        const value = source[field.id];
        if (value === undefined) {
          const initial = defaults[field.id];
          if (initial === undefined) throw new Error("Default de campo ausente.");
          return [field.id, initial];
        }
        if (field.kind === "model") return [field.id, record(field.modelId, value)];
        if (field.kind === "list") {
          if (!Array.isArray(value)) throw new Error("Lista incompatível com o modelo editado.");
          return [
            field.id,
            value.map((item) => ({ id: item.id, value: record(field.modelId, item.value) })),
          ];
        }
        return [field.id, value];
      }),
    );
  };
  const result = {
    ...next,
    instances: next.instances.map((instance) => ({
      ...instance,
      value: record(instance.modelId, instance.value),
    })),
  };
  return parseDataModels(result).document;
}
export function dataLeafPaths(
  context: DataContext,
  instanceId: string,
): { path: string[]; label: string }[] {
  const instance = context.document.instances.find((instance) => instance.id === instanceId),
    value = context.initial.get(instanceId),
    result: { path: string[]; label: string }[] = [];
  if (!instance || !value) return result;
  let work = 0;
  const walk = (modelId: string, value: DataRecord, path: string[], labels: string[]) => {
    const model = context.models.get(modelId);
    if (!model) throw new Error("Modelo ausente.");
    for (const field of model.fields) {
      if (++work > 20000) throw new Error("Orçamento de caminhos excedido.");
      const next = [...path, field.id],
        names = [...labels, field.name],
        raw = value[field.id];
      if (field.kind === "model" && isDataRecord(raw)) walk(field.modelId, raw, next, names);
      else if (field.kind === "list" && Array.isArray(raw))
        for (const item of raw)
          walk(field.modelId, item.value, [...next, item.id], [...names, item.id]);
      else if (field.kind !== "model" && field.kind !== "list")
        result.push({ path: next, label: names.join(" / ") });
    }
  };
  walk(instance.modelId, value, [], []);
  return result;
}
