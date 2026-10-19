import { z } from "zod";

const id = z.string().regex(/^[a-z]+-[\w-]{1,100}$/),
  name = z.string().trim().min(1).max(120);
const base = { id, name };
export const dataFieldSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    ...base,
    kind: z.literal("number"),
    min: z.number().min(-1e7).max(1e7),
    max: z.number().min(-1e7).max(1e7),
  }),
  z.strictObject({ ...base, kind: z.enum(["string", "boolean", "color"]) }),
  z.strictObject({
    ...base,
    kind: z.literal("enum"),
    values: z.array(z.string().min(1).max(120)).min(1).max(100),
  }),
  z.strictObject({ ...base, kind: z.enum(["model", "list"]), modelId: id }),
]);
export type DataField = z.infer<typeof dataFieldSchema>;
export type DataValue = string | number | boolean | DataRecord | DataList;
export interface DataRecord {
  [fieldId: string]: DataValue;
}
export type DataList = { id: string; value: DataRecord }[];
export const dataModelSchema = z.strictObject({
  version: z.literal(1),
  models: z.array(z.strictObject({ ...base, fields: z.array(dataFieldSchema).max(100) })).max(100),
  instances: z.array(z.strictObject({ ...base, modelId: id, value: z.unknown() })).max(100),
  links: z
    .array(
      z.strictObject({
        id,
        instanceId: id,
        path: z.array(id).min(1).max(16),
        inputId: id,
        direction: z.enum(["one-way", "two-way"]),
      }),
    )
    .max(100),
});
export type DataModelDocument = z.infer<typeof dataModelSchema>;
export interface DataContext {
  document: DataModelDocument;
  models: ReadonlyMap<string, DataModelDocument["models"][number]>;
  initial: ReadonlyMap<string, DataRecord>;
}
export const emptyDataModels = (): DataModelDocument => ({
  version: 1,
  models: [],
  instances: [],
  links: [],
});
export function isDataRecord(value: unknown): value is DataRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    [null, Object.prototype].includes(Object.getPrototypeOf(value))
  );
}
const forbidden = new Set(["__proto__", "prototype", "constructor"]);
/** Bound work/depth before recursive schema/value validation, including cycles,
 * sparse arrays, unknown fields and forbidden prototype-oriented keys. */
