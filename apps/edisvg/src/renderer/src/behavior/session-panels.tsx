import type { Behavior } from "@informach/edi-motion/behavior";
import { emptyDataModels, isDataRecord, parseDataModels } from "@informach/edi-motion/data";
import type {
  createInteractiveSvgPlayer,
  InteractiveDocument,
} from "@informach/edi-motion/runtime";
import { useEffect, useMemo, useState } from "react";
import { DataRecordFields } from "./data-record-fields";

type Player = ReturnType<typeof createInteractiveSvgPlayer>;
type Controls = Pick<
  Player,
  | "getInput"
  | "setInput"
  | "trigger"
  | "inspect"
  | "reset"
  | "setMachine"
  | "onInputChange"
  | "onDataChange"
  | "onStateChange"
  | "getData"
  | "getDataInstance"
  | "bindDataInstance"
  | "editData"
  | "dataVersion"
>;

function SessionControls({
  controls,
  behavior,
  inputs = true,
}: {
  controls: Controls;
  behavior: Behavior;
  inputs?: boolean;
}) {
  const [, redraw] = useState(0),
    [error, setError] = useState("");
  const data = useMemo(() => parseDataModels(behavior.data ?? emptyDataModels()), [behavior.data]);
  useEffect(() => {
    const changed = () => redraw((revision) => revision + 1);
    const removes = [
      controls.onInputChange(changed),
      controls.onDataChange(changed),
      controls.onStateChange(changed),
    ];
    return () => {
      for (const remove of removes) remove();
    };
  }, [controls]);
  const run = (action: () => void) => {
    try {
      action();
      redraw((revision) => revision + 1);
      setError("");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Operação de teste recusada.");
    }
  };
  const debug = controls.inspect();
  return (
    <>
      {inputs && (
        <>
          <label className="scene-field">
            Máquina da instância
            <select
              value={debug.machineId ?? ""}
              onChange={(event) => run(() => controls.setMachine(event.target.value))}
            >
              {!behavior.machines.length && <option value="">Sem máquina</option>}
              {behavior.machines.map((machine) => (
                <option key={machine.id} value={machine.id}>
                  {machine.name}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => run(() => controls.reset())}>
            Resetar esta instância
          </button>
          {behavior.inputs.map((input) => {
            if (input.kind === "trigger")
              return (
                <button
                  key={input.id}
                  type="button"
                  onClick={() => run(() => controls.trigger(input.id))}
                >
                  Disparar {input.name}
                </button>
              );
            const value = controls.getInput(input.id),
              readonly = behavior.data?.links.some(
                (link) => link.inputId === input.id && link.direction === "one-way",
              );
            return (
              <form
                key={input.id}
                onSubmit={(event) => {
                  event.preventDefault();
                  const raw = new FormData(event.currentTarget).get("value");
                  run(() =>
                    controls.setInput(
                      input.id,
                      input.kind === "boolean"
                        ? raw === "on"
                        : input.kind === "number"
                          ? typeof raw === "string" && raw.trim()
                            ? Number(raw)
                            : Number.NaN
                          : raw,
                    ),
                  );
                }}
              >
                <fieldset disabled={readonly}>
                  <legend>
                    {input.name}
                    {readonly ? " · controlado pelo modelo" : ""}
                  </legend>
                  {input.kind === "boolean" ? (
                    <input
                      key={String(value)}
                      aria-label={input.name}
                      name="value"
                      type="checkbox"
                      defaultChecked={value === true}
                    />
                  ) : input.kind === "enum" ? (
                    <select
                      key={String(value)}
                      aria-label={input.name}
                      name="value"
                      defaultValue={String(value)}
                    >
                      {input.values.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : input.kind === "string" ? (
                    <textarea
                      key={String(value)}
                      aria-label={input.name}
                      name="value"
                      maxLength={10000}
                      defaultValue={String(value)}
                    />
                  ) : (
                    <input
                      key={String(value)}
                      aria-label={input.name}
                      name="value"
                      type={input.kind === "number" ? "number" : "color"}
                      step="any"
                      min={input.kind === "number" ? input.min : undefined}
                      max={input.kind === "number" ? input.max : undefined}
                      defaultValue={String(value)}
                    />
                  )}
                  <button type="submit">Aplicar {input.name}</button>
                </fieldset>
              </form>
            );
          })}
          <button type="button" onClick={() => redraw((revision) => revision + 1)}>
            Atualizar relógio e estados
          </button>
          <p>
            {debug.time.toFixed(3)}s ·{" "}
            {debug.layers
              .map(
                (layer) => `${layer.id}: ${layer.stateId}${layer.transitionId ? " (blend)" : ""}`,
              )
              .join(" · ") || "Sem camadas"}
          </p>
        </>
      )}
      {behavior.data?.context && (
        <label className="scene-field">
          Instância ligada à prancheta
          <select
            aria-label="Instância ligada à prancheta"
            value={controls.getDataInstance() ?? ""}
            onChange={(event) => run(() => controls.bindDataInstance(event.target.value))}
          >
            {behavior.data.instances
              .filter((instance) => instance.modelId === behavior.data?.context?.modelId)
              .map((instance) => (
                <option key={instance.id} value={instance.id}>
                  {instance.name}
                </option>
              ))}
          </select>
        </label>
      )}
      {behavior.data?.instances.map((instance) => {
        const value = controls.getData(instance.id);
        return (
          <details key={instance.id}>
            <summary>{instance.name} · dados da sessão</summary>
            {isDataRecord(value) ? (
              <DataRecordFields
                key={controls.dataVersion}
                context={data}
                instanceId={instance.id}
                modelId={instance.modelId}
                value={value}
                change={(changes) => run(() => controls.editData(changes))}
              />
            ) : (
              <p role="alert">Instância inválida.</p>
            )}
          </details>
        );
      })}
      <p role="alert">{error}</p>
    </>
  );
}
export function RootSessionData({ player, behavior }: { player: Player; behavior: Behavior }) {
  return behavior.data?.instances.length ? (
    <details>
      <summary>Modelos e listas ao vivo</summary>
      <SessionControls controls={player} behavior={behavior} inputs={false} />
    </details>
  ) : null;
}
function ComponentSession({
  player,
  path,
  document,
  name,
}: {
  player: Player;
  path: string[];
  document: InteractiveDocument;
  name: string;
}) {
  const [open, setOpen] = useState(false),
    controls = useMemo(() => player.getComponent(path), [player, path]);
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>
        {name} · {path.join(" / ")}
      </summary>
      {open && <SessionControls controls={controls} behavior={document.behavior} />}
    </details>
  );
}
export function ComponentSessions({
  player,
  document,
}: {
  player: Player;
  document: InteractiveDocument;
}) {
  const scopes = useMemo(() => {
    const result: { path: string[]; document: InteractiveDocument; name: string }[] = [];
    function visit(document: InteractiveDocument, path: string[]) {
      for (const component of document.components ?? []) {
        const next = [...path, ...component.instancePath];
        result.push({
          path: next,
          document: component.document,
          name:
            document.content.find((object) => object.id === component.instanceId)?.name ??
            "Componente",
        });
        visit(component.document, next);
      }
    }
    visit(document, []);
    return result;
  }, [document]);
  return scopes.length ? (
    <section aria-label="Sessões de componentes">
      <h3>COMPONENTES INDEPENDENTES</h3>
      {scopes.map((scope) => (
        <ComponentSession key={JSON.stringify(scope.path)} {...scope} player={player} />
      ))}
    </section>
  ) : null;
}
