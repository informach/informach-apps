import {
  type DataChange,
  type DataContext,
  type DataRecord,
  isDataRecord,
} from "@informach/edi-motion/data";
import { useState } from "react";

interface Props {
  context: DataContext;
  instanceId: string;
  modelId: string;
  value: DataRecord;
  path?: string[];
  focusPath?: string[];
  change(changes: DataChange[]): void;
}
export function DataRecordFields({
  context,
  instanceId,
  modelId,
  value,
  path = [],
  focusPath,
  change,
}: Props) {
  const model = context.models.get(modelId);
  if (!model) return <p role="alert">Modelo ausente.</p>;
  return (
    <>
      {model.fields.map((field) => {
        const current = value[field.id],
          next = [...path, field.id];
        return (
          <div className="behavior-data-row" key={field.id}>
            <small>
              {field.name} · {field.kind}
            </small>
            {field.kind === "model" && isDataRecord(current) ? (
              <NestedRecord
                context={context}
                instanceId={instanceId}
                modelId={field.modelId}
                value={current}
                path={next}
                focusPath={focusPath}
                change={change}
              />
            ) : field.kind === "list" && Array.isArray(current) ? (
              <ListFields
                context={context}
                instanceId={instanceId}
                modelId={field.modelId}
                value={current}
                path={next}
                focusPath={focusPath}
                change={change}
              />
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget),
                    raw = data.get("value");
                  change([
                    {
                      operation: "set",
                      instanceId,
                      path: next,
                      value:
                        field.kind === "boolean"
                          ? raw === "on"
                          : field.kind === "number"
                            ? typeof raw === "string" && raw.trim()
                              ? Number(raw)
                              : Number.NaN
                            : raw,
                    },
                  ]);
                }}
              >
                {field.kind === "boolean" ? (
                  <label className="check-row">
                    <input name="value" type="checkbox" defaultChecked={current === true} />
                    {field.name}
                  </label>
                ) : field.kind === "enum" ? (
                  <label className="scene-field">
                    {field.name}
                    <select
                      name="value"
                      aria-label={field.name}
                      defaultValue={typeof current === "string" ? current : ""}
                    >
                      {field.values.map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label className="scene-field">
                    {field.name}
                    <input
                      name="value"
                      aria-label={field.name}
                      autoComplete="off"
                      type={
                        field.kind === "number"
                          ? "number"
                          : field.kind === "color"
                            ? "color"
                            : "text"
                      }
                      step="any"
                      min={field.kind === "number" ? field.min : undefined}
                      max={field.kind === "number" ? field.max : undefined}
                      maxLength={10000}
                      required={field.kind === "number"}
                      defaultValue={
                        typeof current === "string" || typeof current === "number" ? current : ""
                      }
                    />
                  </label>
                )}
                <button type="submit">Aplicar {field.name}</button>
              </form>
            )}
          </div>
        );
      })}
    </>
  );
}
function NestedRecord(props: Props) {
  const [open, setOpen] = useState(
    () =>
      !!props.focusPath?.length &&
      (props.path ?? []).every((value, index) => props.focusPath?.[index] === value),
  );
  return (
    <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Editar campos compostos</summary>
      {open && <DataRecordFields {...props} />}
    </details>
  );
}
function ListFields({
  value,
  ...props
}: Omit<Props, "value"> & { value: { id: string; value: DataRecord }[] }) {
  const [page, setPage] = useState(0),
    current = Math.min(page, Math.max(0, Math.ceil(value.length / 10) - 1)),
    path = props.path ?? [];
  return (
    <div>
      <p>{value.length} itens · identidades estáveis</p>
      <button
        type="button"
        onClick={() =>
          props.change([
            {
              operation: "insert",
              instanceId: props.instanceId,
              path,
              id: `item-${crypto.randomUUID()}`,
              index: value.length,
            },
          ])
        }
      >
        Adicionar item à lista
      </button>
      {value.slice(current * 10, current * 10 + 10).map((item, offset) => (
        <div key={item.id}>
          <small>{item.id}</small>
          <NestedRecord {...props} path={[...path, item.id]} value={item.value} />
          <div className="scene-tools">
            <button
              type="button"
              disabled={current * 10 + offset === 0}
              aria-label={`Subir ${item.id}`}
              onClick={() =>
                props.change([
                  {
                    operation: "move",
                    instanceId: props.instanceId,
                    path,
                    id: item.id,
                    index: current * 10 + offset - 1,
                  },
                ])
              }
            >
              ↑
            </button>
            <button
              type="button"
              disabled={current * 10 + offset === value.length - 1}
              aria-label={`Descer ${item.id}`}
              onClick={() =>
                props.change([
                  {
                    operation: "move",
                    instanceId: props.instanceId,
                    path,
                    id: item.id,
                    index: current * 10 + offset + 1,
                  },
                ])
              }
            >
              ↓
            </button>
            <button
              type="button"
              aria-label={`Excluir item ${item.id}`}
              onClick={() =>
                props.change([
                  { operation: "remove", instanceId: props.instanceId, path, id: item.id },
                ])
              }
            >
              Excluir item e valores
            </button>
          </div>
        </div>
      ))}
      <div className="scene-tools">
        <button type="button" disabled={current === 0} onClick={() => setPage(current - 1)}>
          Itens anteriores
        </button>
        <span>Página {current + 1}</span>
        <button
          type="button"
          disabled={(current + 1) * 10 >= value.length}
          onClick={() => setPage(current + 1)}
        >
          Próximos itens
        </button>
      </div>
    </div>
  );
}