function inspect(input: unknown) {
  let work = 0,
    text = 0;
  const active = new Set<object>();
  function visit(value: unknown, depth: number) {
    if (++work > 100000 || depth > 40) throw new Error("Orçamento estrutural de dados excedido.");
    if (typeof value === "string") text += value.length;
    if (typeof value === "object" && value !== null) {
      if (active.has(value)) throw new Error("Dados cíclicos não são persistíveis.");
      if (
        Array.isArray(value)
          ? value.length > 20000
          : !isDataRecord(value) || Object.keys(value).length > 1000
      )
        throw new Error("Estrutura de dados inválida ou excessiva.");
      active.add(value);
      for (const [key, child] of Object.entries(value)) {
        if (forbidden.has(key)) throw new Error("Chave de dados reservada.");
        text += key.length;
        visit(child, depth + 1);
      }
      active.delete(value);
    }
    if (text > 1000000) throw new Error("Orçamento textual de dados excedido.");
  }
  visit(input, 0);
}
export function parseDataModels(input: unknown): DataContext {
  inspect(input);
  const document = dataModelSchema.parse(input, { jitless: true }),
    models = new Map(document.models.map((model) => [model.id, model])),
    ids = new Set<string>();
  const unique = (value: string) => {
    if (ids.has(value)) throw new Error("IDs de dados precisam ser únicos.");
    ids.add(value);
  };
  let fields = 0;
  for (const model of document.models) {
    unique(model.id);
    fields += model.fields.length;
    for (const field of model.fields) {
      unique(field.id);
      if (field.kind === "number" && field.min > field.max)
        throw new Error("Intervalo numérico do campo invertido.");
      if (field.kind === "enum" && new Set(field.values).size !== field.values.length)
        throw new Error("Opções de campo duplicadas.");
      if ((field.kind === "model" || field.kind === "list") && !models.has(field.modelId))
        throw new Error("Modelo composto órfão.");
    }
  }
  if (fields > 1000) throw new Error("Orçamento agregado de campos excedido.");
  const depths = new Map<string, number>();
  const depth = (modelId: string, path: Set<string>): number => {
    if (path.has(modelId)) throw new Error("Modelos cíclicos não são permitidos.");
    const cached = depths.get(modelId);
    if (cached !== undefined) return cached;
    const model = models.get(modelId);
    if (!model) throw new Error("Modelo ausente.");
    const next = new Set([...path, modelId]);
    let value = 1;
    for (const field of model.fields)
      if (field.kind === "model" || field.kind === "list")
        value = Math.max(value, 1 + depth(field.modelId, next));
    if (value > 8) throw new Error("Modelos profundos não são permitidos.");
    depths.set(modelId, value);
    return value;
  };
  for (const model of document.models) depth(model.id, new Set());
  const context: DataContext = { document, models, initial: new Map() };
  const initial = new Map<string, DataRecord>();
  for (const instance of document.instances) {
    unique(instance.id);
    initial.set(instance.id, validateDataRecord(context, instance.modelId, instance.value));
  }
  validateDataInstances(context, initial);
  for (const link of document.links) {
    unique(link.id);
    if (!initial.has(link.instanceId)) throw new Error("Instância vinculada órfã.");
    const leaf = resolveDataPath(context, initial, link.instanceId, link.path);
    if (leaf.field.kind === "model" || leaf.field.kind === "list")
      throw new Error("Input requer campo escalar, não lista/modelo.");
  }
  const destinations = new Set<string>(),
    sources = new Set<string>();
  for (const link of document.links) {
    const key = JSON.stringify([link.instanceId, link.path]);
    if (destinations.has(link.inputId) || (link.direction === "two-way" && sources.has(key)))
      throw new Error("Links de dados conflitantes.");
    destinations.add(link.inputId);
    if (link.direction === "two-way") sources.add(key);
  }
  return { ...context, initial };
}
export function validateDataRecord(
  context: Pick<DataContext, "models">,
  modelId: string,
  input: unknown,
): DataRecord {
  let work = 0,
    listItems = 0;
  function record(modelId: string, value: unknown, depth: number): DataRecord {
    const model = context.models.get(modelId);
    if (
      !model ||
      !isDataRecord(value) ||
      Object.keys(value).length !== model.fields.length ||
      depth > 8
    )
      throw new Error("Instância não corresponde ao modelo.");
    return Object.fromEntries(
      model.fields.map((field) => {
        if (++work > 20000 || !Object.hasOwn(value, field.id))
          throw new Error("Campo ausente ou orçamento de valores excedido.");
        const raw = value[field.id];
        let clean: DataValue;
        if (field.kind === "model") clean = record(field.modelId, raw, depth + 1);
        else if (field.kind === "list") {
          if (!Array.isArray(raw) || raw.length > 1000)
            throw new Error("Lista requer até 1000 itens.");
          const ids = new Set<string>();
          listItems += raw.length;
          if (listItems > 4000) throw new Error("Orçamento agregado de itens de lista excedido.");
          clean = raw.map((item) => {
            if (
              !isDataRecord(item) ||
              typeof item.id !== "string" ||
              !id.safeParse(item.id).success ||
              ids.has(item.id) ||
              Object.keys(item).length !== 2 ||
              !Object.hasOwn(item, "value")
            )
              throw new Error("Item de lista requer identidade única e valor.");
            ids.add(item.id);
            return { id: item.id, value: record(field.modelId, item.value, depth + 1) };
          });
        } else if (field.kind === "number") {
          if (
            typeof raw !== "number" ||
            !Number.isFinite(raw) ||
            raw < field.min ||
            raw > field.max
          )
            throw new Error("Número de campo fora do intervalo.");
          clean = raw;
        } else if (field.kind === "boolean") {
          if (typeof raw !== "boolean") throw new Error("Campo requer booleano.");
          clean = raw;
        } else {
          if (
            typeof raw !== "string" ||
            raw.length > 10000 ||
            (field.kind === "color" && !/^#[\da-f]{6}$/i.test(raw)) ||
            (field.kind === "enum" && !field.values.includes(raw))
          )
            throw new Error("Texto/cor/opção de campo inválido.");
          clean = raw;
        }
        return [field.id, clean];
      }),
    );
  }
  return record(modelId, input, 0);
}
export function validateDataInstances(
  context: DataContext,
  source: ReadonlyMap<string, DataRecord>,
): Map<string, DataRecord> {
  inspect([...source]);
  if (source.size !== context.document.instances.length) throw new Error("Instâncias incompletas.");
  const result = new Map<string, DataRecord>();
  for (const instance of context.document.instances)
    result.set(instance.id, validateDataRecord(context, instance.modelId, source.get(instance.id)));
  // Stable IDs, never array indices: deleting a linked item is an explicit error.
  for (const link of context.document.links)
    resolveDataPath(context, result, link.instanceId, link.path);
  return result;
}
export function resolveDataPath(
  context: DataContext,
  values: ReadonlyMap<string, DataRecord>,
  instanceId: string,
  path: readonly string[],
): { owner: DataRecord; field: DataField; value: DataValue } {
  const instance = context.document.instances.find((instance) => instance.id === instanceId);
  let model = instance ? context.models.get(instance.modelId) : undefined,
    value = values.get(instanceId);
  if (!model || !value || path.length < 1 || path.length > 16)
    throw new Error("Caminho de dados inválido.");
  for (let index = 0; index < path.length; index++) {
    const field = model.fields.find((field) => field.id === path[index]);
    if (!field) throw new Error("Campo de caminho órfão.");
    if (!value) throw new Error("Valor de caminho ausente.");
    const raw: DataValue | undefined = value[field.id];
    if (raw === undefined) throw new Error("Valor de caminho ausente.");
    if (index === path.length - 1) return { owner: value, field, value: raw };
    if (field.kind === "model") {
      if (!isDataRecord(raw)) throw new Error("Modelo composto inválido.");
      value = raw;
      model = context.models.get(field.modelId);
    } else if (field.kind === "list") {
      if (!Array.isArray(raw)) throw new Error("Lista inválida.");
      const item: DataList[number] | undefined = raw.find((item) => item.id === path[index + 1]);
      index++;
      if (!item) throw new Error("Item vinculado não existe na lista.");
      value = item.value;
      model = context.models.get(field.modelId);
    } else throw new Error("Caminho atravessa campo escalar.");
    if (!model) throw new Error("Modelo de caminho órfão.");
  }
  throw new Error("Caminho deve terminar em um campo.");
}
export function defaultDataRecord(
  context: Pick<DataContext, "models">,
  modelId: string,
  depth = 0,
): DataRecord {
  let work = 0;
  const create = (modelId: string, depth: number): DataRecord => {
    if (++work > 20000) throw new Error("Orçamento de valores padrão excedido.");
    const model = context.models.get(modelId);
    if (!model || depth > 8) throw new Error("Modelo inválido/profundo.");
    return Object.fromEntries(
      model.fields.map((field) => {
        if (++work > 20000) throw new Error("Orçamento de valores padrão excedido.");
        return [
          field.id,
          field.kind === "model"
            ? create(field.modelId, depth + 1)
            : field.kind === "list"
              ? []
              : field.kind === "number"
                ? Math.max(field.min, Math.min(field.max, 0))
                : field.kind === "boolean"
                  ? false
                  : field.kind === "color"
                    ? "#000000"
                    : field.kind === "enum"
                      ? (field.values[0] ?? "")
                      : "",
        ];
      }),
    );
  };
  return create(modelId, depth);
}
