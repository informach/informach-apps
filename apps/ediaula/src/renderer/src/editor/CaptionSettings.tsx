import {
  CAPTION_FONT,
  CAPTION_LOOKS,
  type CaptionStyle,
  DEFAULT_CAPTION_STYLE,
} from "@shared/captions";
import { Captions } from "lucide-react";
import type { ReactNode } from "react";
import { type Commit, personCommit, useProject } from "@/state/project";
import { Toggle } from "@/ui";
import { Slider } from "./ClipVisual";
import { FontPicker } from "./FontPicker";

export function setCaptions(
  changes: Partial<CaptionStyle & { burn: boolean }>,
  commit: Commit = personCommit,
): void {
  commit((p) => ({
    ...p,
    captions: { ...DEFAULT_CAPTION_STYLE, burn: false, ...p.captions, ...changes },
  }));
}

/** Captions drawn into the video (project-wide): on/off, look, position and size. */
export function CaptionSettings(): ReactNode {
  const captions = useProject((s) => s.project?.captions);
  const transcribed = useProject((s) =>
    s.project?.assets.some((a) => a.transcriptStatus === "ready"),
  );
  const c = { ...DEFAULT_CAPTION_STYLE, burn: false, ...captions };
  return (
    <div className="props-section">
      <div className="props-head">
        <h3>
          <Captions size={13} /> Legenda no vídeo
        </h3>
        <Toggle
          on={c.burn}
          onChange={(v) => setCaptions({ burn: v })}
          label="Gravar legenda no vídeo"
        />
      </div>
      {!transcribed ? (
        <p className="props-hint muted">Transcreva a narração para ter legenda.</p>
      ) : !c.burn ? (
        <p className="props-hint muted">
          Desenha a legenda dentro do vídeo exportado (bom para Reels e Shorts). O .srt separado
          continua disponível.
        </p>
      ) : (
        <>
          <div className="chip-row">
            {CAPTION_LOOKS.map((l) => (
              <button
                type="button"
                key={l.id}
                className={`chip ${c.look === l.id ? "is-active" : ""}`}
                onClick={() => setCaptions({ look: l.id })}
              >
                {l.label}
              </button>
            ))}
          </div>
          <div className="chip-row">
            {(
              [
                ["bottom", "Embaixo"],
                ["middle", "Meio"],
                ["top", "Em cima"],
              ] as const
            ).map(([id, label]) => (
              <button
                type="button"
                key={id}
                className={`chip ${c.position === id ? "is-active" : ""}`}
                onClick={() => setCaptions({ position: id })}
              >
                {label}
              </button>
            ))}
          </div>
          <FontPicker value={c.font ?? CAPTION_FONT} onChange={(font) => setCaptions({ font })} />
          <Slider
            label="Tamanho"
            value={c.size}
            min={3}
            max={9}
            step={0.1}
            format={(v) => `${v.toFixed(1)}%`}
            onCommit={(v) => setCaptions({ size: v })}
          />
        </>
      )}
    </div>
  );
}
