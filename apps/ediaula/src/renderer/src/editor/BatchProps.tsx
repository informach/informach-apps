import {
  AVATAR_FADE,
  AVATAR_PLACEMENTS,
  DEFAULT_TRANSFORM,
  MOTIONS,
  type Motion,
  type Transform,
} from "@shared/compose";
import type { Clip } from "@shared/types";
import { Gauge } from "lucide-react";
import type { ReactNode } from "react";
import { hasSpeed } from "@/lib/speed";
import { useApp } from "@/state/app";
import { liveEdit } from "@/state/liveEdit";
import { useProject } from "@/state/project";
import { Button } from "@/ui";
import { Slider } from "./ClipVisual";

/**
 * The same change on every selected clip at once (opacity, position, entrance and exit, volume,
 * speed), each one a single Ctrl+Z. Pictures get the picture properties, sounds the volume;
 * clips on locked tracks are left out. The sliders start at the first clip's value.
 */
export function BatchSection({ clips }: { clips: Clip[] }): ReactNode {
  const project = useProject((s) => s.project);
  if (!project) return null;
  const locked = new Set(project.tracks.filter((t) => t.locked).map((t) => t.id));
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const free = clips.filter((c) => !locked.has(c.trackId));
  const pictures = free.filter((c) => {
    const a = assets.get(c.assetId);
    return !!a && a.kind !== "audio" && !c.zoomLayer;
  });
  const sounds = free.filter((c) => assets.get(c.assetId)?.hasAudio);
  const timed = free.filter((c) => hasSpeed(project, c));
  const first = pictures[0]?.transform ?? DEFAULT_TRANSFORM;
  const frame = project.settings;

  const each = (ids: string[], fn: (c: Clip) => Clip): void => {
    if (!ids.length) return;
    const set = new Set(ids);
    useProject
      .getState()
      .commit((p) => ({ ...p, clips: p.clips.map((c) => (set.has(c.id) ? fn(c) : c)) }));
  };
  const ids = pictures.map((c) => c.id);
  const setTransform = (changes: Partial<Transform>): void =>
    each(ids, (c) => ({ ...c, transform: { ...(c.transform ?? DEFAULT_TRANSFORM), ...changes } }));
  const preview =
    (key: keyof Transform) =>
    (v: number | null): void =>
      v === null ? liveEdit.clear() : liveEdit.show(ids, { [key]: v });
  const motionOf = (c: Clip, which: "enter" | "exit"): Motion | undefined =>
    (which === "enter" ? c.fadeIn : c.fadeOut) ? (c[which] ?? "fade") : undefined;
  const setMotion = (which: "enter" | "exit", m: Motion | undefined): void => {
    const key = which === "enter" ? "fadeIn" : "fadeOut";
    each(ids, (c) =>
      m
        ? { ...c, [which]: m, [key]: c[key] || (m === "fade" ? AVATAR_FADE : 0.4) }
        : { ...c, [which]: undefined, [key]: undefined },
    );
  };
  const motionRow = (label: string, which: "enter" | "exit"): ReactNode => {
    const current = pictures.length ? motionOf(pictures[0], which) : undefined;
    const same = pictures.every((c) => motionOf(c, which) === current);
    return (
      <>
        <span className="field-label">{label}</span>
        <div className="chip-row">
          <button
            type="button"
            className={`chip ${same && !current ? "is-active" : ""}`}
            onClick={() => setMotion(which, undefined)}
          >
            Nenhuma
          </button>
          {MOTIONS.map((m) => (
            <button
              type="button"
              key={m.id}
              className={`chip ${same && current === m.id ? "is-active" : ""}`}
              onClick={() => setMotion(which, m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </>
    );
  };

  return (
    <>
      {pictures.length > 0 && (
        <div className="props-section">
          <h3>Na tela: {pictures.length === 1 ? "1 clipe" : `${pictures.length} clipes`}</h3>
          <Slider
            label="Opacidade"
            value={first.opacity}
            min={0}
            max={1}
            step={0.01}
            onCommit={(v) => setTransform({ opacity: v })}
            onPreview={preview("opacity")}
            input={{ factor: 100, unit: "%", limits: [0, 1] }}
          />
          <Slider
            label="Horizontal"
            value={first.x}
            min={-0.25}
            max={1.25}
            step={0.005}
            onCommit={(v) => setTransform({ x: v })}
            onPreview={preview("x")}
            input={{ factor: frame.width, unit: "px", limits: [-4, 5] }}
          />
          <Slider
            label="Vertical"
            value={first.y}
            min={-0.25}
            max={1.25}
            step={0.005}
            onCommit={(v) => setTransform({ y: v })}
            onPreview={preview("y")}
            input={{ factor: frame.height, unit: "px", limits: [-4, 5] }}
          />
          <span className="field-label">Posição pronta</span>
          <div className="chip-row">
            {AVATAR_PLACEMENTS.map((p) => (
              <button
                type="button"
                key={p.id}
                className="chip"
                onClick={() => setTransform(p.transform)}
              >
                {p.label}
              </button>
            ))}
          </div>
          {motionRow("Entrada", "enter")}
          {motionRow("Saída", "exit")}
        </div>
      )}
      {sounds.length > 0 && (
        <div className="props-section">
          <h3>Som: {sounds.length === 1 ? "1 clipe" : `${sounds.length} clipes`}</h3>
          <Slider
            label="Volume"
            value={sounds[0].volume}
            min={0}
            max={2}
            step={0.05}
            onCommit={(v) =>
              each(
                sounds.map((c) => c.id),
                (c) => ({ ...c, volume: v }),
              )
            }
            input={{ factor: 100, unit: "%", limits: [0, 4] }}
          />
        </div>
      )}
      {timed.length > 0 && (
        <div className="props-section">
          <Button
            size="sm"
            variant="secondary"
            icon={Gauge}
            onClick={() => useApp.getState().set({ speedClips: timed.map((c) => c.id) })}
          >
            Velocidade dos selecionados…
          </Button>
        </div>
      )}
    </>
  );
}
