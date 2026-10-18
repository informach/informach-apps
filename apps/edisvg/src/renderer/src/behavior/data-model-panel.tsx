import type { Behavior } from "@informach/edi-motion/behavior";
import {
  applyDataChanges,
  type DataModelDocument,
  dataFieldSchema,
  defaultDataRecord,
  emptyDataModels,
  parseDataModels,
} from "@informach/edi-motion/data";
import { useMemo, useState } from "react";
import { dataLeafPaths, reconcileDataDefinitions } from "./data-model-editing";
import { DataRecordFields } from "./data-record-fields";
import { formText } from "./forms";

export interface ModelFocus {
  modelId?: string;
  instanceId?: string;
  open?: boolean;
  editorPath?: string[];
}
interface Props {
  behavior: Behavior;
  focus?: ModelFocus;
  focusChanged(value: ModelFocus): void;
  save(value: DataModelDocument): void;
  report(error: unknown): void;
}
export function DataModelPanel({ behavior, focus, focusChanged, save, report }: Props) {
  const data = useMemo(() => behavior.data ?? emptyDataModels(), [behavior.data]),
    context = useMemo(() => parseDataModels(data), [data]),
    selected = focus?.modelId ?? data.models[0]?.id ?? "",
    setSelected = (modelId: string) => focusChanged({ ...focus, modelId }),
    instanceId = focus?.instanceId ?? data.instances[0]?.id ?? "",
    setInstanceId = (instanceId: string) => focusChanged({ ...focus, instanceId, editorPath: [] }),
    [kind, setKind] = useState("string"),
    [filter, setFilter] = useState(""),
    model = data.models.find((model) => model.id === selected),
    instance = data.instances.find((instance) => instance.id === instanceId),
    value = context.initial.get(instanceId),
    allPaths = useMemo(() => dataLeafPaths(context, instanceId), [context, instanceId]),
    paths = allPaths.filter((value) =>
      value.label.toLocaleLowerCase("pt-BR").includes(filter.toLocaleLowerCase("pt-BR")),
    ),
    [linkPath, setLinkPath] = useState("");
  const edit = (change: (draft: DataModelDocument) => void, definitions = false) => {
    try {
      const draft = structuredClone(data);
      change(draft);
      save(definitions ? reconcileDataDefinitions(draft) : draft);
    } catch (error) {
      report(error);
    }
  };
  return (
    <details
      open={focus?.open ?? false}
      onToggle={(event) => {
        if (event.currentTarget.open !== (focus?.open ?? false))
          focusChanged({ ...focus, open: event.currentTarget.open });
      }}
    >
      <summary>Modelos de dados compostos</summary>
      <p className="micro">
        Modelos, instâncias e listas tipados. Valores retidos não são convertidos; novos campos
        recebem defaults e excluir campo remove seus valores. Referências em uso impedem exclusão. O
        runtime usa sessões independentes.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          edit((draft) =>
            draft.models.push({
              id: `model-${crypto.randomUUID()}`,
              name: formText(form, "name"),
              fields: [],
            }),
          );
        }}
      >
        <label className="scene-field">
          Nome do novo modelo
          <input
            name="name"
            aria-label="Nome do novo modelo"
            autoComplete="off"
            maxLength={120}
            required
          />
        </label>
        <button type="submit">Criar modelo de dados</button>
      </form>
      <label className="scene-field">
        Modelo em edição
        <select
          aria-label="Modelo em edição"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          <option value="">Selecione…</option>
          {data.models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name}
            </option>
          ))}
        </select>
      </label>
      {model && (
        <>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              edit((draft) => {
                const selected = draft.models.find((value) => value.id === model.id);
                if (selected) selected.name = formText(form, "name");
              });
            }}
          >
            <label className="scene-field">
              Nome do modelo
              <input
                name="name"
                aria-label="Nome do modelo"
                key={model.id}
                defaultValue={model.name}
                maxLength={120}
                required
              />
            </label>
            <button type="submit">Renomear modelo</button>
          </form>
          <button
            type="button"
            onClick={() =>
              edit((draft) => {
                draft.models = draft.models.filter((value) => value.id !== model.id);
              })
            }
          >
            Excluir modelo sem referências
          </button>
          {model.fields.map((field) => (
            <div className="behavior-data-row" key={field.id}>
              <p>
                {field.name} · {field.kind}
              </p>
              <small>{field.id}</small>
              <button
                type="button"
                aria-label={`Excluir campo ${field.name}`}
                onClick={() =>
                  edit((draft) => {
                    const selected = draft.models.find((value) => value.id === model.id);
                    if (selected)
                      selected.fields = selected.fields.filter((value) => value.id !== field.id);
                  }, true)
                }
              >
                Excluir campo e valores
              </button>
            </div>
          ))}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              try {
                const form = new FormData(event.currentTarget),
                  base = { id: `field-${crypto.randomUUID()}`, name: formText(form, "name"), kind },
                  field = dataFieldSchema.parse(
                    kind === "number"
                      ? {
                          ...base,
                          min: Number(formText(form, "min")),
                          max: Number(formText(form, "max")),
                        }
                      : kind === "enum"
                        ? {
                            ...base,
                            values: formText(form, "options")
                              .split("\n")
                              .map((value) => value.trim())
                              .filter(Boolean),
                          }
                        : kind === "model" || kind === "list"
                          ? { ...base, modelId: formText(form, "model") }
                          : base,
                    { jitless: true },
                  );
                edit((draft) => {
                  draft.models.find((value) => value.id === model.id)?.fields.push(field);
                }, true);
              } catch (error) {
                report(error);
              }
            }}
          >
            <label className="scene-field">
              Nome do campo
              <input
                name="name"
                aria-label="Nome do campo"
                autoComplete="off"
                required
                maxLength={120}
              />
            </label>
            <label className="scene-field">
              Tipo do campo
              <select
                aria-label="Tipo do campo"
                value={kind}
                onChange={(event) => setKind(event.target.value)}
              >
                {["string", "number", "boolean", "color", "enum", "model", "list"].map((kind) => (
                  <option key={kind}>{kind}</option>
                ))}
              </select>
            </label>
            {kind === "number" && (
              <>
                <label className="scene-field">
                  Mínimo do campo
                  <input
                    type="number"
                    name="min"
                    aria-label="Mínimo do campo"
                    min={-1e7}
                    max={1e7}
                    step="any"
                    defaultValue={0}
                    required
                  />
                </label>
                <label className="scene-field">
                  Máximo do campo
                  <input
                    type="number"
                    name="max"
                    aria-label="Máximo do campo"
                    min={-1e7}
                    max={1e7}
                    step="any"
                    defaultValue={100}
                    required
                  />
                </label>
              </>
            )}
            {kind === "enum" && (
              <label className="scene-field">
                Opções do campo
                <textarea name="options" aria-label="Opções do campo" maxLength={12100} required />
              </label>
            )}
            {(kind === "model" || kind === "list") && (
              <label className="scene-field">
                Modelo do campo
                <select name="model" aria-label="Modelo do campo" required>
                  <option value="">Selecione…</option>
                  {data.models
                    .filter((value) => value.id !== model.id)
                    .map((value) => (
                      <option key={value.id} value={value.id}>
                        {value.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <button type="submit">Adicionar campo</button>
          </form>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              edit((draft) =>
                draft.instances.push({
                  id: `instance-${crypto.randomUUID()}`,
                  name: formText(form, "name"),
                  modelId: model.id,
                  value: defaultDataRecord(context, model.id),
                }),
              );
            }}
          >
            <label className="scene-field">
              Nome da instância
              <input
                name="name"
                aria-label="Nome da instância"
                autoComplete="off"
                required
                maxLength={120}
              />
            </label>
            <button type="submit">Criar instância de dados</button>
          </form>
        </>
      )}
      <label className="scene-field">
        Instância em edição
        <select
          aria-label="Instância em edição"
          value={instanceId}
          onChange={(event) => {
            setInstanceId(event.target.value);
            setLinkPath("");
          }}
        >
          <option value="">Selecione…</option>
          {data.instances.map((value) => (
            <option key={value.id} value={value.id}>
              {value.name}
            </option>
          ))}
        </select>
      </label>
      {instance && value && (
        <>
          <button
            type="button"
            onClick={() =>
              edit((draft) => {
                draft.instances = draft.instances.filter((value) => value.id !== instance.id);
              })
            }
          >
            Excluir instância e valores
          </button>
          <DataRecordFields
            key={instance.id}
            context={context}
            instanceId={instance.id}
            modelId={instance.modelId}
            value={value}
            focusPath={focus?.editorPath}
            change={(changes) => {
              try {
                const next = applyDataChanges(context, context.initial, changes);
                const first = changes[0];
                if (first)
                  focusChanged({
                    ...focus,
                    editorPath:
                      first.operation === "insert" ? [...first.path, first.id] : first.path,
                  });
                save({
                  ...data,
                  instances: data.instances.map((instance) => ({
                    ...instance,
                    value: next.get(instance.id),
                  })),
                });
              } catch (error) {
                report(error);
              }
            }}
          />
          <h3>LINKS COM INPUTS</h3>
          <label className="scene-field">
            Buscar caminho
            <input
              aria-label="Buscar caminho"
              autoComplete="off"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
          </label>
          <p className="micro">
            {paths.length} caminhos; até 100 por busca. Itens de lista são identificados pelo ID,
            não pela posição.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              if (!linkPath) {
                report(new Error("Selecione um caminho."));
                return;
              }
              edit((draft) =>
                draft.links.push({
                  id: `link-${crypto.randomUUID()}`,
                  instanceId: instance.id,
                  path: linkPath.split("/"),
                  inputId: formText(form, "input"),
                  direction: formText(form, "direction") === "two-way" ? "two-way" : "one-way",
                }),
              );
            }}
          >
            <label className="scene-field">
              Caminho do campo
              <select
                aria-label="Caminho do campo"
                value={linkPath}
                onChange={(event) => setLinkPath(event.target.value)}
                required
              >
                <option value="">Selecione…</option>
                {paths.slice(0, 100).map((value) => (
                  <option key={value.path.join("/")} value={value.path.join("/")}>
                    {value.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="scene-field">
              Input do link
              <select name="input" aria-label="Input do link" required>
                <option value="">Selecione…</option>
                {behavior.inputs
                  .filter((input) => input.kind !== "trigger")
                  .map((input) => (
                    <option key={input.id} value={input.id}>
                      {input.name} · {input.kind}
                    </option>
                  ))}
              </select>
            </label>
            <label className="scene-field">
              Direção do link
              <select name="direction" aria-label="Direção do link" defaultValue="one-way">
                <option value="one-way">Modelo → input</option>
                <option value="two-way">Bidirecional</option>
              </select>
            </label>
            <button type="submit">Criar link de dados</button>
          </form>
        </>
      )}
      {data.links.map((link) => (
        <div key={link.id}>
          <small>
            {link.instanceId} → {link.inputId} · {link.direction}
          </small>
          <button
            type="button"
            aria-label={`Excluir link ${link.id}`}
            onClick={() =>
              edit((draft) => {
                draft.links = draft.links.filter((value) => value.id !== link.id);
              })
            }
          >
            Excluir link
          </button>
        </div>
      ))}
    </details>
  );
}
