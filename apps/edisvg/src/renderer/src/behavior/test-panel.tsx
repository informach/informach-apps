import { AudioControls } from "@informach/edi-motion/react";
import {
  type BehaviorDebug,
  type createInteractiveSvgPlayer,
  createInteractiveSvgPlayerAsync,
  documentAudioAssets,
} from "@informach/edi-motion/runtime";
import { useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import type { compileInteractiveArtboard } from "../../../shared/interactive";
import { FormNumberField } from "../form-number-field";
import { BehaviorArtwork } from "./artwork";
import { ComponentSessions, RootSessionData } from "./session-panels";

interface Props {
  compiled: ReturnType<typeof compileInteractiveArtboard>;
  machineId?: string | null;
  close(): void;
}
function TestPanel({ compiled, machineId, close }: Props) {
  const host = useRef<HTMLDivElement>(null),
    player = useRef<ReturnType<typeof createInteractiveSvgPlayer> | null>(null),
    id = useId(),
    [machine, setMachine] = useState(
      machineId ?? compiled.document.behavior.defaultMachineId ?? "",
    ),
    [ready, setReady] = useState(false),
    [runtime, setRuntime] = useState<ReturnType<typeof createInteractiveSvgPlayer> | null>(null),
    [playing, setPlaying] = useState(true),
    [error, setError] = useState(""),
    [debug, setDebug] = useState<BehaviorDebug | null>(null),
    [values, setValues] = useState(new Map<string, string | number | boolean>()),
    [events, setEvents] = useState<{
      total: number;
      rows: { id: number; name: string; time: number; direction: string; layer: string | null }[];
    }>({ total: 0, rows: [] });
  const configure = useEffectEvent((current: ReturnType<typeof createInteractiveSvgPlayer>) => {
    if (machine && current.inspect().machineId !== machine) current.setMachine(machine);
  });
  useEffect(() => {
    const svg = host.current?.querySelector("svg");
    if (!(svg instanceof SVGSVGElement)) {
      setError("Prévia SVG indisponível.");
      return;
    }
    let live = true;
    const owner = new AbortController();
    setReady(false);
    setRuntime(null);
    async function mount(svg: SVGSVGElement) {
      try {
        const current = await createInteractiveSvgPlayerAsync(
          svg,
          compiled.document,
          {
            onPlaybackChange: (playing) => {
              if (live) setPlaying(playing);
            },
            onError: (error) => {
              if (live) setError(error.message);
            },
            onStateChange: (debug) => {
              if (live) setDebug(debug);
            },
            onEvent: (event) => {
              if (live)
                setEvents((previous) => ({
                  total: previous.total + 1,
                  rows: [
                    ...previous.rows.slice(-49),
                    {
                      id: previous.total + 1,
                      name: event.name,
                      time: event.time,
                      direction: event.direction,
                      layer: event.layerId,
                    },
                  ],
                }));
            },
          },
          owner.signal,
        );
        if (!live) {
          current.destroy();
          return;
        }
        player.current = current;
        configure(current);
        const values = new Map<string, string | number | boolean>();
        for (const input of compiled.document.behavior.inputs) {
          if (input.kind === "trigger") continue;
          const value = current.getInput(input.id);
          if (value !== undefined) values.set(input.id, value);
        }
        setValues(values);
        setReady(true);
        setRuntime(current);
        setPlaying(current.playing);
        setDebug(current.inspect());
        current.onInputChange((id, value) => {
          if (live) setValues((previous) => new Map([...previous, [id, value]]));
        });
      } catch (error) {
        if (!live) return;
        setError(error instanceof Error ? error.message : "Não foi possível iniciar a máquina.");
      }
    }
    void mount(svg);
    return () => {
      live = false;
      owner.abort();
      player.current?.destroy();
      player.current = null;
    };
  }, [compiled]);
  useEffect(() => {
    if (!runtime) return;
    try {
      if (machine && runtime.inspect().machineId !== machine) runtime.setMachine(machine);
      setDebug(runtime.inspect());
      setError("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Troca de máquina recusada.");
    }
  }, [machine, runtime]);
  const action = (run: (player: ReturnType<typeof createInteractiveSvgPlayer>) => void) => {
    const current = player.current;
    if (!current) return;
    try {
      run(current);
      setDebug(current.inspect());
      setError("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Teste recusado.");
    }
  };
  return (
    <>
      <div className="dialog-heading">
        <div>
          <h2>Testar interação</h2>
          <p>Sessão isolada: inputs e poses não editam o documento.</p>
        </div>
        <button type="button" aria-label="Fechar teste" onClick={close}>
          ×
        </button>
      </div>
      <div className="behavior-test-layout">
        <div className="behavior-test-preview" ref={host}>
          <BehaviorArtwork document={compiled.document} />
        </div>
        <div className="behavior-test-controls">
          <label className="scene-field">
            Máquina em teste
            <select
              aria-label="Máquina em teste"
              value={machine}
              onChange={(event) => {
                setEvents({ total: 0, rows: [] });
                setError("");
                setMachine(event.target.value);
              }}
            >
              {compiled.document.behavior.machines.map((machine) => (
                <option key={machine.id} value={machine.id}>
                  {machine.name}
                </option>
              ))}
            </select>
          </label>
          <div className="scene-tools">
            <button
              type="button"
              disabled={!ready}
              onClick={() =>
                action((player) => {
                  if (player.playing) player.pause();
                  else player.play();
                })
              }
            >
              {playing ? "Pausar teste" : "Reproduzir teste"}
            </button>
            <button
              type="button"
              disabled={!ready}
              onClick={() =>
                action((player) => {
                  player.reset();
                  setEvents({ total: 0, rows: [] });
                })
              }
            >
              Resetar teste
            </button>
            <button
              type="button"
              disabled={!ready || playing}
              onClick={() => action((player) => player.advance(1 / 60))}
            >
              Avançar teste 1/60s
            </button>
          </div>
          <fieldset disabled={!ready}>
            <legend>Inputs ao vivo</legend>
            {compiled.document.behavior.inputs.map((input) => (
              <div className="behavior-test-input" key={input.id}>
                {input.kind === "trigger" ? (
                  <button
                    type="button"
                    onClick={() => action((player) => player.trigger(input.id))}
                  >
                    Disparar {input.name}
                  </button>
                ) : input.kind === "number" ? (
                  <label className="scene-field" htmlFor={`${id}-${input.id}`}>
                    {input.name}
                    <FormNumberField
                      id={`${id}-${input.id}`}
                      label={input.name}
                      min={String(input.min)}
                      max={String(input.max)}
                      value={
                        typeof values.get(input.id) === "number"
                          ? Number(values.get(input.id))
                          : input.initial
                      }
                      change={(raw) => {
                        if (raw.trim() && Number.isFinite(Number(raw)))
                          action((player) => player.setInput(input.id, Number(raw)));
                      }}
                    />
                  </label>
                ) : input.kind === "boolean" ? (
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={values.get(input.id) === true}
                      onChange={(event) =>
                        action((player) => player.setInput(input.id, event.target.checked))
                      }
                    />
                    {input.name}
                  </label>
                ) : input.kind === "enum" ? (
                  <label className="scene-field">
                    {input.name}
                    <select
                      value={String(values.get(input.id) ?? input.initial)}
                      onChange={(event) =>
                        action((player) => player.setInput(input.id, event.target.value))
                      }
                    >
                      {input.values.map((value) => (
                        <option key={value} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : input.kind === "color" ? (
                  <label className="scene-field">
                    {input.name}
                    <input
                      type="color"
                      value={String(values.get(input.id) ?? input.initial)}
                      onChange={(event) =>
                        action((player) => player.setInput(input.id, event.target.value))
                      }
                    />
                  </label>
                ) : (
                  <label className="scene-field">
                    {input.name}
                    <textarea
                      maxLength={10000}
                      value={String(values.get(input.id) ?? input.initial)}
                      onChange={(event) =>
                        action((player) => player.setInput(input.id, event.target.value))
                      }
                    />
                  </label>
                )}
              </div>
            ))}
          </fieldset>
          {runtime && (
            <>
              <RootSessionData player={runtime} behavior={compiled.document.behavior} />
              <ComponentSessions player={runtime} document={compiled.document} />
            </>
          )}
          <p role="alert">{error}</p>
          <h3>DIAGNÓSTICO</h3>
          <button
            type="button"
            disabled={!ready}
            onClick={() => action((player) => setDebug(player.inspect()))}
          >
            Atualizar diagnóstico
          </button>
          <div aria-live="polite">
            {runtime?.inspectRig().map((diagnostic) => (
              <p key={`${diagnostic.instancePath.join("/")}:${diagnostic.id}`}>
                IK {diagnostic.id}:{" "}
                {diagnostic.strength === 0
                  ? "desativada"
                  : diagnostic.converged
                    ? "solução convergente"
                    : "solver não atingiu o alvo"}{" "}
                · força {(diagnostic.strength * 100).toFixed(1)}% · erro aplicado{" "}
                {diagnostic.residual.toFixed(3)} · {diagnostic.iterations} iterações
              </p>
            ))}
            {debug?.layers.map((layer) => {
              const authored = compiled.document.behavior.machines
                .find((machine) => machine.id === debug.machineId)
                ?.layers.find((value) => value.id === layer.id);
              return (
                <p key={layer.id}>
                  {authored?.name}:{" "}
                  <strong>
                    {authored?.states.find((state) => state.id === layer.stateId)?.name}
                  </strong>
                  {layer.transitionId ? " · blend em andamento" : ""}
                </p>
              );
            })}
          </div>
          <h3>EVENTOS</h3>
          {!!documentAudioAssets(compiled.document).length && (
            <AudioControls
              player={runtime}
              report={(error) => setError(error.message)}
              replay={() => {
                if (runtime) {
                  runtime.reset();
                  runtime.play();
                }
              }}
            />
          )}
          <p role="status">
            {events.total} recebidos; {Math.max(0, events.total - events.rows.length)} anteriores
            fora da janela de 50.
          </p>
          <ol className="behavior-event-log">
            {events.rows.map((event) => (
              <li key={event.id}>
                {Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 }).format(event.time)}s ·{" "}
                {event.name} · {event.direction}
              </li>
            ))}
          </ol>
          <p className="micro">
            A prévia pausa fora de tela, com janela oculta ou movimento reduzido. Setas equivalem ao
            movimento de ponteiro nos alvos configurados; Enter/Espaço ativa ações. Reset limpa
            somente esta sessão.
          </p>
        </div>
      </div>
    </>
  );
}
export function mountBehaviorTest(dialog: HTMLDialogElement, props: Omit<Props, "close">) {
  let live = true;
  const root = createRoot(dialog);
  dialog.setAttribute("aria-label", "Testar interação");
  dialog.classList.add("behavior-test-dialog");
  const dispose = () => {
    if (!live) return;
    live = false;
    dialog.removeEventListener("cancel", cancel);
    root.unmount();
    dialog.classList.remove("behavior-test-dialog");
    dialog.removeAttribute("aria-label");
  };
  const close = () => {
    dispose();
    dialog.close();
  };
  const cancel = (event: Event) => {
    event.preventDefault();
    close();
  };
  dialog.addEventListener("cancel", cancel);
  flushSync(() => root.render(<TestPanel {...props} close={close} />));
  dialog.showModal();
  return dispose;
}
