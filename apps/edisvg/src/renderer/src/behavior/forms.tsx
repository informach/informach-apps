import type { Animation } from "@informach/edi-motion";
import {
  type BehaviorInput,
  type BehaviorLayer,
  type BehaviorState,
  type BehaviorTransition,
  inputSchema,
  stateSchema,
  transitionSchema,
} from "@informach/edi-motion/behavior";
import { useId, useRef, useState } from "react";

export function formText(data: FormData, name: string): string {
  const value = data.get(name);
  if (typeof value !== "string") throw new Error(`Preencha ${name}.`);
  return value;
}
interface InputFormProps {
  input?: BehaviorInput;
  save(input: BehaviorInput): void;
  report(error: unknown): void;
}
export function InputForm({ input, save, report }: InputFormProps) {
  const [kind, setKind] = useState(input?.kind ?? "number");
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        try {
          const data = new FormData(event.currentTarget),
            base = {
              id: input?.id ?? `input-${crypto.randomUUID()}`,
              name: formText(data, "name"),
              kind,
            };
          const value =
            kind === "number"
              ? {
                  ...base,
                  initial: Number(formText(data, "initial")),
                  min: Number(formText(data, "min")),
                  max: Number(formText(data, "max")),
                }
              : kind === "boolean"
                ? { ...base, initial: formText(data, "initial") === "true" }
                : kind === "trigger"
                  ? base
                  : kind === "enum"
                    ? {
                        ...base,
                        initial: formText(data, "initial"),
                        values: formText(data, "values")
                          .split("\n")
                          .map((item) => item.trim())
                          .filter(Boolean),
                      }
                    : { ...base, initial: formText(data, "initial") };
          save(inputSchema.parse(value));
        } catch (error) {
          report(error);
        }
      }}
    >
      <label className="scene-field">
        Nome do input
        <input
          name="name"
          autoComplete="off"
          maxLength={120}
          required
          defaultValue={input?.name ?? ""}
        />
      </label>
      <label className="scene-field">
        Tipo de input
        <select
          aria-label="Tipo de input"
          name="kind"
          value={kind}
          onChange={(event) =>
            setKind(
              inputSchema.options
                .map((option) => option.shape.kind.value)
                .find((kind) => kind === event.target.value) ?? "number",
            )
          }
        >
          <option value="number">Número</option>
          <option value="boolean">Booleano</option>
          <option value="trigger">Gatilho</option>
          <option value="string">Texto</option>
          <option value="color">Cor</option>
          <option value="enum">Opções</option>
        </select>
      </label>
      {kind !== "trigger" &&
        (kind === "boolean" ? (
          <label className="scene-field">
            Valor inicial
            <select
              aria-label="Valor inicial"
              name="initial"
              defaultValue={input?.kind === "boolean" ? String(input.initial) : "false"}
            >
              <option value="false">Falso</option>
              <option value="true">Verdadeiro</option>
            </select>
          </label>
        ) : (
          <label className="scene-field">
            Valor inicial
            <input
              key={kind}
              name="initial"
              autoComplete="off"
              type={kind === "number" ? "number" : kind === "color" ? "color" : "text"}
              step="any"
              required={kind === "number"}
              maxLength={10000}
              defaultValue={
                input && input.kind !== "trigger"
                  ? String(input.initial)
                  : kind === "number"
                    ? "0"
                    : kind === "color"
                      ? "#4fe3c1"
                      : ""
              }
            />
          </label>
        ))}
      {kind === "number" && (
        <>
          <label className="scene-field">
            Mínimo
            <input
              name="min"
              type="number"
              step="any"
              required
              defaultValue={input?.kind === "number" ? input.min : 0}
            />
          </label>
          <label className="scene-field">
            Máximo
            <input
              name="max"
              type="number"
              step="any"
              required
              defaultValue={input?.kind === "number" ? input.max : 1}
            />
          </label>
        </>
      )}
      {kind === "enum" && (
        <>
          <label className="scene-field">
            Opções, uma por linha
            <textarea
              aria-label="Opções, uma por linha"
              name="values"
              required
              maxLength={12100}
              defaultValue={input?.kind === "enum" ? input.values.join("\n") : ""}
            />
          </label>
          <p className="micro">O valor inicial deve corresponder exatamente a uma opção.</p>
        </>
      )}
      <button type="submit">{input ? "Aplicar input" : "Criar input"}</button>
    </form>
  );
}
interface StateProps {
  state: BehaviorState;
  clips: Animation[];
  inputs: BehaviorInput[];
  save(state: BehaviorState): void;
  report(error: unknown): void;
}
export function StateForm({ state, clips, inputs, save, report }: StateProps) {
  const prefix = useId(),
    [kind, setKind] = useState(state.kind),
    [points, setPoints] = useState(
      state.kind === "blend1d"
        ? state.points.map((point, index) => ({
            uiKey: `${prefix}-${index}`,
            at: String(point.at),
            animationId: point.animationId,
          }))
        : [
            { uiKey: `${prefix}-0`, at: "0", animationId: clips[0]?.id ?? "" },
            { uiKey: `${prefix}-1`, at: "1", animationId: clips[1]?.id ?? clips[0]?.id ?? "" },
          ],
    );
  const nextPoint = useRef(points.length);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        try {
          const data = new FormData(event.currentTarget),
            base = {
              id: state.id,
              name: formText(data, "name"),
              x: Number(formText(data, "x")),
              y: Number(formText(data, "y")),
              speed: Number(formText(data, "speed")),
              kind,
            };
          save(
            stateSchema.parse(
              kind === "animation"
                ? { ...base, animationId: formText(data, "animation") }
                : kind === "base"
                  ? base
                  : {
                      ...base,
                      inputId: formText(data, "input"),
                      points: points.map((point) => ({
                        at: Number(point.at),
                        animationId: point.animationId,
                      })),
                    },
            ),
          );
        } catch (error) {
          report(error);
        }
      }}
    >
      <label className="scene-field">
        Nome do estado
        <input name="name" autoComplete="off" required maxLength={120} defaultValue={state.name} />
      </label>
      <label className="scene-field">
        Tipo de estado
        <select
          aria-label="Tipo de estado"
          value={kind}
          onChange={(event) =>
            setKind(
              stateSchema.options
                .map((option) => option.shape.kind.value)
                .find((kind) => kind === event.target.value) ?? "base",
            )
          }
        >
          <option value="animation">Animação</option>
          <option value="base">Pose-base (sem clip)</option>
          <option value="blend1d">Blend 1D</option>
        </select>
      </label>
      {kind === "animation" ? (
        <label className="scene-field">
          Animação do estado
          <select
            aria-label="Animação do estado"
            name="animation"
            defaultValue={state.kind === "animation" ? state.animationId : clips[0]?.id}
          >
            {clips.map((clip) => (
              <option key={clip.id} value={clip.id}>
                {clip.name}
              </option>
            ))}
          </select>
        </label>
      ) : (
        kind === "blend1d" && (
          <>
            <label className="scene-field">
              Input do blend
              <select
                aria-label="Input do blend"
                name="input"
                required
                defaultValue={state.kind === "blend1d" ? state.inputId : ""}
              >
                <option value="">Selecione um número…</option>
                {inputs
                  .filter((input) => input.kind === "number")
                  .map((input) => (
                    <option key={input.id} value={input.id}>
                      {input.name}
                    </option>
                  ))}
              </select>
            </label>
            {points.map((point, index) => (
              <div className="behavior-blend-point" key={point.uiKey}>
                <label className="scene-field">
                  Ponto {index + 1}
                  <input
                    type="number"
                    step="any"
                    required
                    value={point.at}
                    onChange={(event) =>
                      setPoints(
                        points.map((point, at) =>
                          at === index ? { ...point, at: event.target.value } : point,
                        ),
                      )
                    }
                  />
                </label>
                <label className="scene-field">
                  Animação no ponto {index + 1}
                  <select
                    value={point.animationId}
                    onChange={(event) =>
                      setPoints(
                        points.map((point, at) =>
                          at === index ? { ...point, animationId: event.target.value } : point,
                        ),
                      )
                    }
                  >
                    {clips.map((clip) => (
                      <option key={clip.id} value={clip.id}>
                        {clip.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  disabled={points.length <= 2}
                  onClick={() => setPoints(points.filter((_, at) => at !== index))}
                >
                  Remover ponto {index + 1}
                </button>
              </div>
            ))}
            <button
              type="button"
              disabled={points.length >= 32}
              onClick={() =>
                setPoints([
                  ...points,
                  {
                    uiKey: `${prefix}-${nextPoint.current++}`,
                    at: String(Number(points.at(-1)?.at ?? 0) + 1),
                    animationId: clips[0]?.id ?? "",
                  },
                ])
              }
            >
              Adicionar ponto ao blend
            </button>
          </>
        )
      )}
      <label className="scene-field">
        Velocidade do estado
        <input
          name="speed"
          type="number"
          step="any"
          min=".01"
          max="20"
          required
          defaultValue={state.speed}
        />
      </label>
      <label className="scene-field">
        Posição X no grafo
        <input name="x" type="number" min="-10000" max="10000" required defaultValue={state.x} />
      </label>
      <label className="scene-field">
        Posição Y no grafo
        <input name="y" type="number" min="-10000" max="10000" required defaultValue={state.y} />
      </label>
      <button type="submit">Aplicar estado</button>
    </form>
  );
}
interface TransitionProps {
  transition?: BehaviorTransition;
  layer: BehaviorLayer;
  inputs: BehaviorInput[];
  from: string;
  save(transition: BehaviorTransition): void;
  report(error: unknown): void;
}
export function TransitionForm({ transition, layer, inputs, from, save, report }: TransitionProps) {
  const prefix = useId(),
    [conditions, setConditions] = useState(
      (transition?.conditions ?? []).map((condition, index) => ({
        uiKey: `${prefix}-${index}`,
        inputId: condition.inputId,
        operator: condition.operator,
        value: "value" in condition ? String(condition.value) : "",
      })),
    ),
    [curve, setCurve] = useState(
      transition?.easing === "linear" || transition?.easing === "hold"
        ? transition.easing
        : (transition?.easing.kind ?? "cubic-bezier"),
    );
  const nextCondition = useRef(conditions.length);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        try {
          const data = new FormData(event.currentTarget);
          const conditionsValue = conditions.map((condition) => {
            const input = inputs.find((input) => input.id === condition.inputId);
            if (!input) throw new Error("Selecione um input para cada condição.");
            if (condition.operator === "trigger") return { inputId: input.id, operator: "trigger" };
            return {
              inputId: input.id,
              operator: condition.operator,
              value:
                input.kind === "number"
                  ? Number(condition.value)
                  : input.kind === "boolean"
                    ? condition.value === "true"
                    : condition.value,
            };
          });
          const easing =
            curve === "linear" || curve === "hold"
              ? curve
              : curve === "elastic"
                ? {
                    kind: "elastic",
                    amplitude: Number(formText(data, "amplitude")),
                    period: Number(formText(data, "period")),
                  }
                : {
                    kind: "cubic-bezier",
                    points: [0, 1, 2, 3].map((index) => Number(formText(data, `p${index}`))),
                  };
          save(
            transitionSchema.parse({
              id: transition?.id ?? `transition-${crypto.randomUUID()}`,
              from: formText(data, "from"),
              to: formText(data, "to"),
              priority: Number(formText(data, "priority")),
              duration: Number(formText(data, "duration")),
              exitAt: formText(data, "exitAt").trim() ? Number(formText(data, "exitAt")) : null,
              interrupt: formText(data, "interrupt"),
              easing,
              conditions: conditionsValue,
            }),
          );
        } catch (error) {
          report(error);
        }
      }}
    >
      <label className="scene-field">
        De
        <select aria-label="De" name="from" defaultValue={transition?.from ?? from}>
          <option value="*">Any State</option>
          {layer.states.map((state) => (
            <option key={state.id} value={state.id}>
              {state.name}
            </option>
          ))}
        </select>
      </label>
      <label className="scene-field">
        Para
        <select
          aria-label="Para"
          name="to"
          defaultValue={transition?.to ?? layer.states.find((state) => state.id !== from)?.id}
        >
          {layer.states.map((state) => (
            <option key={state.id} value={state.id}>
              {state.name}
            </option>
          ))}
        </select>
      </label>
      <label className="scene-field">
        Prioridade
        <input
          name="priority"
          type="number"
          min="-10000"
          max="10000"
          required
          defaultValue={transition?.priority ?? 0}
        />
      </label>
      <label className="scene-field">
        Duração da transição (s)
        <input
          name="duration"
          type="number"
          min="0"
          max="60"
          step="any"
          required
          defaultValue={transition?.duration ?? 0.2}
        />
      </label>
      <label className="scene-field">
        Sair em fase normalizada (vazio = imediato)
        <input
          name="exitAt"
          type="number"
          min="0"
          max="1000"
          step="any"
          defaultValue={transition?.exitAt ?? ""}
        />
      </label>
      <label className="scene-field">
        Interrupção
        <select
          aria-label="Interrupção"
          name="interrupt"
          defaultValue={transition?.interrupt ?? "never"}
        >
          <option value="never">Terminar blend antes de outra transição</option>
          <option value="immediate">Permitir transição imediata</option>
        </select>
      </label>
      <label className="scene-field">
        Curva da transição
        <select
          aria-label="Curva da transição"
          value={curve}
          onChange={(event) =>
            setCurve(
              event.target.value === "linear" ||
                event.target.value === "hold" ||
                event.target.value === "elastic"
                ? event.target.value
                : "cubic-bezier",
            )
          }
        >
          <option value="linear">Linear</option>
          <option value="hold">Degrau</option>
          <option value="cubic-bezier">Bézier (padrão Suave)</option>
          <option value="elastic">Elástico</option>
        </select>
      </label>
      {curve === "cubic-bezier" && (
        <div className="property-grid">
          {[
            { id: "p0", label: "x1", value: 0.42 },
            { id: "p1", label: "y1", value: 0 },
            { id: "p2", label: "x2", value: 0.58 },
            { id: "p3", label: "y2", value: 1 },
          ].map((point, index) => (
            <label className="property" key={point.id}>
              {point.label}
              <input
                name={`p${index}`}
                type="number"
                step="any"
                min={index % 2 ? -10 : 0}
                max={index % 2 ? 10 : 1}
                required
                defaultValue={
                  transition?.easing !== "linear" &&
                  transition?.easing !== "hold" &&
                  transition?.easing.kind === "cubic-bezier"
                    ? transition.easing.points[index]
                    : point.value
                }
              />
            </label>
          ))}
        </div>
      )}
      {curve === "elastic" && (
        <>
          <label className="scene-field">
            Amplitude
            <input
              name="amplitude"
              type="number"
              min="1"
              max="10"
              step="any"
              required
              defaultValue={
                typeof transition?.easing === "object" && transition.easing.kind === "elastic"
                  ? transition.easing.amplitude
                  : 1
              }
            />
          </label>
          <label className="scene-field">
            Período
            <input
              name="period"
              type="number"
              min=".05"
              max="2"
              step="any"
              required
              defaultValue={
                typeof transition?.easing === "object" && transition.easing.kind === "elastic"
                  ? transition.easing.period
                  : 0.3
              }
            />
          </label>
        </>
      )}
      {conditions.map((condition, index) => {
        const input = inputs.find((input) => input.id === condition.inputId);
        const update = (values: Partial<typeof condition>) =>
          setConditions(
            conditions.map((condition, at) =>
              at === index ? { ...condition, ...values } : condition,
            ),
          );
        return (
          <fieldset key={condition.uiKey}>
            <legend>Condição {index + 1}</legend>
            <label className="scene-field">
              Input da condição
              <select
                aria-label="Input da condição"
                value={condition.inputId}
                onChange={(event) => {
                  const input = inputs.find((input) => input.id === event.target.value);
                  update({
                    inputId: event.target.value,
                    operator: input?.kind === "trigger" ? "trigger" : "eq",
                    value:
                      input?.kind === "boolean" ? "false" : input?.kind === "number" ? "0" : "",
                  });
                }}
              >
                <option value="">Selecione…</option>
                {inputs.map((input) => (
                  <option key={input.id} value={input.id}>
                    {input.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="scene-field">
              Operador
              <select
                aria-label="Operador"
                value={condition.operator}
                onChange={(event) => {
                  const operator = ["eq", "neq", "gt", "gte", "lt", "lte", "trigger"] as const;
                  const next = operator.find((operator) => operator === event.target.value);
                  if (next) update({ operator: next });
                }}
              >
                {(input?.kind === "trigger"
                  ? ["trigger"]
                  : input?.kind === "number"
                    ? ["eq", "neq", "gt", "gte", "lt", "lte"]
                    : ["eq", "neq"]
                ).map((operator) => (
                  <option key={operator} value={operator}>
                    {operator}
                  </option>
                ))}
              </select>
            </label>
            {input?.kind !== "trigger" && (
              <label className="scene-field" htmlFor={`${condition.uiKey}-value`}>
                Valor da condição
                {input?.kind === "boolean" ? (
                  <select
                    id={`${condition.uiKey}-value`}
                    value={condition.value}
                    onChange={(event) => update({ value: event.target.value })}
                  >
                    <option value="false">Falso</option>
                    <option value="true">Verdadeiro</option>
                  </select>
                ) : (
                  <input
                    id={`${condition.uiKey}-value`}
                    autoComplete="off"
                    type={input?.kind === "number" ? "number" : "text"}
                    step="any"
                    required={input?.kind === "number"}
                    value={condition.value}
                    onChange={(event) => update({ value: event.target.value })}
                  />
                )}
              </label>
            )}
            <button
              type="button"
              onClick={() => setConditions(conditions.filter((_, at) => at !== index))}
            >
              Remover condição {index + 1}
            </button>
          </fieldset>
        );
      })}
      <button
        type="button"
        disabled={conditions.length >= 32 || inputs.length === 0}
        onClick={() => {
          const input = inputs[0];
          if (input)
            setConditions([
              ...conditions,
              {
                uiKey: `${prefix}-${nextCondition.current++}`,
                inputId: input.id,
                operator: input.kind === "trigger" ? "trigger" : "eq",
                value: input.kind === "trigger" ? "" : String(input.initial),
              },
            ]);
        }}
      >
        Adicionar condição
      </button>
      <p className="micro">
        Condições combinam com E. Sem condições, a transição é automática. Prioridade maior vence;
        empate segue a ordem da lista. Fase 1 é uma duração de ida do estado; no ping-pong é a
        virada, não a volta completa.
      </p>
      <button type="submit">{transition ? "Aplicar transição" : "Criar transição"}</button>
    </form>
  );
}
