import { DEFAULT_SHADOW, DEFAULT_TRANSFORM, SHADOW_PRESETS, type Shadow } from "@shared/compose";
import type { Clip } from "@shared/types";
import type { ReactNode } from "react";
import { Slider, updateClip } from "./ClipVisual";
import { Swatches } from "./Swatches";

const same = (a: Shadow, b: Shadow): boolean =>
  a.distance === b.distance &&
  a.angle === b.angle &&
  a.blur === b.blur &&
  a.opacity === b.opacity &&
  a.color.toUpperCase() === b.color.toUpperCase();

/**
 * Drop shadow: none, presets, and fine-tuning (distance, direction, blur, opacity, color).
 * `builtIn` adds "Padrão" (undefined), the usual soft shadow of annotations.
 */
export function ShadowControls({
  value,
  onChange,
  builtIn = false,
}: {
  value: Shadow | null | undefined;
  onChange: (v: Shadow | null | undefined) => void;
  builtIn?: boolean;
}): ReactNode {
  const preset = value ? SHADOW_PRESETS.find((p) => same(p.shadow, value)) : undefined;
  const set = (c: Partial<Shadow>): void => {
    onChange({ ...(value ?? DEFAULT_SHADOW), ...c });
  };
  return (
    <>
      <div className="chip-row">
        <button
          type="button"
          className={`chip ${value === null || (!builtIn && !value) ? "is-active" : ""}`}
          onClick={() => onChange(builtIn ? null : undefined)}
        >
          Nenhuma
        </button>
        {builtIn && (
          <button
            type="button"
            className={`chip ${value === undefined ? "is-active" : ""}`}
            onClick={() => onChange(undefined)}
          >
            Padrão
          </button>
        )}
        {SHADOW_PRESETS.map((p) => (
          <button
            type="button"
            key={p.id}
            className={`chip ${preset?.id === p.id ? "is-active" : ""}`}
            onClick={() => onChange(p.shadow)}
          >
            {p.label}
          </button>
        ))}
        {value && !preset && (
          <button type="button" className="chip is-active">
            Personalizada
          </button>
        )}
      </div>
      {value && (
        <>
          <Slider
            label="Distância"
            value={value.distance}
            min={0}
            max={80}
            step={1}
            format={(v) => `${Math.round(v)} px`}
            onCommit={(v) => set({ distance: v })}
          />
          <Slider
            label="Direção"
            value={value.angle}
            min={0}
            max={355}
            step={5}
            format={(v) => `${Math.round(v)}°`}
            onCommit={(v) => set({ angle: v })}
          />
          <Slider
            label="Desfoque"
            value={value.blur}
            min={0}
            max={80}
            step={1}
            format={(v) => `${Math.round(v)} px`}
            onCommit={(v) => set({ blur: v })}
          />
          <Slider
            label="Intensidade"
            value={value.opacity}
            min={0.05}
            max={1}
            step={0.05}
            format={(v) => `${Math.round(v * 100)}%`}
            onCommit={(v) => set({ opacity: v })}
          />
          <Swatches
            value={value.color}
            extra={[{ hex: "#000000", name: "Preto" }]}
            onPick={(color) => set({ color: color ?? "#000000" })}
          />
        </>
      )}
    </>
  );
}

/** Drop shadow of a video, picture or avatar (follows its shape: rounded corners, circle, cut-out). */
export function ShadowSection({ clip }: { clip: Clip }): ReactNode {
  const shadow = clip.transform?.shadow;
  return (
    <div className="props-section">
      <h3>Sombra projetada</h3>
      <ShadowControls
        value={shadow}
        onChange={(v) =>
          updateClip(clip.id, (c) => ({
            ...c,
            transform: { ...(c.transform ?? DEFAULT_TRANSFORM), shadow: v ?? undefined },
          }))
        }
      />
    </div>
  );
}
