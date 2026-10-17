import {
  buildCues,
  CAPTION_FONT,
  CAPTION_HIGHLIGHT,
  type Cue,
  captionMargin,
  cueAt,
  DEFAULT_CAPTION_STYLE,
  KEY_STYLE,
} from "@shared/captions";
import { timelineWords } from "@shared/cleanup";
import type { Project } from "@shared/types";
import { type ReactNode, useMemo } from "react";
import { useTimelineKeys } from "@/lib/keysOnScreen";
import { useTranscripts } from "@/lib/transcripts";
import { usePlayback } from "@/state/playback";

/** Caption cues of the current edit (the same ones the export burns in). */
export function useCues(project: Project | null, vertical = false): Cue[] {
  const transcripts = useTranscripts(project);
  return useMemo(
    () =>
      project && transcripts.size
        ? buildCues(timelineWords(project, transcripts), vertical ? 22 : 42)
        : [],
    [project, transcripts, vertical],
  );
}

/** Burned captions as they will look, drawn over the preview stage (width × height in screen px). */
export function CaptionOverlay({
  project,
  width,
  height,
}: {
  project: Project;
  width: number;
  height: number;
}): ReactNode {
  const cues = useCues(project);
  const t = usePlayback((s) => s.time);
  const style = { ...DEFAULT_CAPTION_STYLE, ...project.captions };
  const cue = cueAt(cues, t);
  if (!cue) return null;
  const fs = (style.size / 100) * height;
  const margin = captionMargin(style, height, false);
  const pos =
    style.position === "top"
      ? { top: margin }
      : style.position === "middle"
        ? { top: "50%", transform: "translateY(-50%)" }
        : { bottom: margin };
  const outline = Math.max(1, fs * 0.09);
  return (
    <div
      className="stage-captions"
      style={{ ...pos, fontFamily: `"${style.font ?? CAPTION_FONT}", sans-serif`, fontSize: fs }}
    >
      {cue.lines.map((line) => (
        <div
          key={line.map((word) => `${word.start}:${word.end}:${word.text}`).join("|")}
          className={style.look === "box" ? "cap-line is-box" : "cap-line"}
          style={
            style.look === "box"
              ? undefined
              : { WebkitTextStroke: `${outline * 2}px #000`, paintOrder: "stroke fill" }
          }
        >
          {line.map((w, j) => (
            <span
              key={`${w.start}:${w.end}:${w.text}`}
              style={{
                color:
                  style.look === "karaoke" && w.start <= t
                    ? (style.highlight ?? CAPTION_HIGHLIGHT)
                    : "#fff",
              }}
            >
              {w.text}
              {j < line.length - 1 ? " " : ""}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Shortcut keys pressed while recording, as pills in the bottom-right corner (same as the export). */
export function KeyOverlay({ project, height }: { project: Project; height: number }): ReactNode {
  const keys = useTimelineKeys(project);
  const t = usePlayback((s) => s.time);
  const now = keys.filter((k) => t >= k.start && t < k.end);
  if (!now.length) return null;
  const fs = (KEY_STYLE.size / 100) * height;
  return (
    <div
      className="stage-keys"
      style={{
        right: KEY_STYLE.margin * height,
        bottom: KEY_STYLE.margin * height,
        fontSize: fs,
        fontFamily: `"${CAPTION_FONT}", sans-serif`,
      }}
    >
      {now.map((k) => (
        <span key={`${k.start}${k.label}`} style={{ padding: `${fs * 0.35}px ${fs * 0.5}px` }}>
          {k.label}
        </span>
      ))}
    </div>
  );
}
