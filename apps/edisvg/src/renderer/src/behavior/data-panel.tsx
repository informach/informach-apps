import { type Animation, propertySchema } from "@informach/edi-motion";
import {
  type Behavior,
  type BehaviorBinding,
  type BehaviorInput,
  type BehaviorListener,
  bindingSchema,
  listenerSchema,
  type TimelineEvent,
  timelineEventSchema,
} from "@informach/edi-motion/behavior";
import { type RigDocument, rigParameterEntries, rigParameterKey } from "@informach/edi-motion/rig";
import { type ReactNode, useId, useRef, useState } from "react";
import { formText } from "./forms";

interface ObjectOption {
  id: string;
  name: string;
  tag: string;
}
function upsert<T extends { id: string }>(list: T[], value: T) {
  const index = list.findIndex((item) => item.id === value.id);
  if (index < 0) list.push(value);
  else list[index] = value;
}
function PagedItems<T extends { id: string }>({
  items,
  label,
  render,
}: {
  items: T[];
  label: string;
  render(item: T): ReactNode;
}) {
  const [page, setPage] = useState(0),
    pages = Math.max(1, Math.ceil(items.length / 50)),
    current = Math.min(page, pages - 1);
  return (
    <section className="behavior-data-list" aria-label={label}>
      {items.length === 0 && <p className="micro">Nenhum item criado.</p>}
      {items.slice(current * 50, (current + 1) * 50).map((item) => (
        <div className="behavior-data-row" key={item.id}>
          {render(item)}
        </div>
      ))}
      <div className="scene-tools">
        <button type="button" disabled={current === 0} onClick={() => setPage(current - 1)}>
          Anterior em {label}
        </button>
        <span role="status">
          {current + 1}/{pages} · {items.length} itens
        </span>
        <button type="button" disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>
          Próxima em {label}
        </button>
      </div>
    </section>
  );
}
function BindingForm({
  rig,
  binding,
  inputs,
  objects,
  save,
  report,
}: {
  binding?: BehaviorBinding;
  rig?: RigDocument;
  inputs: BehaviorInput[];
  objects: ObjectOption[];
  save(value: BehaviorBinding): void;
  report(error: unknown): void;
}) {
  const [kind, setKind] = useState(binding?.kind ?? "transform"),
    parameters = rig ? rigParameterEntries(rig) : [];
  const compatible = inputs.filter((input) =>
    kind === "transform" || kind === "parameter"
      ? input.kind === "number"
      : kind === "visibility"
        ? input.kind === "boolean"
        : kind === "color"
          ? input.kind === "color"
          : kind === "semantics"
            ? input.kind !== "trigger" && input.kind !== "color"
            : input.kind === "string" || input.kind === "enum",
  );
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        try {
          const data = new FormData(event.currentTarget),
            parameter =
              kind === "parameter"
                ? parameters.find(
                    (entry) =>
                      rigParameterKey([], entry.targetId, entry.property) ===
                      formText(data, "parameter"),
                  )
                : undefined,
            base = {
              id: binding?.id ?? `binding-${crypto.randomUUID()}`,
              kind,
              inputId: formText(data, "input"),
              targetId:
                kind === "parameter" ? (parameter?.targetId ?? "") : formText(data, "target"),
              direction:
                kind === "visibility" || kind === "semantics"
                  ? "one-way"
                  : formText(data, "direction"),
            };
          save(
            bindingSchema.parse(
              kind === "transform" || kind === "parameter"
                ? {
                    ...base,
                    property:
                      kind === "parameter" ? parameter?.property : formText(data, "property"),
                    scale: Number(formText(data, "scale")),
                    offset: Number(formText(data, "offset")),
                  }
                : kind === "color"
                  ? { ...base, property: formText(data, "property") }
                  : kind === "visibility"
                    ? { ...base, invert: data.has("invert") }
                    : kind === "semantics"
                      ? {
                          ...base,
                          property: formText(data, "property"),
                          template: formText(data, "template"),
                        }
                      : base,
            ),
          );
        } catch (error) {
          report(error);
        }
      }}
    >
      <label className="scene-field">
        Tipo do binding
        <select
          aria-label="Tipo do binding"
          value={kind}
          onChange={(event) =>
            setKind(
              event.target.value === "text" ||
                event.target.value === "visibility" ||
                event.target.value === "parameter" ||
                event.target.value === "color" ||
                event.target.value === "semantics"
                ? event.target.value
                : "transform",
            )
          }
        >
          <option value="transform">Transformação</option>
          <option value="text">Texto</option>
          <option value="visibility">Visibilidade</option>
          <option value="color">Cor</option>
          <option value="parameter">Parâmetro de rig</option>
          <option value="semantics">Semântico (nome ou descrição acessível)</option>
        </select>
      </label>
      <label className="scene-field">
        Input do binding
        <select
          aria-label="Input do binding"
          key={kind}
          name="input"
          required
          defaultValue={binding?.inputId ?? ""}
        >
          <option value="">Selecione…</option>
          {compatible.map((input) => (
            <option key={input.id} value={input.id}>
              {input.name}
            </option>
          ))}
        </select>
      </label>
      {kind === "parameter" ? (
        <label className="scene-field">
          Destino de rig
          <select
            aria-label="Destino de rig"
            name="parameter"
            required
            defaultValue={
              binding?.kind === "parameter"
                ? rigParameterKey([], binding.targetId, binding.property)
                : ""
            }
          >
            <option value="">Selecione…</option>
            {parameters.map((entry) => (
              <option
                key={rigParameterKey([], entry.targetId, entry.property)}
                value={rigParameterKey([], entry.targetId, entry.property)}
              >
                {entry.targetId} · {entry.property}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label className="scene-field">
          Objeto do binding
          <select
            aria-label="Objeto do binding"
            name="target"
            required
            defaultValue={binding?.targetId ?? ""}
          >
            <option value="">Selecione…</option>
            {objects
              .filter((object) => kind !== "text" || object.tag === "text")
              .map((object) => (
                <option key={object.id} value={object.id}>
                  {object.name}
                </option>
              ))}
          </select>
        </label>
      )}
      {kind !== "visibility" && kind !== "semantics" && (
        <label className="scene-field">
          Direção do binding
          <select
            aria-label="Direção do binding"
            name="direction"
            defaultValue={binding?.direction ?? "one-way"}
          >
            <option value="one-way">Input → objeto</option>
            <option value="two-way">Input ↔ objeto, pela API de escrita reversa</option>
          </select>
        </label>
      )}
      {(kind === "transform" || kind === "parameter") && (
        <>
          {kind === "transform" && (
            <label className="scene-field">
              Propriedade vinculada
              <select
                aria-label="Propriedade vinculada"
                name="property"
                defaultValue={binding?.kind === "transform" ? binding.property : "x"}
              >
                {propertySchema.options.map((property) => (
                  <option key={property} value={property}>
                    {property}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="scene-field">
            Multiplicador
            <input
              name="scale"
              type="number"
              min="-10000"
              max="10000"
              step="any"
              required
              defaultValue={
                binding?.kind === "transform" || binding?.kind === "parameter" ? binding.scale : 1
              }
            />
          </label>
          <label className="scene-field">
            Deslocamento
            <input
              name="offset"
              type="number"
              min="-10000"
              max="10000"
              step="any"
              required
              defaultValue={
                binding?.kind === "transform" || binding?.kind === "parameter" ? binding.offset : 0
              }
            />
          </label>
        </>
      )}
      {kind === "color" && (
        <label className="scene-field">
          Pintura vinculada
          <select
            aria-label="Pintura vinculada"
            name="property"
            defaultValue={binding?.kind === "color" ? binding.property : "fill"}
          >
            <option value="fill">Preenchimento</option>
            <option value="stroke">Contorno</option>
          </select>
        </label>
      )}
      {kind === "semantics" && (
        <>
          <label className="scene-field">
            Texto acessível vinculado
            <select
              aria-label="Texto acessível vinculado"
              name="property"
              defaultValue={binding?.kind === "semantics" ? binding.property : "label"}
            >
              <option value="label">Nome acessível</option>
              <option value="description">Descrição acessível</option>
            </select>
          </label>
          <label className="scene-field">
            Modelo do texto
            <input
              aria-label="Modelo do texto"
              name="template"
              required
              maxLength={500}
              defaultValue={binding?.kind === "semantics" ? binding.template : "{valor}"}
            />
          </label>
          <p className="micro">
            Use {"{valor}"} uma vez, por exemplo “Placar: {"{valor}"} pontos”. Números saem no
            formato brasileiro e booleanos como sim/não. O objeto precisa de semântica com nome (e
            descrição, para a descrição).
          </p>
        </>
      )}
      {kind === "visibility" && (
        <label className="check-row">
          <input
            name="invert"
            type="checkbox"
            defaultChecked={binding?.kind === "visibility" && binding.invert}
          />
          Inverter booleano
        </label>
      )}
      <button type="submit">{binding ? "Aplicar binding" : "Criar binding"}</button>
      <p className="micro">
        Bindings são avaliados depois das camadas. Dois bindings no mesmo destino são recusados.
        Bidirecional usa writeBinding, sem criar observadores recursivos; não transforma qualquer
        forma em um campo de formulário.
      </p>
    </form>
  );
}
function ListenerForm({
  listener,
  inputs,
  objects,
  save,
  report,
}: {
  listener?: BehaviorListener;
  inputs: BehaviorInput[];
  objects: ObjectOption[];
  save(value: BehaviorListener): void;
  report(error: unknown): void;
}) {
  const prefix = useId(),
    [actions, setActions] = useState(
      (listener?.actions ?? []).map((action, index) => ({
        uiKey: `${prefix}-${index}`,
        kind: action.kind,
        inputId: action.inputId,
        value: action.kind === "set-input" ? String(action.value) : "",
        axis: action.kind === "pointer-coordinate" ? action.axis : "x",
        normalized: action.kind === "pointer-coordinate" && action.normalized,
      })),
    ),
    counter = useRef(actions.length);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        try {
          const data = new FormData(event.currentTarget);
          save(
            listenerSchema.parse({
              id: listener?.id ?? `listener-${crypto.randomUUID()}`,
              targetId: formText(data, "target") || null,
              event: formText(data, "event"),
              actions: actions.map((action) => {
                if (action.kind === "trigger")
                  return { kind: action.kind, inputId: action.inputId };
                if (action.kind === "pointer-coordinate")
                  return {
                    kind: action.kind,
                    inputId: action.inputId,
                    axis: action.axis,
                    normalized: action.normalized,
                  };
                const input = inputs.find((input) => input.id === action.inputId);
                return {
                  kind: action.kind,
                  inputId: action.inputId,
                  value:
                    input?.kind === "number"
                      ? Number(action.value)
                      : input?.kind === "boolean"
                        ? action.value === "true"
                        : action.value,
                };
              }),
            }),
          );
        } catch (error) {
          report(error);
        }
      }}
    >
      <label className="scene-field">
        Alvo do listener
        <select aria-label="Alvo do listener" name="target" defaultValue={listener?.targetId ?? ""}>
          <option value="">Artboard inteiro</option>
          {objects.map((object) => (
            <option key={object.id} value={object.id}>
              {object.name}
            </option>
          ))}
        </select>
      </label>
      <label className="scene-field">
        Evento do listener
        <select
          aria-label="Evento do listener"
          name="event"
          defaultValue={listener?.event ?? "activate"}
        >
          <option value="enter">Entrar / foco</option>
          <option value="leave">Sair / perder foco</option>
          <option value="activate">Clique / Enter / Espaço</option>
          <option value="move">Mover ponteiro / setas</option>
        </select>
      </label>
      {actions.map((action) => {
        const update = (values: Partial<typeof action>) =>
            setActions(
              actions.map((value) =>
                value.uiKey === action.uiKey ? { ...value, ...values } : value,
              ),
            ),
          input = inputs.find((input) => input.id === action.inputId);
        return (
          <fieldset key={action.uiKey}>
            <legend>Ação do listener</legend>
            <label className="scene-field">
              Tipo da ação
              <select
                aria-label="Tipo da ação"
                value={action.kind}
                onChange={(event) =>
                  update({
                    kind:
                      event.target.value === "trigger" ||
                      event.target.value === "pointer-coordinate"
                        ? event.target.value
                        : "set-input",
                    inputId: "",
                  })
                }
              >
                <option value="set-input">Definir input</option>
                <option value="trigger">Disparar gatilho</option>
                <option value="pointer-coordinate">Ligar coordenada</option>
              </select>
            </label>
            <label className="scene-field">
              Input da ação
              <select
                aria-label="Input da ação"
                required
                value={action.inputId}
                onChange={(event) => {
                  const input = inputs.find((input) => input.id === event.target.value);
                  update({
                    inputId: event.target.value,
                    value: input && input.kind !== "trigger" ? String(input.initial) : "",
                  });
                }}
              >
                <option value="">Selecione…</option>
                {inputs
                  .filter((input) =>
                    action.kind === "trigger"
                      ? input.kind === "trigger"
                      : action.kind === "pointer-coordinate"
                        ? input.kind === "number"
                        : input.kind !== "trigger",
                  )
                  .map((input) => (
                    <option key={input.id} value={input.id}>
                      {input.name}
                    </option>
                  ))}
              </select>
            </label>
            {action.kind === "set-input" && (
              <label className="scene-field" htmlFor={`${action.uiKey}-value`}>
                Valor da ação
                {input?.kind === "boolean" ? (
                  <select
                    id={`${action.uiKey}-value`}
                    value={action.value}
                    onChange={(event) => update({ value: event.target.value })}
                  >
                    <option value="false">Falso</option>
                    <option value="true">Verdadeiro</option>
                  </select>
                ) : (
                  <input
                    id={`${action.uiKey}-value`}
                    autoComplete="off"
                    type={input?.kind === "number" ? "number" : "text"}
                    step="any"
                    maxLength={10000}
                    required={input?.kind === "number"}
                    value={action.value}
                    onChange={(event) => update({ value: event.target.value })}
                  />
                )}
              </label>
            )}
            {action.kind === "pointer-coordinate" && (
              <>
                <label className="scene-field">
                  Eixo da coordenada
                  <select
                    aria-label="Eixo da coordenada"
                    value={action.axis}
                    onChange={(event) => update({ axis: event.target.value === "y" ? "y" : "x" })}
                  >
                    <option value="x">X</option>
                    <option value="y">Y</option>
                  </select>
                </label>
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={action.normalized}
                    onChange={(event) => update({ normalized: event.target.checked })}
                  />
                  Normalizar no viewBox
                </label>
              </>
            )}
            <button
              type="button"
              onClick={() => setActions(actions.filter((value) => value.uiKey !== action.uiKey))}
            >
              Remover ação
            </button>
          </fieldset>
        );
      })}
      <button
        type="button"
        disabled={actions.length >= 16 || inputs.length === 0}
        onClick={() =>
          setActions([
            ...actions,
            {
              uiKey: `${prefix}-${counter.current++}`,
              kind: "set-input",
              inputId: "",
              value: "",
              axis: "x",
              normalized: true,
            },
          ])
        }
      >
        Adicionar ação
      </button>
      <button type="submit">{listener ? "Aplicar listener" : "Criar listener"}</button>
      <p className="micro">
        Coordenadas são do artboard e respeitam seu viewBox/zoom; são limitadas ao intervalo
        declarado no input. Foco e teclado têm equivalência de interação.
      </p>
    </form>
  );
}
function EventForm({
  event,
  clips,
  save,
  report,
}: {
  event?: TimelineEvent;
  clips: Animation[];
  save(value: TimelineEvent): void;
  report(error: unknown): void;
}) {
  const prefix = useId(),
    [clipId, setClipId] = useState(event?.animationId ?? clips[0]?.id ?? ""),
    [fields, setFields] = useState(
      Object.entries(event?.data ?? {}).map(([name, value], index) => ({
        uiKey: `${prefix}-${index}`,
        name,
        kind: value === null ? "null" : typeof value,
        value: value === null ? "" : String(value),
      })),
    ),
    counter = useRef(fields.length);
  return (
    <form
      onSubmit={(native) => {
        native.preventDefault();
        try {
          const data = new FormData(native.currentTarget);
          if (new Set(fields.map((field) => field.name)).size !== fields.length)
            throw new Error("Chaves de dados de evento não podem se repetir.");
          save(
            timelineEventSchema.parse({
              id: event?.id ?? `event-${crypto.randomUUID()}`,
              animationId: clipId,
              frame: Number(formText(data, "frame")),
              name: formText(data, "name"),
              data: Object.fromEntries(
                fields.map((field) => [
                  field.name,
                  field.kind === "null"
                    ? null
                    : field.kind === "number"
                      ? Number(field.value)
                      : field.kind === "boolean"
                        ? field.value === "true"
                        : field.value,
                ]),
              ),
            }),
          );
        } catch (error) {
          report(error);
        }
      }}
    >
      <label className="scene-field">
        Nome do evento
        <input
          name="name"
          autoComplete="off"
          required
          maxLength={120}
          defaultValue={event?.name ?? ""}
        />
      </label>
      <label className="scene-field">
        Animação do evento
        <select
          aria-label="Animação do evento"
          required
          value={clipId}
          onChange={(event) => setClipId(event.target.value)}
        >
          <option value="">Selecione…</option>
          {clips.map((clip) => (
            <option key={clip.id} value={clip.id}>
              {clip.name}
            </option>
          ))}
        </select>
      </label>
      <label className="scene-field">
        Quadro do evento
        <input
          name="frame"
          type="number"
          step="any"
          min="0"
          max={clips.find((clip) => clip.id === clipId)?.frames ?? 0}
          required
          defaultValue={event?.frame ?? 0}
        />
      </label>
      {fields.map((field) => {
        const update = (value: Partial<typeof field>) =>
          setFields(
            fields.map((item) => (item.uiKey === field.uiKey ? { ...item, ...value } : item)),
          );
        return (
          <fieldset key={field.uiKey}>
            <legend>Dado do evento</legend>
            <label className="scene-field">
              Chave
              <input
                required
                autoComplete="off"
                maxLength={80}
                value={field.name}
                onChange={(event) => update({ name: event.target.value })}
              />
            </label>
            <label className="scene-field">
              Tipo do dado
              <select
                aria-label="Tipo do dado"
                value={field.kind}
                onChange={(event) =>
                  update({
                    kind: event.target.value,
                    value: event.target.value === "boolean" ? "false" : "",
                  })
                }
              >
                <option value="string">Texto</option>
                <option value="number">Número</option>
                <option value="boolean">Booleano</option>
                <option value="null">Nulo</option>
              </select>
            </label>
            {field.kind !== "null" && (
              <label className="scene-field" htmlFor={`${field.uiKey}-value`}>
                Valor do dado
                {field.kind === "boolean" ? (
                  <select
                    id={`${field.uiKey}-value`}
                    value={field.value}
                    onChange={(event) => update({ value: event.target.value })}
                  >
                    <option value="false">Falso</option>
                    <option value="true">Verdadeiro</option>
                  </select>
                ) : (
                  <input
                    id={`${field.uiKey}-value`}
                    autoComplete="off"
                    type={field.kind === "number" ? "number" : "text"}
                    step="any"
                    required={field.kind === "number"}
                    maxLength={1000}
                    value={field.value}
                    onChange={(event) => update({ value: event.target.value })}
                  />
                )}
              </label>
            )}
            <button
              type="button"
              onClick={() => setFields(fields.filter((item) => item.uiKey !== field.uiKey))}
            >
              Remover dado
            </button>
          </fieldset>
        );
      })}
      <button
        type="button"
        disabled={fields.length >= 20}
        onClick={() =>
          setFields([
            ...fields,
            { uiKey: `${prefix}-${counter.current++}`, name: "", kind: "string", value: "" },
          ])
        }
      >
        Adicionar dado ao evento
      </button>
      <button type="submit">{event ? "Aplicar evento" : "Criar evento"}</button>
      <p className="micro">
        Buscar não dispara eventos; avançar dispara cruzamentos, incluindo retorno ping-pong. No
        blend 1D, apenas a animação dominante emite; durante transições, emite o destino. Máximo de
        512 eventos por avanço; excesso é recusado sem avanço parcial.
      </p>
    </form>
  );
}
interface Props {
  rig?: RigDocument;
  behavior: Behavior;
  objects: ObjectOption[];
  clips: Animation[];
  tab: "bindings" | "listeners" | "events";
  tabChanged(tab: Props["tab"]): void;
  apply(edit: (draft: Behavior) => void): void;
  report(error: unknown): void;
}
export function BehaviorDataPanel({
  rig,
  behavior,
  objects,
  clips,
  tab,
  tabChanged,
  apply,
  report,
}: Props) {
  const [bindingId, setBindingId] = useState<string | null>(null),
    [listenerId, setListenerId] = useState<string | null>(null),
    [eventId, setEventId] = useState<string | null>(null),
    binding = behavior.bindings.find((item) => item.id === bindingId),
    listener = behavior.listeners.find((item) => item.id === listenerId),
    event = behavior.events.find((item) => item.id === eventId);
  return (
    <section data-behavior-data>
      <h3>DADOS E EVENTOS</h3>
      <div className="scene-tools">
        {(["bindings", "listeners", "events"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={tab === value}
            onClick={() => tabChanged(value)}
          >
            {value === "bindings" ? "Bindings" : value === "listeners" ? "Listeners" : "Eventos"}
          </button>
        ))}
      </div>
      {tab === "bindings" && (
        <>
          <PagedItems
            items={behavior.bindings}
            label="bindings"
            render={(item) => (
              <>
                <button type="button" onClick={() => setBindingId(item.id)}>
                  {item.kind} ·{" "}
                  {item.kind === "parameter"
                    ? `${item.targetId} · ${item.property}`
                    : objects.find((object) => object.id === item.targetId)?.name}
                </button>
                <button
                  type="button"
                  aria-label={`Excluir binding ${item.id}`}
                  onClick={() =>
                    apply((draft) => {
                      draft.bindings = draft.bindings.filter((value) => value.id !== item.id);
                    })
                  }
                >
                  ×
                </button>
              </>
            )}
          />
          <button type="button" onClick={() => setBindingId(null)}>
            Novo binding
          </button>
          <BindingForm
            rig={rig}
            key={binding?.id ?? "new"}
            binding={binding}
            inputs={behavior.inputs}
            objects={objects}
            save={(binding) =>
              apply((draft) => {
                if (binding.kind === "parameter") draft.version = 2;
                upsert(draft.bindings, binding);
              })
            }
            report={report}
          />
        </>
      )}
      {tab === "listeners" && (
        <>
          <PagedItems
            items={behavior.listeners}
            label="listeners"
            render={(item) => (
              <>
                <button type="button" onClick={() => setListenerId(item.id)}>
                  {item.event} ·{" "}
                  {item.targetId === null
                    ? "Artboard"
                    : objects.find((object) => object.id === item.targetId)?.name}
                </button>
                <button
                  type="button"
                  aria-label={`Excluir listener ${item.id}`}
                  onClick={() =>
                    apply((draft) => {
                      draft.listeners = draft.listeners.filter((value) => value.id !== item.id);
                    })
                  }
                >
                  ×
                </button>
              </>
            )}
          />
          <button type="button" onClick={() => setListenerId(null)}>
            Novo listener
          </button>
          <ListenerForm
            key={listener?.id ?? "new"}
            listener={listener}
            inputs={behavior.inputs}
            objects={objects}
            save={(listener) => apply((draft) => upsert(draft.listeners, listener))}
            report={report}
          />
        </>
      )}
      {tab === "events" && (
        <>
          <PagedItems
            items={behavior.events}
            label="eventos"
            render={(item) => (
              <>
                <button type="button" onClick={() => setEventId(item.id)}>
                  {item.name} · quadro {item.frame}
                </button>
                <button
                  type="button"
                  aria-label={`Excluir evento ${item.id}`}
                  onClick={() =>
                    apply((draft) => {
                      draft.events = draft.events.filter((value) => value.id !== item.id);
                    })
                  }
                >
                  ×
                </button>
              </>
            )}
          />
          <button type="button" onClick={() => setEventId(null)}>
            Novo evento
          </button>
          <EventForm
            key={event?.id ?? "new"}
            event={event}
            clips={clips}
            save={(event) => apply((draft) => upsert(draft.events, event))}
            report={report}
          />
        </>
      )}
    </section>
  );
}
