import { joystickSchema, type RigDocument, upgradeRigVersion } from "@informach/edi-motion/rig";
import { useState } from "react";
import type { Artboard } from "../../../shared/project";
import { flattenScene } from "../../../shared/scene.js";
import { numberValue, textValue } from "./constraint-editor";
import { JoystickPad, type JoystickRestore } from "./joystick-pad";
import type { JoystickPreview } from "./use-joystick-pad";

export interface JoystickFocus {
  id: string;
  restore?: JoystickRestore;
}
export function JoystickEditor({
  board,
  rig,
  selectedId,
  focus,
  focusChanged,
  preview,
  save,
  report,
}: {
  board: Artboard;
  rig: RigDocument;
  selectedId: string | null;
  focus?: JoystickFocus;
  focusChanged(value: JoystickFocus): void;
  preview: JoystickPreview;
  save(value: RigDocument, focus: JoystickFocus): void;
  report(error: unknown): void;
}) {
  const entries = flattenScene(board.scene),
    [id, setId] = useState(
      focus?.id ?? rig.joysticks?.find((item) => item.targetId === selectedId)?.id ?? "",
    ),
    current = rig.joysticks?.find((item) => item.id === id),
    target = entries.find(({ node }) => node.id === current?.targetId),
    available = entries.filter(
      ({ node, parentId, locked }) =>
        node.tag === "g" &&
        !node.instance &&
        !parentId &&
        !locked &&
        rig.targets.includes(node.id) &&
        !rig.joysticks?.some((item) => item.targetId === node.id),
    ),
    locked = !target || target.locked;
  return (
    <section aria-label="Joysticks 2D">
      <h3>JOYSTICKS 2D</h3>
      <p className="micro">
        Um controlador por alvo raiz. O envelope desloca o centro animado antes de IK/restrições,
        sem alterar a pose de referência ou recapturar vínculos.
      </p>
      <label className="scene-field">
        Controlador
        <select
          aria-label="Editar joystick"
          value={id}
          onChange={(event) => {
            preview(null);
            setId(event.currentTarget.value);
            focusChanged({ id: event.currentTarget.value });
          }}
        >
          <option value="">Novo joystick</option>
          {rig.joysticks?.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <form
        key={current?.id ?? "new"}
        onSubmit={(event) => {
          event.preventDefault();
          try {
            const data = new FormData(event.currentTarget),
              value = joystickSchema.parse({
                id: current?.id ?? `joystick-${crypto.randomUUID()}`,
                name: textValue(data, "name"),
                targetId: current?.targetId ?? textValue(data, "target"),
                x: current?.x ?? 0,
                y: current?.y ?? 0,
                rangeX: numberValue(data, "rangeX"),
                rangeY: numberValue(data, "rangeY"),
                limit: data.get("limit"),
              });
            preview(null);
            save(
              {
                ...rig,
                version: upgradeRigVersion(rig.version, 4),
                joysticks: [...(rig.joysticks ?? []).filter((item) => item.id !== value.id), value],
              },
              { id: value.id },
            );
          } catch (error) {
            report(error);
          }
        }}
      >
        <fieldset
          disabled={current ? locked : !available.length || (rig.joysticks?.length ?? 0) >= 256}
        >
          <legend>{current ? "Envelope do controlador" : "Criar controlador"}</legend>
          <label className="scene-field">
            Nome
            <input
              name="name"
              aria-label="Nome do joystick"
              defaultValue={current?.name ?? "Joystick"}
              required
              maxLength={120}
            />
          </label>
          {current ? (
            <p className="micro">Alvo: {target?.node.name ?? current.targetId}</p>
          ) : (
            <label className="scene-field">
              Alvo raiz
              <select
                name="target"
                aria-label="Alvo do joystick"
                defaultValue={
                  available.find(({ node }) => node.id === selectedId)?.node.id ??
                  available[0]?.node.id
                }
                required
              >
                {available.map(({ node }) => (
                  <option key={node.id} value={node.id}>
                    {node.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {(["rangeX", "rangeY"] as const).map((axis) => (
            <label className="scene-field" key={axis}>
              Extensão {axis === "rangeX" ? "X" : "Y"} (unidades locais)
              <input
                name={axis}
                aria-label={`Extensão do joystick ${axis === "rangeX" ? "X" : "Y"}`}
                type="number"
                step="any"
                min="0.000001"
                max="10000"
                required
                defaultValue={current?.[axis] ?? 100}
              />
            </label>
          ))}
          <label className="scene-field">
            Limite
            <select
              name="limit"
              aria-label="Limite do joystick"
              defaultValue={current?.limit ?? "circle"}
            >
              <option value="circle">Circular (elipse em unidades locais)</option>
              <option value="square">Quadrado (retângulo em unidades locais)</option>
            </select>
          </label>
          <button type="submit">{current ? "Atualizar joystick" : "Adicionar joystick"}</button>
        </fieldset>
      </form>
      {!current && !available.length && (
        <p className="micro">Crie um alvo raiz livre e desbloqueado em Ossos e alvos.</p>
      )}
      {current && (
        <>
          <JoystickPad
            key={current.id}
            value={current}
            disabled={locked}
            preview={preview}
            restore={focus?.id === current.id ? focus.restore : undefined}
            restored={() => focusChanged({ id: current.id })}
            report={report}
            commit={(point, restore) =>
              save(
                {
                  ...rig,
                  joysticks: rig.joysticks?.map((item) =>
                    item.id === current.id ? { ...item, ...point } : item,
                  ),
                },
                { id: current.id, restore },
              )
            }
          />
          <button
            type="button"
            disabled={locked}
            onClick={() => {
              try {
                preview(null);
                save(
                  { ...rig, joysticks: rig.joysticks?.filter((item) => item.id !== current.id) },
                  { id: "" },
                );
              } catch (error) {
                report(error);
              }
            }}
          >
            Remover joystick
          </button>
          <p className="micro">
            Remova canais e bindings dependentes explicitamente antes de excluir. Alvo bloqueado
            impede alterações.
          </p>
        </>
      )}
    </section>
  );
}
