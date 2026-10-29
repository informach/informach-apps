import {
  type RigDocument,
  type RigTrim,
  trimSchema,
  upgradeRigVersion,
} from "@informach/edi-motion/rig";
import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { Artboard } from "../../shared/project";
import type { SceneNode } from "../../shared/sceneTypes";
import { ScrubField } from "./inspector-field";

interface Props {
  board: Artboard;
  node: SceneNode;
  locked: boolean;
  execute(command: { type: "rig"; operation: "replace"; value: RigDocument }): void;
  /** Paints a trim on the canvas without saving; null restores the stored one. */
  previewTrim(trim: RigTrim | null): void;
}

const emptyRig = (): RigDocument => ({ version: 1, bones: [], constraints: [], targets: [] });

// The stored offset is in degrees (360° = one turn around the path); the
// inspector shows it as a percentage of the path, like start and end.
const offsetPercent = (degrees: number) => degrees / 3.6;

function PathEffectsPanel({ board, node, locked, execute, previewTrim }: Props) {
  const [error, setError] = useState("");
  const rig = board.rig ?? emptyRig(),
    trim = rig.trims?.find((value) => value.targetId === node.id),
    nativeArc = /[aA]/.test(node.attrs.d ?? "");

  const save = (trims: RigTrim[]) => {
    try {
      setError("");
      execute({
        type: "rig",
        operation: "replace",
        value: {
          ...rig,
          version: upgradeRigVersion(rig.version, 3),
          trims: trims.map((value) => trimSchema.parse(value)),
        },
      });
    } catch (reason) {
      previewTrim(null);
      setError(reason instanceof Error ? reason.message : "Efeito recusado.");
    }
  };
  const others = (rig.trims ?? []).filter((value) => value.id !== trim?.id);
  const update = (patch: Partial<RigTrim>) => {
    if (!trim) return;
    save([...others, { ...trim, ...patch }]);
  };
  const field = (
    label: string,
    shortLabel: string,
    key: "start" | "end" | "offset",
    min: number,
    max: number,
  ) => {
    if (!trim) return null;
    const toStored = (percent: number) => (key === "offset" ? percent * 3.6 : percent / 100);
    const shown = key === "offset" ? offsetPercent(trim.offset) : trim[key] * 100;
    return (
      <div className="artboard-transform-row">
        <span>{shortLabel}</span>
        <ScrubField
          label={label}
          shortLabel={key === "offset" ? "↻" : "◔"}
          value={shown}
          min={min}
          max={max}
          unit="%"
          disabled={locked}
          onError={setError}
          onCommit={(input) => {
            const value = input.valueAsNumber;
            if (!Number.isFinite(value) || value < min || value > max) {
              input.value = String(shown);
              setError(`${shortLabel} deve estar entre ${min}% e ${max}%.`);
              return;
            }
            if (value !== shown) update({ [key]: toStored(value) });
          }}
          preview={(value, final) => {
            const next = { ...trim, [key]: toStored(value) };
            if (final) update(next);
            else previewTrim(next);
          }}
        />
      </div>
    );
  };

  if (node.tag !== "path")
    return (
      <section className="artboard-inspector artboard-inspector-section path-effects">
        <div className="artboard-inspector-title">
          <h3>Efeitos de caminho</h3>
        </div>
        <p className="micro">Converta a forma em caminho (seção Caminho) para usar o trim.</p>
      </section>
    );
  return (
    <section
      className="artboard-inspector artboard-inspector-section path-effects"
      aria-label="Efeitos de caminho"
    >
      <div className="artboard-inspector-title">
        <h3>Efeitos de caminho</h3>
        {!trim && (
          <button
            type="button"
            aria-label="Adicionar trim"
            title={
              nativeArc
                ? "Converta os arcos SVG em curvas Bézier na seção Caminho antes do trim"
                : "Adicionar trim"
            }
            disabled={locked || nativeArc}
            onClick={() =>
              save([
                ...others,
                {
                  id: `trim-${crypto.randomUUID()}`,
                  targetId: node.id,
                  start: 0,
                  end: 1,
                  offset: 0,
                  tolerance: 0.01,
                  mode: "sequential",
                },
              ])
            }
          >
            +
          </button>
        )}
      </div>
      {trim && (
        <div className="path-effect-card">
          <div className="artboard-inspector-title">
            <h3>Trim</h3>
            <button
              type="button"
              aria-label="Remover trim"
              title="Remover trim"
              disabled={locked}
              onClick={() => save(others)}
            >
              ×
            </button>
          </div>
          <div className="artboard-transform-row">
            <span>Modo</span>
            <select
              className="artboard-select-inline"
              aria-label="Modo do trim"
              value={trim.mode}
              disabled={locked}
              onChange={(event) => update({ mode: event.target.value as RigTrim["mode"] })}
            >
              <option value="sequential">Sequencial</option>
              <option value="parallel">Simultâneo</option>
            </select>
          </div>
          {field("Início do trim (%)", "Início", "start", 0, 100)}
          {field("Fim do trim (%)", "Fim", "end", 0, 100)}
          {field("Deslocamento do trim (%)", "Deslocamento", "offset", -10000, 10000)}
        </div>
      )}
      {nativeArc && !trim && (
        <p className="micro">
          Este caminho tem arcos SVG nativos. Converta-os em curvas Bézier antes de usar o trim.
        </p>
      )}
      {error && (
        <p role="alert" className="artboard-inspector-error">
          {error}
        </p>
      )}
    </section>
  );
}

export function mountPathEffectsPanel(host: Element, props: Props) {
  const root = createRoot(host);
  root.render(<PathEffectsPanel {...props} />);
  return () => root.unmount();
}
