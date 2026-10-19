import { type Animation, propertySchema } from "@informach/edi-motion";
import {
  type Behavior,
  type BehaviorInput,
  type BehaviorLayer,
  type BehaviorMachine,
  type BehaviorState,
  type BehaviorTransition,
  emptyBehavior,
  layerSchema,
} from "@informach/edi-motion/behavior";
import type { RigDocument } from "@informach/edi-motion/rig";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";
import { DataModelPanel, type ModelFocus } from "./data-model-panel";
import { BehaviorDataPanel } from "./data-panel";
import { formText, InputForm, StateForm, TransitionForm } from "./forms";
import "./workbench.css";

export interface BehaviorFocus {
  machineId?: string;
  layerId?: string;
  stateId?: string;
  transitionId?: string;
  dataTab?: "bindings" | "listeners" | "events";
  modelData?: ModelFocus;
}
interface Props {
  rig?: RigDocument;
  behavior?: Behavior;
  clips: Animation[];
  objects: { id: string; name: string; tag: string }[];
  sidebar: Element;
  inspector: Element;
  focus?: BehaviorFocus;
  focusChanged(value: BehaviorFocus): void;
  execute(value: Behavior): void;
  test(machineId: string): void;
}
const uid = (kind: string) => `${kind}-${crypto.randomUUID()}`;
function Workbench({
  rig,
  behavior = emptyBehavior(),
  clips,
  objects,
  sidebar,
  inspector,
  focus,
  focusChanged,
  execute,
  test,
}: Props) {
  const [selection, setSelection] = useState(focus ?? {}),
    [inputId, setInputId] = useState<string | null>(null),
    [tab, setTab] = useState<"state" | "transition">(focus?.transitionId ? "transition" : "state"),
    [error, setError] = useState(""),
    [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null),
    dragRef = useRef<{
      id: string;
      startX: number;
      startY: number;
      x: number;
      y: number;
      pointerId: number;
    } | null>(null);
  const machine =
      behavior.machines.find((machine) => machine.id === selection.machineId) ??
      behavior.machines.find((machine) => machine.id === behavior.defaultMachineId) ??
      behavior.machines[0],
    layer = machine?.layers.find((layer) => layer.id === selection.layerId) ?? machine?.layers[0],
    selectedState =
      layer?.states.find((state) => state.id === selection.stateId) ?? layer?.states[0],
    transition = layer?.transitions.find((transition) => transition.id === selection.transitionId),
    input = behavior.inputs.find((input) => input.id === inputId);
  const report = (error: unknown) =>
    setError(error instanceof Error ? error.message : "Edição de lógica recusada.");
  const choose = (next: BehaviorFocus) => {
    const value = { dataTab: selection.dataTab, modelData: selection.modelData, ...next };
    setSelection(value);
    focusChanged(value);
  };
  const apply = (edit: (draft: Behavior) => void) => {
    try {
      const draft = structuredClone(behavior);
      edit(draft);
      execute(draft);
    } catch (error) {
      report(error);
    }
  };
  const editLayer = (edit: (layer: BehaviorLayer) => void) =>
    apply((draft) => {
      const selected = draft.machines
        .find((item) => item.id === machine?.id)
        ?.layers.find((item) => item.id === layer?.id);
      if (!selected) throw new Error("Selecione uma camada.");
      edit(selected);
    });
  const createState = (): BehaviorState => {
    const clip = clips[0];
    return {
      id: uid("state"),
      name: "Novo estado",
      x: 80,
      y: 100,
      speed: 1,
      ...(clip ? { kind: "animation" as const, animationId: clip.id } : { kind: "base" as const }),
    };
  };
  const createLayer = (): BehaviorLayer => {
    const state = createState();
    return {
      id: uid("layer"),
      name: "Nova camada",
      entryStateId: state.id,
      weight: 1,
      mode: "override",
      targetIds: [],
      properties: [...propertySchema.options],
      states: [state],
      transitions: [],
    };
  };
  const upsertInput = (input: BehaviorInput) =>
    apply((draft) => {
      const index = draft.inputs.findIndex((item) => item.id === input.id);
      if (index < 0) draft.inputs.push(input);
      else draft.inputs[index] = input;
    });
  const upsertState = (state: BehaviorState) => {
    choose({ machineId: machine?.id, layerId: layer?.id, stateId: state.id });
    editLayer((layer) => {
      const index = layer.states.findIndex((item) => item.id === state.id);
      if (index < 0) layer.states.push(state);
      else layer.states[index] = state;
    });
  };
  const upsertTransition = (transition: BehaviorTransition) => {
    choose({
      machineId: machine?.id,
      layerId: layer?.id,
      stateId: selectedState?.id,
      transitionId: transition.id,
    });
    editLayer((layer) => {
      const index = layer.transitions.findIndex((item) => item.id === transition.id);
      if (index < 0) layer.transitions.push(transition);
      else layer.transitions[index] = transition;
    });
  };
  const minX = Math.min(0, ...(layer?.states.map((state) => state.x) ?? [])) - 40,
    minY = Math.min(0, ...(layer?.states.map((state) => state.y) ?? [])) - 40;
  const position = (state: BehaviorState) => ({
    x: (drag?.id === state.id ? drag.x : state.x) - minX,
    y: (drag?.id === state.id ? drag.y : state.y) - minY,
  });
  const cancelDrag = () => {
    dragRef.current = null;
    setDrag(null);
  };
  useEffect(() => {
    const cancel = () => {
      dragRef.current = null;
      setDrag(null);
    };
    window.addEventListener("blur", cancel);
    return () => {
      dragRef.current = null;
      window.removeEventListener("blur", cancel);
    };
  }, []);
  return (
    <>
      {createPortal(
        <>
          <div className="panel-heading">MÁQUINAS DE ESTADOS</div>
          <section>
            <label className="scene-field">
              Máquina
              <select
                aria-label="Máquina de estados"
                value={machine?.id ?? ""}
                onChange={(event) => choose({ machineId: event.target.value })}
              >
                <option value="" disabled>
                  Crie uma máquina…
                </option>
                {behavior.machines.map((machine) => (
                  <option key={machine.id} value={machine.id}>
                    {machine.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() =>
                apply((draft) => {
                  const machine: BehaviorMachine = {
                    id: uid("machine"),
                    name: "Nova máquina",
                    layers: [createLayer()],
                  };
                  draft.machines.push(machine);
                  draft.defaultMachineId ??= machine.id;
                  choose({ machineId: machine.id });
                })
              }
            >
              Criar máquina
            </button>
            {machine && (
              <>
                <form
                  key={machine.id}
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    apply((draft) => {
                      const selected = draft.machines.find((item) => item.id === machine.id);
                      if (selected) selected.name = formText(data, "machine-name");
                    });
                  }}
                >
                  <label className="scene-field">
                    Nome da máquina
                    <input
                      name="machine-name"
                      autoComplete="off"
                      required
                      maxLength={120}
                      defaultValue={machine.name}
                    />
                  </label>
                  <button type="submit">Renomear máquina</button>
                </form>
                <div className="scene-tools">
                  <button
                    type="button"
                    disabled={machine.id === behavior.defaultMachineId}
                    onClick={() =>
                      apply((draft) => {
                        draft.defaultMachineId = machine.id;
                      })
                    }
                  >
                    Usar como inicial
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      apply((draft) => {
                        draft.machines = draft.machines.filter((item) => item.id !== machine.id);
                        if (draft.defaultMachineId === machine.id)
                          draft.defaultMachineId = draft.machines[0]?.id ?? null;
                      })
                    }
                  >
                    Excluir máquina
                  </button>
                </div>
                <h3>CAMADAS</h3>
                {machine.layers.map((value) => (
                  <button
                    key={value.id}
                    type="button"
                    className="behavior-layer"
                    aria-pressed={value.id === layer?.id}
                    onClick={() => choose({ machineId: machine.id, layerId: value.id })}
                  >
                    {value.name}
                    <small>
                      {value.states.length} estados · {value.mode}
                    </small>
                  </button>
                ))}
                <div className="scene-tools">
                  {([-1, 1] as const).map((direction) => (
                    <button
                      key={direction}
                      type="button"
                      disabled={
                        !layer ||
                        machine.layers.findIndex((value) => value.id === layer.id) + direction <
                          0 ||
                        machine.layers.findIndex((value) => value.id === layer.id) + direction >=
                          machine.layers.length
                      }
                      onClick={() =>
                        apply((draft) => {
                          const selected = draft.machines.find((value) => value.id === machine.id);
                          if (!selected || !layer) throw new Error("Camada ausente.");
                          const index = selected.layers.findIndex((value) => value.id === layer.id),
                            value = selected.layers.splice(index, 1)[0];
                          if (!value) throw new Error("Camada ausente.");
                          selected.layers.splice(index + direction, 0, value);
                        })
                      }
                    >
                      {direction < 0 ? "Subir camada selecionada" : "Descer camada selecionada"}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    apply((draft) => {
                      const selected = draft.machines.find((item) => item.id === machine.id);
                      const layer = createLayer();
                      selected?.layers.push(layer);
                      choose({ machineId: machine.id, layerId: layer.id });
                    })
                  }
                >
                  Criar camada
                </button>
              </>
            )}
          </section>
          <section>
            <h3>INPUTS</h3>
            {behavior.inputs.map((input) => (
              <div className="behavior-input" key={input.id}>
                <button
                  type="button"
                  aria-pressed={inputId === input.id}
                  onClick={() => setInputId(input.id)}
                >
                  {input.name} · {input.kind}
                </button>
                <button
                  type="button"
                  aria-label={`Excluir input ${input.name}`}
                  onClick={() =>
                    apply((draft) => {
                      draft.inputs = draft.inputs.filter((item) => item.id !== input.id);
                    })
                  }
                >
                  ×
                </button>
              </div>
            ))}
            <button type="button" onClick={() => setInputId(null)}>
              Novo input
            </button>
            <InputForm key={input?.id ?? "new"} input={input} save={upsertInput} report={report} />
            <p className="micro">
              Excluir uma referência em uso é recusado. Remova primeiro condições, bindings e
              listeners dependentes. Desfazer restaura as edições.
            </p>
          </section>
        </>,
        sidebar,
      )}
      <div className="behavior-workbench">
        <div className="canvas-toolbar">
          <strong>{machine?.name ?? "Máquinas de estados"}</strong>
          <small>{layer?.name ?? ""}</small>
          <span className="push" />
          <button
            type="button"
            disabled={!machine}
            onClick={() => {
              if (machine) test(machine.id);
            }}
          >
            Testar máquina
          </button>
          <button
            type="button"
            disabled={!layer}
            onClick={() => {
              try {
                const value = createState();
                value.x = ((layer?.states.length ?? 0) % 5) * 220 + 80;
                value.y = Math.floor((layer?.states.length ?? 0) / 5) * 160 + 100;
                upsertState(value);
              } catch (error) {
                report(error);
              }
            }}
          >
            Criar estado
          </button>
        </div>
        <p role="alert" className="behavior-error">
          {error}
        </p>
        {layer ? (
          <>
            <div className="behavior-graph-scroll">
              <div
                className="behavior-graph"
                style={{
                  width: Math.max(1000, ...layer.states.map((state) => state.x - minX + 240)),
                  height: Math.max(500, ...layer.states.map((state) => state.y - minY + 160)),
                }}
              >
                <div className="behavior-entry">
                  Entry → {layer.states.find((state) => state.id === layer.entryStateId)?.name}
                </div>
                <svg className="behavior-edges" aria-hidden="true">
                  <title>Conexões entre estados</title>
                  {layer.transitions.map((transition) => {
                    const from = layer.states.find((state) => state.id === transition.from),
                      to = layer.states.find((state) => state.id === transition.to);
                    if (!to) return null;
                    const end = position(to),
                      start = from ? position(from) : { x: 20, y: 20 };
                    return (
                      <g key={transition.id}>
                        <path
                          d={`M${start.x + 85} ${start.y + 70} C${start.x + 85} ${start.y + 130} ${end.x + 85} ${end.y - 60} ${end.x + 85} ${end.y}`}
                        />
                        <text x={end.x + 92} y={end.y - 8}>
                          ↓ {transition.from === "*" ? "Any" : ""}
                        </text>
                      </g>
                    );
                  })}
                </svg>
                {layer.states.map((value) => {
                  const point = position(value);
                  return (
                    <button
                      type="button"
                      key={value.id}
                      className="behavior-state"
                      data-behavior-state={value.id}
                      style={{ left: point.x, top: point.y }}
                      aria-pressed={selectedState?.id === value.id}
                      onClick={() => {
                        choose({ machineId: machine?.id, layerId: layer.id, stateId: value.id });
                        setTab("state");
                      }}
                      onPointerDown={(event) => {
                        if (event.button !== 0) return;
                        event.currentTarget.setPointerCapture(event.pointerId);
                        dragRef.current = {
                          id: value.id,
                          pointerId: event.pointerId,
                          startX: event.clientX,
                          startY: event.clientY,
                          x: value.x,
                          y: value.y,
                        };
                      }}
                      onPointerMove={(event) => {
                        const active = dragRef.current;
                        if (!active || active.id !== value.id) return;
                        setDrag({
                          id: value.id,
                          x: Math.max(
                            -10000,
                            Math.min(10000, active.x + event.clientX - active.startX),
                          ),
                          y: Math.max(
                            -10000,
                            Math.min(10000, active.y + event.clientY - active.startY),
                          ),
                        });
                      }}
                      onPointerUp={(event) => {
                        const active = dragRef.current;
                        if (!active || active.id !== value.id) return;
                        const x = Math.max(
                            -10000,
                            Math.min(10000, active.x + event.clientX - active.startX),
                          ),
                          y = Math.max(
                            -10000,
                            Math.min(10000, active.y + event.clientY - active.startY),
                          );
                        cancelDrag();
                        if (x !== value.x || y !== value.y) upsertState({ ...value, x, y });
                      }}
                      onPointerCancel={cancelDrag}
                      onLostPointerCapture={cancelDrag}
                      onKeyDown={(event) => {
                        event.stopPropagation();
                        if (event.key === "Escape") {
                          cancelDrag();
                          return;
                        }
                        if (
                          ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
                        ) {
                          event.preventDefault();
                          const amount = event.shiftKey ? 10 : 1;
                          upsertState({
                            ...value,
                            x: Math.max(
                              -10000,
                              Math.min(
                                10000,
                                value.x +
                                  (event.key === "ArrowLeft"
                                    ? -amount
                                    : event.key === "ArrowRight"
                                      ? amount
                                      : 0),
                              ),
                            ),
                            y: Math.max(
                              -10000,
                              Math.min(
                                10000,
                                value.y +
                                  (event.key === "ArrowUp"
                                    ? -amount
                                    : event.key === "ArrowDown"
                                      ? amount
                                      : 0),
                              ),
                            ),
                          });
                        }
                      }}
                    >
                      <strong>{value.name}</strong>
                      <small>
                        {value.kind === "blend1d"
                          ? "Blend 1D"
                          : value.kind === "animation"
                            ? clips.find((clip) => clip.id === value.animationId)?.name
                            : "Pose-base"}
                      </small>
                      <span>{value.id === layer.entryStateId ? "● Entrada" : "○ Estado"}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="behavior-transitions">
              <h3>TRANSIÇÕES</h3>
              <button
                type="button"
                onClick={() => {
                  choose({ machineId: machine?.id, layerId: layer.id, stateId: selectedState?.id });
                  setTab("transition");
                }}
              >
                Nova transição
              </button>
              {layer.transitions.map((value) => (
                <button
                  className="behavior-transition-row"
                  type="button"
                  key={value.id}
                  aria-pressed={value.id === transition?.id}
                  onClick={() => {
                    choose({
                      machineId: machine?.id,
                      layerId: layer.id,
                      stateId: selectedState?.id,
                      transitionId: value.id,
                    });
                    setTab("transition");
                  }}
                >
                  {value.from === "*"
                    ? "Any State"
                    : layer.states.find((state) => state.id === value.from)?.name}{" "}
                  → {layer.states.find((state) => state.id === value.to)?.name}
                  <small>
                    {value.conditions.length} condições · {value.duration}s · prioridade{" "}
                    {value.priority}
                  </small>
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="micro scene-padding">
            Crie uma animação por objeto, depois uma máquina e seus estados. Nada depende dos
            presets do mascote.
          </p>
        )}
      </div>
      {createPortal(
        <>
          <div className="panel-heading">LÓGICA DA PRANCHETA</div>
          <section>
            {layer && (
              <form
                key={layer.id}
                onSubmit={(event) => {
                  event.preventDefault();
                  try {
                    const data = new FormData(event.currentTarget);
                    const parsed = layerSchema.parse({
                      ...layer,
                      name: formText(data, "layer-name"),
                      weight: Number(formText(data, "weight")),
                      mode: formText(data, "mode"),
                      entryStateId: formText(data, "entry"),
                      targetIds: data.getAll("targets"),
                      properties: data.getAll("properties"),
                    });
                    editLayer((layer) => Object.assign(layer, parsed));
                  } catch (error) {
                    report(error);
                  }
                }}
              >
                <h3>CAMADA</h3>
                <label className="scene-field">
                  Nome da camada
                  <input
                    name="layer-name"
                    autoComplete="off"
                    required
                    maxLength={120}
                    defaultValue={layer.name}
                  />
                </label>
                <label className="scene-field">
                  Peso
                  <input
                    name="weight"
                    type="number"
                    min="0"
                    max="1"
                    step="any"
                    required
                    defaultValue={layer.weight}
                  />
                </label>
                <label className="scene-field">
                  Composição
                  <select aria-label="Composição" name="mode" defaultValue={layer.mode}>
                    <option value="override">Sobrepor</option>
                    <option value="additive">Adicionar delta à pose base</option>
                  </select>
                </label>
                <label className="scene-field">
                  Estado de entrada
                  <select
                    aria-label="Estado de entrada"
                    name="entry"
                    defaultValue={layer.entryStateId}
                  >
                    {layer.states.map((state) => (
                      <option key={state.id} value={state.id}>
                        {state.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="scene-field">
                  Máscara de objetos
                  <select
                    aria-label="Máscara de objetos"
                    multiple
                    name="targets"
                    defaultValue={layer.targetIds}
                  >
                    {objects.map((object) => (
                      <option key={object.id} value={object.id}>
                        {object.name}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="micro">
                  Nenhum objeto selecionado significa todos. Ctrl/Cmd seleciona vários.
                </p>
                <fieldset>
                  <legend>Propriedades da camada</legend>
                  {propertySchema.options.map((property) => (
                    <label className="check-row" key={property}>
                      <input
                        type="checkbox"
                        name="properties"
                        value={property}
                        defaultChecked={layer.properties.includes(property)}
                      />
                      {property}
                    </label>
                  ))}
                </fieldset>
                <button type="submit">Aplicar camada</button>
                <button
                  type="button"
                  disabled={(machine?.layers.length ?? 0) <= 1}
                  onClick={() =>
                    apply((draft) => {
                      const selected = draft.machines.find((item) => item.id === machine?.id);
                      if (selected)
                        selected.layers = selected.layers.filter((item) => item.id !== layer.id);
                    })
                  }
                >
                  Excluir camada
                </button>
              </form>
            )}
          </section>
          {layer && selectedState && (
            <section>
              <div className="scene-tools">
                <button
                  type="button"
                  aria-pressed={tab === "state"}
                  onClick={() => setTab("state")}
                >
                  Estado
                </button>
                <button
                  type="button"
                  aria-pressed={tab === "transition"}
                  onClick={() => setTab("transition")}
                >
                  Transição
                </button>
              </div>
              {tab === "state" ? (
                <>
                  <StateForm
                    key={selectedState.id}
                    state={selectedState}
                    inputs={behavior.inputs}
                    clips={clips}
                    save={upsertState}
                    report={report}
                  />
                  <button
                    type="button"
                    disabled={layer.states.length <= 1 || selectedState.id === layer.entryStateId}
                    onClick={() =>
                      editLayer((layer) => {
                        if (
                          layer.transitions.some(
                            (transition) =>
                              transition.to === selectedState.id ||
                              transition.from === selectedState.id,
                          )
                        )
                          throw new Error("Remova as transições do estado antes de excluir.");
                        layer.states = layer.states.filter(
                          (state) => state.id !== selectedState.id,
                        );
                      })
                    }
                  >
                    Excluir estado
                  </button>
                </>
              ) : (
                <>
                  <TransitionForm
                    key={transition?.id ?? "new"}
                    transition={transition}
                    layer={layer}
                    from={selectedState.id}
                    inputs={behavior.inputs}
                    save={upsertTransition}
                    report={report}
                  />
                  {transition && (
                    <button
                      type="button"
                      onClick={() =>
                        editLayer((layer) => {
                          layer.transitions = layer.transitions.filter(
                            (item) => item.id !== transition.id,
                          );
                        })
                      }
                    >
                      Excluir transição
                    </button>
                  )}
                </>
              )}
            </section>
          )}
          <BehaviorDataPanel
            rig={rig}
            behavior={behavior}
            objects={objects}
            clips={clips}
            tab={selection.dataTab ?? "bindings"}
            tabChanged={(dataTab) => choose({ ...selection, dataTab })}
            apply={apply}
            report={report}
          />
          <DataModelPanel
            behavior={behavior}
            focus={selection.modelData}
            focusChanged={(modelData) => choose({ ...selection, modelData })}
            save={(data) =>
              apply((draft) => {
                draft.data = data;
              })
            }
            report={report}
          />
          <section>
            <p className="micro">
              As camadas executam em ordem; bindings têm prioridade final. Gatilhos são distribuídos
              uma vez às camadas elegíveis e consumidos no avanço. Ciclos de transições são
              recusados no teste, sem alterar o documento.
            </p>
          </section>
        </>,
        inspector,
      )}
    </>
  );
}
export function mountBehaviorWorkbench(host: Element, props: Props) {
  const root = createRoot(host);
  root.render(<Workbench {...props} />);
  return () => root.unmount();
}
