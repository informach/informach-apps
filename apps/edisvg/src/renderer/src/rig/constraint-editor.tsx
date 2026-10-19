import type { RigConstraint, RigDocument } from "@informach/edi-motion/rig";
import { useState } from "react";
import type { Artboard } from "../../../shared/project";
import { flattenScene } from "../../../shared/scene.js";
import { numberValue, textValue } from "../form-values";

export { numberValue, textValue } from "../form-values";
export function ConstraintEditor({
  board,
  rig,
  value,
  save,
  report,
}: {
  board: Artboard;
  rig: RigDocument;
  value?: RigConstraint;
  save(value: RigConstraint): void;
  report(error: unknown): void;
}) {
  const [kind, setKind] = useState(value?.kind ?? (rig.bones.length > 1 ? "ik" : "distance")),
    entries = flattenScene(board.scene),
    owner = value
      ? value.kind === "ik"
        ? value.chain.at(-1)
        : value.ownerId
      : (rig.bones.at(-1)?.targetId ?? entries[0]?.node.id),
    target =
      value?.targetId ?? rig.targets[0] ?? entries.find(({ node }) => node.id !== owner)?.node.id;
  const channels = ["x", "y", "rotation", "sx", "sy", "skewX"] as const;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        try {
          const data = new FormData(event.currentTarget),
            base = {
              id: value?.id ?? `constraint-${crypto.randomUUID()}`,
              targetId: textValue(data, "target"),
              strength: numberValue(data, "strength") / 100,
            },
            ownerId = textValue(data, "owner");
          if (kind === "ik") {
            const count = numberValue(data, "count"),
              chain: string[] = [];
            if (!Number.isInteger(count) || count < 1 || count > 8)
              throw new Error("Cadeia deve ter de 1 a 8 ossos.");
            let cursor: string | null = ownerId;
            while (chain.length < count) {
              if (!cursor || !rig.bones.some((bone) => bone.targetId === cursor))
                throw new Error("Não há ossos contíguos suficientes nesta cadeia.");
              chain.unshift(cursor);
              cursor = entries.find(({ node }) => node.id === cursor)?.parentId ?? null;
            }
            const bend = textValue(data, "bend");
            if (bend !== "positive" && bend !== "negative") throw new Error("Dobra inválida.");
            save({
              ...base,
              kind: "ik",
              chain,
              bend,
              tolerance: numberValue(data, "tolerance"),
              iterations: numberValue(data, "iterations"),
            });
          } else if (kind === "distance")
            save({
              ...base,
              kind: "distance",
              ownerId,
              min: numberValue(data, "min"),
              max: numberValue(data, "max"),
            });
          else if (kind === "path")
            save({
              ...base,
              kind: "path",
              ownerId,
              contour: numberValue(data, "contour"),
              progress: numberValue(data, "progress") / 100,
              orient: data.has("orient"),
              rotationOffset: numberValue(data, "rotationOffset"),
              offset: numberValue(data, "offset"),
              tolerance: numberValue(data, "tolerance"),
            });
          else {
            const space = textValue(data, "space");
            if (space !== "local" && space !== "world") throw new Error("Espaço inválido.");
            save({
              ...base,
              kind: "transform",
              ownerId,
              space,
              channels: channels.filter((channel) => data.has(`channel-${channel}`)),
              offset: {
                x: numberValue(data, "offset-x"),
                y: numberValue(data, "offset-y"),
                rotation: numberValue(data, "offset-rotation"),
                sx: numberValue(data, "offset-sx"),
                sy: numberValue(data, "offset-sy"),
              },
            });
          }
        } catch (error) {
          report(error);
        }
      }}
    >
      <label className="scene-field">
        Tipo de restrição
        <select
          aria-label="Tipo de restrição"
          value={kind}
          onChange={(event) => {
            const kind = event.target.value;
            if (kind === "ik" || kind === "distance" || kind === "transform" || kind === "path")
              setKind(kind);
          }}
        >
          <option value="ik">IK</option>
          <option value="distance">Distância</option>
          <option value="transform">Copiar transformação</option>
          <option value="path">Seguir caminho</option>
        </select>
      </label>
      <label className="scene-field">
        {kind === "ik" ? "Último osso da cadeia" : "Objeto afetado"}
        <select
          name="owner"
          aria-label="Objeto afetado pela restrição"
          defaultValue={owner}
          required
        >
          {entries
            .filter(
              ({ node }) => kind !== "ik" || rig.bones.some((bone) => bone.targetId === node.id),
            )
            .map(({ node }) => (
              <option key={node.id} value={node.id}>
                {node.name}
              </option>
            ))}
        </select>
      </label>
      <label className="scene-field">
        Alvo
        <select name="target" aria-label="Alvo da restrição" defaultValue={target} required>
          {entries.map(({ node }) => (
            <option key={node.id} value={node.id}>
              {node.name}
            </option>
          ))}
        </select>
      </label>
      <label className="scene-field">
        Força (%)
        <input
          name="strength"
          aria-label="Força da restrição"
          type="number"
          min="0"
          max="100"
          step="any"
          defaultValue={(value?.strength ?? 1) * 100}
          required
        />
      </label>
      {kind === "ik" ? (
        <>
          <label className="scene-field">
            Quantidade de ossos
            <input
              name="count"
              aria-label="Quantidade de ossos"
              type="number"
              min="1"
              max="8"
              defaultValue={
                value?.kind === "ik" ? value.chain.length : Math.min(2, rig.bones.length)
              }
              required
            />
          </label>
          <label className="scene-field">
            Sentido da dobra
            <select name="bend" defaultValue={value?.kind === "ik" ? value.bend : "positive"}>
              <option value="positive">Positivo</option>
              <option value="negative">Negativo</option>
            </select>
          </label>
          <label className="scene-field">
            Tolerância (unidades)
            <input
              name="tolerance"
              type="number"
              min="0.000001"
              max="100"
              step="any"
              defaultValue={value?.kind === "ik" ? value.tolerance : 0.01}
              required
            />
          </label>
          <label className="scene-field">
            Iterações máximas
            <input
              name="iterations"
              type="number"
              min="1"
              max="128"
              defaultValue={value?.kind === "ik" ? value.iterations : 64}
              required
            />
          </label>
          <p className="micro">
            IK usa ossos contíguos, pivôs neutros e escala uniforme positiva. Limites/alcance podem
            impedir convergência; Testar mostra o erro residual. FK não depende desse perfil.
          </p>
        </>
      ) : kind === "distance" ? (
        <>
          <label className="scene-field">
            Distância mínima
            <input
              name="min"
              type="number"
              min="0"
              max="100000"
              step="any"
              defaultValue={value?.kind === "distance" ? value.min : 100}
              required
            />
          </label>
          <label className="scene-field">
            Distância máxima
            <input
              name="max"
              type="number"
              min="0"
              max="100000"
              step="any"
              defaultValue={value?.kind === "distance" ? value.max : 100}
              required
            />
          </label>
        </>
      ) : kind === "path" ? (
        <>
          <p className="micro">
            Alvo deve ser um caminho vetorial. O progresso percorre seu comprimento no espaço da
            prancheta; os contornos são numerados a partir de zero.
          </p>
          <label className="scene-field">
            Contorno
            <input
              aria-label="Contorno do caminho"
              name="contour"
              type="number"
              min="0"
              max="3999"
              step="1"
              defaultValue={value?.kind === "path" ? value.contour : 0}
              required
            />
          </label>
          <label className="scene-field">
            Progresso (%)
            <input
              aria-label="Progresso do caminho (%)"
              name="progress"
              type="number"
              min="0"
              max="100"
              step="any"
              defaultValue={value?.kind === "path" ? value.progress * 100 : 0}
              required
            />
          </label>
          <label className="check-row">
            <input
              name="orient"
              type="checkbox"
              defaultChecked={value?.kind === "path" ? value.orient : true}
            />
            Orientar pelo caminho
          </label>
          <label className="scene-field">
            Rotação adicional (°)
            <input
              name="rotationOffset"
              type="number"
              min="-10000"
              max="10000"
              step="any"
              defaultValue={value?.kind === "path" ? value.rotationOffset : 0}
              required
            />
          </label>
          <label className="scene-field">
            Deslocamento normal
            <input
              name="offset"
              type="number"
              min="-10000"
              max="10000"
              step="any"
              defaultValue={value?.kind === "path" ? value.offset : 0}
              required
            />
          </label>
          <label className="scene-field">
            Tolerância de comprimento
            <input
              name="tolerance"
              type="number"
              min="0.000001"
              max="100"
              step="any"
              defaultValue={value?.kind === "path" ? value.tolerance : 0.01}
              required
            />
          </label>
        </>
      ) : (
        <>
          <label className="scene-field">
            Espaço
            <select name="space" defaultValue={value?.kind === "transform" ? value.space : "world"}>
              <option value="world">Artboard (global)</option>
              <option value="local">Local</option>
            </select>
          </label>
          <fieldset>
            <legend>Canais copiados</legend>
            {channels.map((channel) => (
              <label className="check-row" key={channel}>
                <input
                  name={`channel-${channel}`}
                  type="checkbox"
                  defaultChecked={
                    value?.kind === "transform"
                      ? value.channels.includes(channel)
                      : channel === "x" || channel === "y" || channel === "rotation"
                  }
                />
                {channel}
              </label>
            ))}
          </fieldset>
          {(["x", "y", "rotation", "sx", "sy"] as const).map((channel) => (
            <label className="scene-field" key={channel}>
              Offset {channel}
              <input
                name={`offset-${channel}`}
                type="number"
                min={channel === "sx" || channel === "sy" ? -20 : -10000}
                max={channel === "sx" || channel === "sy" ? 20 : 10000}
                step="any"
                defaultValue={
                  value?.kind === "transform"
                    ? value.offset[channel]
                    : channel === "sx" || channel === "sy"
                      ? 1
                      : 0
                }
                required
              />
            </label>
          ))}
        </>
      )}
      <button type="submit">{value ? "Aplicar restrição" : "Adicionar restrição"}</button>
    </form>
  );
}
