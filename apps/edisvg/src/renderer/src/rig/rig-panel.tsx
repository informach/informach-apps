import type { Animation } from "@informach/edi-motion";
import { rigOwners, upgradeRigVersion } from "@informach/edi-motion/rig";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { Artboard } from "../../../shared/project";
import type { RigCommand } from "../../../shared/rig";
import { flattenScene } from "../../../shared/scene.js";
import { ConstraintEditor, numberValue, textValue } from "./constraint-editor";
import { DeformationEditor } from "./deformation-editor";
import { JoystickEditor, type JoystickFocus } from "./joystick-editor";
import { RigParameterEditor, type RigParameterFocus } from "./parameter-editor";
import { SkinEditor } from "./skin-editor";
import { TrimEditor } from "./trim-editor";
import type { JoystickPreview } from "./use-joystick-pad";

export interface RigFocus {
  open?: boolean;
  constraintId?: string;
  parameters?: RigParameterFocus;
  skinVertex?: number;
  joystick?: JoystickFocus;
}
interface Props {
  selectVertex(index: number): void;
  animations: readonly Animation[];
  activeAnimationId?: string;
  frame: number;
  showBones: boolean;
  showBonesChanged(value: boolean): void;
  board: Artboard;
  selectedId: string | null;
  selectedIds: string[];
  focus?: RigFocus;
  focusChanged(value: RigFocus): void;
  execute(command: RigCommand, focus?: RigFocus): void;
  select(id: string): void;
  test(): void;
  previewJoystick: JoystickPreview;
}
function RigPanel({
  selectVertex,
  animations,
  activeAnimationId,
  frame,
  board,
  selectedId,
  selectedIds,
  focus,
  focusChanged,
  execute,
  select,
  test,
  showBones,
  showBonesChanged,
  previewJoystick,
}: Props) {
  const rig = board.rig ?? { version: 1, bones: [], constraints: [], targets: [] },
    entries = flattenScene(board.scene),
    selectedBone = rig.bones.find((bone) => bone.targetId === selectedId),
    [open, setOpen] = useState(focus?.open ?? false),
    [parentId, setParentId] = useState(selectedBone?.targetId ?? ""),
    [constraintId, setConstraintId] = useState(focus?.constraintId ?? ""),
    [error, setError] = useState("");
  const report = (error: unknown) =>
    setError(error instanceof Error ? error.message : "Operação de rig recusada.");
  const run = (command: RigCommand, nextFocus?: RigFocus) => {
    try {
      execute(command, nextFocus);
      setError("");
    } catch (error) {
      report(error);
    }
  };
  const parentBone = rig.bones.find((bone) => bone.targetId === parentId),
    constraint = rig.constraints.find((constraint) => constraint.id === constraintId);
  return (
    <details
      className="rig-panel"
      open={open}
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
        focusChanged({ open: event.currentTarget.open, constraintId });
      }}
    >
      <summary>
        Rig · {rig.bones.length} ossos · {rig.constraints.length} restrições
      </summary>
      {open && (
        <>
          <label className="check-row">
            <input
              type="checkbox"
              checked={showBones}
              onChange={(event) => showBonesChanged(event.target.checked)}
            />
            Mostrar ossos, alvos e malha selecionada no canvas
          </label>
          <p className="micro">
            Design edita a pose de referência; Animar grava poses e resolve restrições. Arte
            vinculada conserva a pose de referência, passando a receber o movimento do osso.
          </p>
          <fieldset>
            <legend>Ossos e alvos</legend>
            <select
              aria-label="Selecionar osso ou alvo"
              value={
                selectedBone?.targetId ??
                (rig.targets.includes(selectedId ?? "") ? (selectedId ?? "") : "")
              }
              onChange={(event) => {
                if (event.target.value) select(event.target.value);
              }}
            >
              <option value="">Selecionar…</option>
              {[...rig.bones.map((bone) => bone.targetId), ...rig.targets].map((id) => (
                <option key={id} value={id}>
                  {entries.find(({ node }) => node.id === id)?.node.name}
                </option>
              ))}
            </select>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                try {
                  const data = new FormData(event.currentTarget);
                  run({
                    type: "rig",
                    operation: "create-bone",
                    id: `node-${crypto.randomUUID()}`,
                    name: textValue(data, "name"),
                    parentId: parentId || null,
                    x: numberValue(data, "x"),
                    y: numberValue(data, "y"),
                    rotation: numberValue(data, "rotation"),
                    length: numberValue(data, "length"),
                  });
                } catch (error) {
                  report(error);
                }
              }}
            >
              <label className="scene-field">
                Nome do osso
                <input
                  name="name"
                  aria-label="Nome do osso"
                  defaultValue="Osso"
                  maxLength={120}
                  required
                />
              </label>
              <label className="scene-field">
                Pai do novo osso
                <select
                  aria-label="Pai do novo osso"
                  value={parentId}
                  onChange={(event) => setParentId(event.target.value)}
                >
                  <option value="">Raiz</option>
                  {entries
                    .filter(({ node, locked }) => node.tag === "g" && !node.instance && !locked)
                    .map(({ node }) => (
                      <option key={node.id} value={node.id}>
                        {node.name}
                      </option>
                    ))}
                </select>
              </label>
              {(["x", "y", "rotation", "length"] as const).map((field) => (
                <label key={`${field}-${parentId}`} className="scene-field">
                  {{ x: "X", y: "Y", rotation: "Rotação (°)", length: "Comprimento" }[field]}
                  <input
                    name={field}
                    aria-label={`Novo osso ${field}`}
                    type="number"
                    step="any"
                    min={field === "length" ? 0.000001 : -10000}
                    max={10000}
                    defaultValue={
                      field === "length"
                        ? 100
                        : field === "x"
                          ? (parentBone?.length ??
                            (parentId ? 0 : board.scene.viewBox[0] + board.scene.viewBox[2] / 2))
                          : field === "y"
                            ? parentId
                              ? 0
                              : board.scene.viewBox[1] + board.scene.viewBox[3] / 2
                            : 0
                    }
                    required
                  />
                </label>
              ))}
              <button type="submit">Criar osso</button>
            </form>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                try {
                  const data = new FormData(event.currentTarget);
                  run({
                    type: "rig",
                    operation: "create-target",
                    id: `node-${crypto.randomUUID()}`,
                    name: textValue(data, "name"),
                    x: numberValue(data, "x"),
                    y: numberValue(data, "y"),
                  });
                } catch (error) {
                  report(error);
                }
              }}
            >
              <label className="scene-field">
                Nome do alvo
                <input
                  name="name"
                  aria-label="Nome do alvo"
                  defaultValue="Alvo"
                  maxLength={120}
                  required
                />
              </label>
              <label className="scene-field">
                Alvo X
                <input
                  name="x"
                  aria-label="Novo alvo X"
                  type="number"
                  min="-10000"
                  max="10000"
                  step="any"
                  defaultValue={board.scene.viewBox[0] + board.scene.viewBox[2] / 2 + 100}
                  required
                />
              </label>
              <label className="scene-field">
                Alvo Y
                <input
                  name="y"
                  aria-label="Novo alvo Y"
                  type="number"
                  min="-10000"
                  max="10000"
                  step="any"
                  defaultValue={board.scene.viewBox[1] + board.scene.viewBox[3] / 2 + 100}
                  required
                />
              </label>
              <button type="submit">Criar alvo</button>
            </form>
          </fieldset>
          {selectedBone && (
            <form
              key={selectedBone.targetId}
              onSubmit={(event) => {
                event.preventDefault();
                try {
                  const data = new FormData(event.currentTarget);
                  run({
                    type: "rig",
                    operation: "update-bone",
                    targetId: selectedBone.targetId,
                    length: numberValue(data, "length"),
                    minRotation: numberValue(data, "minRotation"),
                    maxRotation: numberValue(data, "maxRotation"),
                  });
                } catch (error) {
                  report(error);
                }
              }}
            >
              <fieldset>
                <legend>Osso selecionado</legend>
                {(["length", "minRotation", "maxRotation"] as const).map((field) => (
                  <label className="scene-field" key={field}>
                    {
                      {
                        length: "Comprimento",
                        minRotation: "Rotação mínima (°)",
                        maxRotation: "Rotação máxima (°)",
                      }[field]
                    }
                    <input
                      aria-label={`Osso ${field}`}
                      name={field}
                      type="number"
                      min={field === "length" ? 0.000001 : -10000}
                      max={10000}
                      step="any"
                      defaultValue={selectedBone[field]}
                      required
                    />
                  </label>
                ))}
                <button type="submit">Aplicar osso</button>
                <button
                  type="button"
                  onClick={() =>
                    run({
                      type: "rig",
                      operation: "unregister-bone",
                      targetId: selectedBone.targetId,
                    })
                  }
                >
                  Remover osso, manter grupo/arte
                </button>
              </fieldset>
            </form>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              try {
                const data = new FormData(event.currentTarget);
                if (!data.has("confirm"))
                  throw new Error("Confirme a mudança de influência da animação.");
                run({
                  type: "rig",
                  operation: "bind",
                  boneId: textValue(data, "bone"),
                  targetIds: selectedIds,
                  confirmRestPose: true,
                });
              } catch (error) {
                report(error);
              }
            }}
          >
            <fieldset disabled={!rig.bones.length || !selectedIds.length}>
              <legend>Vínculo rígido da seleção</legend>
              <select
                name="bone"
                aria-label="Osso para vincular arte"
                defaultValue={selectedBone?.targetId ?? rig.bones[0]?.targetId}
              >
                {rig.bones.map((bone) => (
                  <option key={bone.targetId} value={bone.targetId}>
                    {entries.find(({ node }) => node.id === bone.targetId)?.node.name}
                  </option>
                ))}
              </select>
              <label className="check-row">
                <input name="confirm" type="checkbox" required />
                Preservar pose de referência; alterar a influência futura.
              </label>
              <button type="submit">Vincular arte selecionada</button>
            </fieldset>
          </form>
          <h3>RESTRIÇÕES</h3>
          <select
            aria-label="Editar restrição"
            value={constraintId}
            onChange={(event) => {
              setConstraintId(event.target.value);
              focusChanged({ open, constraintId: event.target.value });
            }}
          >
            <option value="">Nova restrição</option>
            {rig.constraints.map((value) => (
              <option key={value.id} value={value.id}>
                {value.kind} · {value.id}
              </option>
            ))}
          </select>
          <ConstraintEditor
            key={constraintId || `new-${selectedId}`}
            board={board}
            rig={rig}
            value={constraint}
            report={report}
            save={(value) =>
              run(
                {
                  type: "rig",
                  operation: "replace",
                  value: {
                    ...rig,
                    version: upgradeRigVersion(rig.version, value.kind === "path" ? 2 : 1),
                    constraints: rig.constraints.some((constraint) => constraint.id === value.id)
                      ? rig.constraints.map((constraint) =>
                          constraint.id === value.id ? value : constraint,
                        )
                      : [...rig.constraints, value],
                  },
                },
                { open: true, constraintId: value.id },
              )
            }
          />
          {constraint && (
            <button
              type="button"
              onClick={() =>
                run(
                  {
                    type: "rig",
                    operation: "replace",
                    value: {
                      ...rig,
                      constraints: rig.constraints.filter((value) => value.id !== constraint.id),
                    },
                  },
                  { open: true, constraintId: "" },
                )
              }
            >
              Excluir restrição
            </button>
          )}
          {constraint && (
            <div className="rig-order">
              {([-1, 1] as const).map((direction) => (
                <button
                  key={direction}
                  type="button"
                  disabled={
                    direction < 0
                      ? rig.constraints[0]?.id === constraint.id
                      : rig.constraints.at(-1)?.id === constraint.id
                  }
                  onClick={() => {
                    const constraints = [...rig.constraints],
                      index = constraints.findIndex((value) => value.id === constraint.id),
                      other = constraints[index + direction];
                    if (!other) return;
                    constraints[index] = other;
                    constraints[index + direction] = constraint;
                    run(
                      { type: "rig", operation: "replace", value: { ...rig, constraints } },
                      { open: true, constraintId: constraint.id },
                    );
                  }}
                >
                  {direction < 0 ? "Antecipar restrição" : "Adiar restrição"}
                </button>
              ))}
            </div>
          )}
          <JoystickEditor
            board={board}
            rig={rig}
            selectedId={selectedId}
            focus={focus?.joystick}
            focusChanged={(joystick) => focusChanged({ open, constraintId, joystick })}
            preview={previewJoystick}
            report={report}
            save={(value, joystick) =>
              execute(
                { type: "rig", operation: "replace", value },
                { open: true, constraintId, joystick },
              )
            }
          />
          <RigParameterEditor
            rig={rig}
            animations={animations}
            initialAnimationId={activeAnimationId}
            frame={frame}
            focus={focus?.parameters}
            focusChanged={(parameters) => focusChanged({ open, constraintId, parameters })}
            save={(value, parameters) =>
              run(
                { type: "rig", operation: "replace", value },
                { open: true, constraintId, parameters },
              )
            }
            report={report}
          />
          <DeformationEditor
            board={board}
            rig={rig}
            selectedId={selectedId}
            save={(value) =>
              run({ type: "rig", operation: "replace", value }, { open: true, constraintId })
            }
            report={report}
          />
          <SkinEditor
            board={board}
            rig={rig}
            selectedId={selectedId}
            vertexIndex={focus?.skinVertex ?? 0}
            selectVertex={selectVertex}
            execute={(command) => run(command, { open: true, constraintId })}
            report={report}
          />
          <TrimEditor
            board={board}
            rig={rig}
            selectedId={selectedId}
            save={(value) =>
              run({ type: "rig", operation: "replace", value }, { open: true, constraintId })
            }
            report={report}
          />
          <button type="button" disabled={!rigOwners(rig).size} onClick={test}>
            Testar rig
          </button>
          <p role="alert">{error}</p>
        </>
      )}
    </details>
  );
}
export function mountRigPanel(host: Element, props: Props) {
  const root = createRoot(host);
  root.render(<RigPanel {...props} />);
  return () => root.unmount();
}
