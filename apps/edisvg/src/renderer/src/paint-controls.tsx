import { useState } from "react";
import { createPortal } from "react-dom";
import { inheritedAppearance, inheritedGradients } from "../../shared/appearance";
import type { Scene, SceneNode } from "../../shared/sceneTypes";
import { normalizeHex } from "./paint-color";
import { PaintPicker } from "./paint-picker";

type Paint = "fill" | "stroke";

interface Props {
  scene: Scene;
  node: SceneNode;
  locked: boolean;
  execute(commands: unknown[]): void;
}

export function PaintControls({ scene, node, locked, execute }: Props) {
  const [open, setOpen] = useState<Paint | null>(null);
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
  const row = (paint: Paint) => {
    const label = paint === "fill" ? "Preenchimento" : "Contorno";
    const value = appearance[paint] ?? (paint === "fill" ? "#000000" : "none");
    const gradient = gradients[paint];
    const firstStop = gradient?.kind !== "pattern" ? gradient?.stops[0]?.color : undefined;
    const solid = normalizeHex(firstStop ?? "") ?? normalizeHex(value) ?? "#000000";
    const rawOpacity = Number(appearance[`${paint}-opacity`] ?? "1");
    const opacity = Number.isFinite(rawOpacity) ? Math.min(1, Math.max(0, rawOpacity)) : 1;
    const inherited = node.attrs[paint] === undefined || node.attrs[paint] === "inherit";
    const absent = value === "none" && !gradient;
    const kind =
      gradient?.kind === "pattern"
        ? "Padrão"
        : gradient
          ? "Gradiente"
          : absent
            ? "Sem pintura"
            : inherited
              ? "Herdado"
              : "";
    const background =
      gradient && gradient.kind !== "pattern"
        ? `linear-gradient(90deg, ${gradient.stops.map((stop) => `${stop.color} ${stop.offset * 100}%`).join(", ")})`
        : gradient?.kind === "pattern"
          ? "repeating-linear-gradient(45deg, #87919c 0 3px, #282d35 3px 6px)"
          : absent
            ? undefined
            : solid;
    return (
      <div className="paint-channel" key={paint}>
        <div className="paint-channel-row">
          <button
            type="button"
            className={`paint-swatch ${paint === "stroke" ? "paint-swatch-stroke" : ""} ${absent ? "paint-swatch-empty" : ""}`}
            aria-label={`Escolher cor de ${label.toLowerCase()}`}
            aria-expanded={open === paint}
            disabled={locked}
            style={background ? { background } : undefined}
            onClick={(event) => {
              const bounds = event.currentTarget.getBoundingClientRect();
              setPosition({
                top: Math.max(52, Math.min(bounds.top, window.innerHeight - 450)),
                left: Math.max(8, bounds.left - 274),
              });
              setOpen(open === paint ? null : paint);
            }}
          />
          <div className="paint-channel-label">
            <strong>{label}</strong>
            {kind && <small>{kind}</small>}
          </div>
          <button
            type="button"
            className="paint-channel-action"
            title={`${absent ? "Ativar" : "Remover"} ${label.toLowerCase()}`}
            aria-label={`${absent ? "Ativar" : "Remover"} ${label.toLowerCase()}`}
            disabled={locked}
            onClick={() =>
              apply([
                {
                  type: "scene",
                  operation: "attrs",
                  targetId: node.id,
                  value: { [paint]: absent ? solid : "none" },
                },
              ])
            }
          >
            {absent ? "+" : "−"}
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
                apply([
                  {
                    type: "scene",
                    operation: "attrs",
                    targetId: node.id,
                    value: { [paint]: color, [`${paint}-opacity`]: String(nextOpacity) },
                  },
                ])
              }
            />,
            document.body,
          )}
      </div>
    );
  };
  return (
    <div className="paint-controls">
      <h3>PREENCHIMENTOS E CONTORNOS</h3>
      <div className="paint-channels">{(["fill", "stroke"] as const).map(row)}</div>
      <label className="paint-width">
        Espessura
        <input
          type="number"
          min={0}
          max={10000}
          step={0.5}
          defaultValue={appearance["stroke-width"] ?? "1"}
          disabled={locked}
          onBlur={(event) => {
            const width = Number(event.target.value);
            if (
              event.target.value.trim() &&
              Number.isFinite(width) &&
              width >= 0 &&
              width <= 10000 &&
              String(width) !== appearance["stroke-width"]
            )
              apply([
                {
                  type: "scene",
                  operation: "attrs",
                  targetId: node.id,
                  value: { "stroke-width": String(width) },
                },
              ]);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
      </label>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
