import { type Cue, type CueStyle, DEFAULT_CAPTION_STYLE } from "@shared/captions";
import { Palette, RotateCcw } from "lucide-react";
import { type ReactNode, useState } from "react";
import { timecode } from "@/lib/format";
import { setCueStyle, toggleCaptionBreak } from "@/lib/wordEditing";
import { playback, usePlayback } from "@/state/playback";
import { useProject } from "@/state/project";
import { useCues } from "./CaptionOverlay";
import { Slider } from "./ClipVisual";

const POSITIONS: [CueStyle["position"], string][] = [
  ["bottom", "Embaixo"],
  ["middle", "Meio"],
  ["top", "Em cima"],
];

/** Index of the caption on screen at `t`, or -1. */
const cueIndex = (cues: Cue[], t: number): number =>
  cues.findIndex((c) => t >= c.start && t < c.end);

/**
 * The captions drawn into the video, one by one: click a word to start a new caption there, join
 * a forced break back, and give a single caption its own position, size or color. The preview and
 * the export (libass) use the same breaks and looks.
 */
export function CueList(): ReactNode {
  const project = useProject((s) => s.project);
  const cues = useCues(project);
  const current = usePlayback((s) => cueIndex(cues, s.time));
  const [open, setOpen] = useState<string | null>(null);
  // Breaks and looks only matter for the captions drawn into the video.
  if (!project?.captions?.burn || !cues.length) return null;
  const fps = project.settings.fps;
  const breaks = new Set(project.captionBreaks ?? []);
  const base = { ...DEFAULT_CAPTION_STYLE, ...project.captions };
  return (
    <div className="props-section">
      <div className="props-head">
        <h3>Legenda por legenda</h3>
        <span className="muted">{cues.length}</span>
      </div>
      <p className="props-hint muted">
        Clique numa palavra para começar uma legenda nova nela. O pincel muda só aquela legenda.
      </p>
      <div className="cue-list">
        {cues.map((cue, n) => {
          const key = cue.key;
          const forced = !!key && breaks.has(key);
          return (
            <div key={key ?? `${cue.start}`} className={`cue ${n === current ? "is-now" : ""}`}>
              <div className="cue-head">
                <button
                  type="button"
                  className="cue-time mono"
                  onClick={() => playback.seek(cue.start)}
                >
                  {timecode(cue.start, fps)}
                </button>
                {cue.style && <span className="cue-tag">estilo próprio</span>}
                <span className="spacer" />
                {forced && key && (
                  <button
                    type="button"
                    className="chip"
                    title="Esta legenda volta a continuar a anterior"
                    onClick={() => toggleCaptionBreak(key)}
                  >
                    Juntar à anterior
                  </button>
                )}
                {key && (
                  <button
                    type="button"
                    className={`icon-btn ${open === key ? "is-active" : ""}`}
                    title="Estilo desta legenda"
                    onClick={() => setOpen(open === key ? null : key)}
                  >
                    <Palette size={13} />
                  </button>
                )}
              </div>
              <div className="cue-text">
                {cue.lines.map((line) => (
                  <div key={line.map((w) => w.key ?? w.text).join("|")}>
                    {line.map((w, j) => {
                      const first = j === 0 && line === cue.lines[0];
                      return (
                        <button
                          type="button"
                          key={w.key ?? `${w.start}`}
                          className="cue-word"
                          disabled={first || !w.key}
                          title={first ? undefined : "Começar uma legenda nova nesta palavra"}
                          onClick={() => w.key && toggleCaptionBreak(w.key)}
                        >
                          {w.text}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
              {open === key && key && <CueStyleEditor cueKey={key} own={cue.style} base={base} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CueStyleEditor({
  cueKey,
  own,
  base,
}: {
  cueKey: string;
  own: CueStyle | undefined;
  base: typeof DEFAULT_CAPTION_STYLE;
}): ReactNode {
  const color = own?.color ?? "#FFFFFF";
  // The native change event fires once, when the picker closes: one undo step per color.
  const listen = (el: HTMLInputElement | null): (() => void) | undefined => {
    if (!el) return;
    const commit = (): void => setCueStyle(cueKey, { color: el.value.toUpperCase() });
    el.addEventListener("change", commit);
    return () => el.removeEventListener("change", commit);
  };
  return (
    <div className="cue-style">
      <div className="chip-row">
        {POSITIONS.map(([id, label]) => (
          <button
            type="button"
            key={id}
            className={`chip ${(own?.position ?? base.position) === id ? "is-active" : ""}`}
            onClick={() => setCueStyle(cueKey, { position: id === base.position ? undefined : id })}
          >
            {label}
          </button>
        ))}
      </div>
      <Slider
        label="Tamanho"
        value={own?.size ?? base.size}
        min={3}
        max={9}
        step={0.1}
        format={(v) => `${v.toFixed(1)}%`}
        onCommit={(v) => setCueStyle(cueKey, { size: v === base.size ? undefined : v })}
      />
      <div className="key-color-row">
        <label className="key-swatch" style={{ background: color }} title="Cor do texto">
          <input ref={listen} key={color} type="color" defaultValue={color} />
        </label>
        <span className="mono">{own?.color ?? "padrão"}</span>
        <span className="spacer" />
        <button
          type="button"
          className="chip"
          disabled={!own}
          onClick={() => setCueStyle(cueKey, null)}
        >
          <RotateCcw size={11} /> Como as outras
        </button>
      </div>
    </div>
  );
}
