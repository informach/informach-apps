import { useState } from "react";
import { createPortal } from "react-dom";
import { inheritedAppearance, inheritedGradients } from "../../shared/appearance";
import type { Scene, SceneNode } from "../../shared/sceneTypes";
import { formatInput } from "./form-values";
import { ScrubField } from "./inspector-field";
import { normalizeHex } from "./paint-color";
import { PaintPicker } from "./paint-picker";

type Paint = "fill" | "stroke";

interface Props {
  scene: Scene;
  node: SceneNode;
  locked: boolean;
  execute(commands: unknown[]): void;
}

const labels: Record<Paint, string> = { fill: "Preenchimento", stroke: "Contorno" };
// Hiding a paint stores opacity 0, so the color and gradient survive. The
// opacity it had comes back when shown again in this session; otherwise 100%.
const hiddenOpacity = new Map<string, number>();

export function PaintControls({ scene, node, locked, execute }: Props) {
  const [open, setOpen] = useState<Paint | null>(null);
  const [adding, setAdding] = useState(false);
  const [position, setPosition] = useState({ top: 52, left: 8 });
  const [error, setError] = useState("");
  const appearance = inheritedAppearance(scene, node);
  const gradients = inheritedGradients(scene, node);
  const apply = (commands: unknown[]) => {
    try {
      execute(commands);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Pintura recusada.");
    }
  };
  const setAttrs = (value: Record<string, string>) =>
    apply([{ type: "scene", operation: "attrs", targetId: node.id, value }]);
  const saveColor = (color: string) => {
    if (scene.palette?.some((item) => item.toLowerCase() === color.toLowerCase())) return;
    if ((scene.palette?.length ?? 0) >= 64) {
      setError("A paleta aceita até 64 cores.");
      return;
    }
    apply([
      { type: "appearance", operation: "palette", colors: [...(scene.palette ?? []), color] },
    ]);
  };
  const describe = (paint: Paint) => {
    const value = appearance[paint] ?? (paint === "fill" ? "#000000" : "none");
    const gradient = gradients[paint];
    const firstStop = gradient?.kind !== "pattern" ? gradient?.stops[0]?.color : undefined;
    const rawOpacity = Number(appearance[`${paint}-opacity`] ?? "1");
    return {
      gradient,
      absent: value === "none" && !gradient,
      solid: normalizeHex(firstStop ?? "") ?? normalizeHex(value) ?? "#000000",
      opacity: Number.isFinite(rawOpacity) ? Math.min(1, Math.max(0, rawOpacity)) : 1,
      inherited: node.attrs[paint] === undefined || node.attrs[paint] === "inherit",
    };
  };
  const absentPaints = (["fill", "stroke"] as const).filter((paint) => describe(paint).absent);
  const addPaint = (paint: Paint) => {
    setAdding(false);
    setAttrs({ [paint]: paint === "fill" ? "#747474" : "#000000", [`${paint}-opacity`]: "1" });
  };

  const row = (paint: Paint) => {
    const label = labels[paint];
    const { gradient, absent, solid, opacity, inherited } = describe(paint);
    if (absent) return null;
    const hidden = opacity === 0;
    const key = `${node.id}:${paint}`;
    const background =
      gradient && gradient.kind !== "pattern"
        ? `linear-gradient(90deg, ${gradient.stops.map((stop) => `${stop.color} ${stop.offset * 100}%`).join(", ")})`
        : gradient?.kind === "pattern"
          ? "repeating-linear-gradient(45deg, #87919c 0 3px, #282d35 3px 6px)"
          : solid;
    return (
      <div className={hidden ? "paint-channel is-hidden" : "paint-channel"} key={paint}>
        <div className="paint-channel-row">
          <button
            type="button"
            className={`paint-swatch ${paint === "stroke" ? "paint-swatch-stroke" : ""}`}
            aria-label={`Escolher cor de ${label.toLowerCase()}`}
            aria-expanded={open === paint}
            title={inherited ? `${label} herdado do grupo` : label}
            disabled={locked}
            style={{ background }}
            onClick={(event) => {
              const bounds = event.currentTarget.getBoundingClientRect();
              setPosition({
                top: Math.max(52, Math.min(bounds.top, window.innerHeight - 450)),
                left: Math.max(8, bounds.left - 274),
              });
              setOpen(open === paint ? null : paint);
            }}
          />
          {gradient ? (
            <span className="paint-hex paint-kind">
              {gradient.kind === "pattern" ? "Padrão" : "Gradiente"}
            </span>
          ) : (
            <input
              key={solid}
              className="paint-hex"
              aria-label={`Cor hexadecimal de ${label.toLowerCase()}`}
              maxLength={7}
              spellCheck={false}
              disabled={locked}
              defaultValue={solid.slice(1).toUpperCase()}
              onBlur={(event) => {
                const text = event.currentTarget.value.trim();
                const color = normalizeHex(text.startsWith("#") ? text : `#${text}`);
                if (!color) {
                  event.currentTarget.value = solid.slice(1).toUpperCase();
                  setError("Use uma cor hexadecimal, como 747474.");
                  return;
                }
                if (color !== solid) setAttrs({ [paint]: color });
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") {
                  event.currentTarget.value = solid.slice(1).toUpperCase();
                  event.currentTarget.blur();
                }
              }}
            />
          )}
          <ScrubField
            label={`Opacidade de ${label.toLowerCase()} (%)`}
            shortLabel="◐"
            value={opacity * 100}
            min={0}
            max={100}
            unit="%"
            disabled={locked}
            onError={setError}
            onCommit={(input) => {
              const value = input.valueAsNumber;
              if (!Number.isFinite(value) || value < 0 || value > 100) {
                input.value = formatInput(opacity * 100);
                setError("A opacidade deve estar entre 0% e 100%.");
                return;
              }
              if (value !== opacity * 100) setAttrs({ [`${paint}-opacity`]: String(value / 100) });
            }}
          />
          <button
            type="button"
            className="paint-channel-action"
            aria-label={`${hidden ? "Mostrar" : "Ocultar"} ${label.toLowerCase()}`}
            aria-pressed={hidden}
            title={`${hidden ? "Mostrar" : "Ocultar"} ${label.toLowerCase()}`}
            disabled={locked}
            onClick={() => {
              if (!hidden) hiddenOpacity.set(key, opacity);
              const restored = hiddenOpacity.get(key) || 1;
              if (hidden) hiddenOpacity.delete(key);
              setAttrs({ [`${paint}-opacity`]: hidden ? String(restored) : "0" });
            }}
          >
            <EyeIcon hidden={hidden} />
          </button>
          <button
            type="button"
            className="paint-channel-action"
            aria-label={`Remover ${label.toLowerCase()}`}
            title={`Remover ${label.toLowerCase()}`}
            disabled={locked}
            onClick={() => setAttrs({ [paint]: "none" })}
          >
            −
          </button>
        </div>
        {open === paint &&
          createPortal(
            <PaintPicker
              label={label.toLowerCase()}
              color={solid}
              opacity={opacity}
              palette={scene.palette ?? []}
              position={position}
              onClose={() => setOpen(null)}
              onSaveColor={saveColor}
              onApply={(color, nextOpacity) =>
                setAttrs({ [paint]: color, [`${paint}-opacity`]: String(nextOpacity) })
              }
            />,
            document.body,
          )}
      </div>
    );
  };
  const stroke = describe("stroke");
  return (
    <div className="paint-controls">
      <div className="artboard-inspector-title paint-controls-title">
        <h3>Preenchimentos e contornos</h3>
        <button
          type="button"
          aria-label="Adicionar preenchimento ou contorno"
          title={absentPaints.length ? "Adicionar" : "O objeto já tem preenchimento e contorno"}
          aria-expanded={adding}
          disabled={locked || !absentPaints.length}
          onClick={() => {
            const only = absentPaints.length === 1 ? absentPaints[0] : undefined;
            if (only) addPaint(only);
            else setAdding(!adding);
          }}
        >
          +
        </button>
      </div>
      {adding && absentPaints.length > 1 && (
        <div className="paint-add-menu">
          {absentPaints.map((paint) => (
            <button type="button" key={paint} onClick={() => addPaint(paint)}>
              {labels[paint]}
            </button>
          ))}
        </div>
      )}
      <div className="paint-channels">
        {(["fill", "stroke"] as const).map(row)}
        {absentPaints.length === 2 && <p className="micro">Sem preenchimento nem contorno.</p>}
      </div>
      {!stroke.absent && (
        <div className="paint-width">
          <span>Espessura</span>
          <ScrubField
            label="Espessura do contorno"
            shortLabel="≡"
            value={Number(appearance["stroke-width"] ?? "1") || 0}
            min={0}
            max={10000}
            unit="px"
            disabled={locked}
            onError={setError}
            onCommit={(input) => {
              const width = input.valueAsNumber;
              if (!Number.isFinite(width) || width < 0 || width > 10000) {
                input.value = appearance["stroke-width"] ?? "1";
                setError("A espessura deve estar entre 0 e 10.000 px.");
                return;
              }
              if (String(width) !== appearance["stroke-width"])
                setAttrs({ "stroke-width": String(width) });
            }}
          />
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

function EyeIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <circle cx="8" cy="8" r="2" fill={hidden ? "none" : "currentColor"} stroke="currentColor" />
      {hidden && <path d="M2.5 2.5l11 11" stroke="currentColor" strokeWidth="1.3" />}
    </svg>
  );
}
