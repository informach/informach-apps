import { shiftCues } from "@shared/subtitles";
import { Music } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { applyVolume, setVideo } from "../lib/media";
import {
  fail,
  playbackFailed,
  rememberPosition,
  setTransform,
  takeResume,
  useStore,
} from "../state/store";

/** The picture: the <video>, its subtitle line, what is being prepared, and the crop frame. */
export function Stage({ showTime = false }: { showTime?: boolean }) {
  const source = useStore((s) => s.source);
  const loading = useStore((s) => s.loading);
  const error = useStore((s) => s.error);
  const prefs = useStore((s) => s.prefs);
  const rate = useStore((s) => s.rate);
  const editing = useStore((s) => s.editing);
  const transform = useStore((s) => s.transform);
  const tool = useStore((s) => s.tool);
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setVideo(ref.current);
    return () => setVideo(null);
  }, []);

  useEffect(() => {
    applyVolume(prefs.volume, prefs.muted, prefs.boost);
  }, [prefs.volume, prefs.muted, prefs.boost]);

  // defaultPlaybackRate survives a new source; playbackRate alone would reset to 1.
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.defaultPlaybackRate = rate;
    v.playbackRate = rate;
  }, [rate]);

  // Where the file stopped is saved every 5 s and when the window closes.
  useEffect(() => {
    const timer = setInterval(() => void rememberPosition(), 5000);
    const leave = () => void rememberPosition();
    window.addEventListener("beforeunload", leave);
    return () => {
      clearInterval(timer);
      window.removeEventListener("beforeunload", leave);
    };
  }, []);

  // The preview of the edit: turned and mirrored as the export will be. While cropping the
  // picture is shown as it is, because the crop applies before turning and mirroring.
  const facts = source?.facts;
  const preview = editing && tool !== "crop";
  const turn = preview ? transform.rotate : 0;
  const flips = preview
    ? `${transform.flipH ? " scaleX(-1)" : ""}${transform.flipV ? " scaleY(-1)" : ""}`
    : "";
  // A quarter turn swaps the sides: shrink so the turned picture still fits the stage.
  const aspect = facts && facts.height ? facts.width / facts.height : 1;
  const fit = turn === 90 || turn === 270 ? Math.min(aspect, 1 / aspect) : 1;
  const style = { transform: `scale(${fit}) rotate(${turn}deg)${flips}` };
  const audioOnly = !!source && !source.facts.hasVideo;

  return (
    <div className={`stage${audioOnly ? " audio-only" : ""}`}>
      {/* biome-ignore lint/a11y/useMediaCaption: subtitles come from .srt/.vtt files or the file's own tracks and are drawn by SubtitleLine, with delay and size controls a <track> cannot give. */}
      <video
        ref={ref}
        src={source?.url}
        crossOrigin="anonymous"
        style={style}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          const resume = takeResume();
          if (resume > 0 && resume < v.duration - 5) v.currentTime = resume;
          useStore.setState({ duration: v.duration || source?.facts.duration || 0 });
          void v.play().catch(() => undefined);
        }}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          useStore.setState({ time: v.currentTime });
          const ab = useStore.getState().ab;
          if (ab?.b !== null && ab && v.currentTime >= ab.b) v.currentTime = ab.a;
        }}
        onPlay={() => useStore.setState({ playing: true })}
        onPause={() => useStore.setState({ playing: false })}
        onError={() => void playbackFailed().catch(fail)}
        onClick={() => {
          const v = ref.current;
          if (v) v.paused ? void v.play().catch(() => undefined) : v.pause();
        }}
        onDoubleClick={() => void toggleFullscreen().catch(fail)}
      />
      {audioOnly && (
        <div className="audio-card">
          <Music size={56} />
        </div>
      )}
      <SubtitleLine />
      {editing && tool === "crop" && source?.facts.hasVideo && (
        <CropFrame
          crop={transform.crop}
          aspect={source.facts.width / Math.max(1, source.facts.height)}
          onChange={(crop) => setTransform({ crop })}
        />
      )}
      {showTime && <TimeTag />}
      {loading && (
        <div className="overlay-note">
          <div className="box">
            <strong>{loading.label}…</strong>
            {loading.ratio > 0 && (
              <span className="progress-line">
                <span style={{ width: `${Math.round(loading.ratio * 100)}%` }} />
              </span>
            )}
            {loading.label.startsWith("Convertendo") && (
              <span className="muted">
                Este formato não toca direto. A prévia é só para assistir; os cortes usam o arquivo
                original.
              </span>
            )}
          </div>
        </div>
      )}
      {error && !loading && (
        <div className="overlay-note">
          <div className="box">
            <strong>Não foi possível abrir</strong>
            <span className="muted">{error}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function TimeTag() {
  const time = useStore((s) => s.time);
  const fps = useStore((s) => s.facts?.fps ?? 30);
  const frame = Math.floor((time % 1) * (fps || 30));
  const whole = Math.floor(time);
  return (
    <span className="timecode">
      {String(Math.floor(whole / 60)).padStart(2, "0")}:{String(whole % 60).padStart(2, "0")},
      {String(frame).padStart(2, "0")}
    </span>
  );
}

/** Full screen takes the picture with its controls (the `.screen` column), not the bare video. */
export async function toggleFullscreen(): Promise<void> {
  const screen = document.querySelector(".screen");
  if (document.fullscreenElement) await document.exitFullscreen();
  else if (screen instanceof HTMLElement) await screen.requestFullscreen();
}

/** The subtitle on screen, read from the video's own clock every frame (smooth with delays). */
function SubtitleLine() {
  const subtitle = useStore((s) => s.subtitle);
  const delay = useStore((s) => s.subtitleDelay);
  const prefs = useStore((s) => s.prefs);
  const cues = useMemo(() => (subtitle ? shiftCues(subtitle.cues, delay) : []), [subtitle, delay]);
  const [text, setText] = useState("");
  useEffect(() => {
    if (!cues.length) {
      setText("");
      return;
    }
    let frame = 0;
    const tick = () => {
      const v = document.querySelector(".stage video");
      const t = v instanceof HTMLVideoElement ? v.currentTime : 0;
      const cue = cues.find((c) => c.start <= t && c.end > t);
      setText(cue ? cue.text.replace(/<\/?[biu]>/g, "") : "");
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [cues]);
  if (!text) return null;
  return (
    <div
      className="subtitle-line"
      style={{
        bottom: `${prefs.subtitleBottom}%`,
        fontSize: `${Math.round(18 * prefs.subtitleSize)}px`,
      }}
    >
      {text}
    </div>
  );
}

type Crop = { x: number; y: number; w: number; h: number };

/**
 * The crop rectangle over the picture: drag to move, the corner to resize. Coordinates are 0..1
 * of the picture as shown; the rectangle sits over the letterboxed video box.
 */
function CropFrame({
  crop,
  aspect,
  onChange,
}: {
  crop: Crop | null;
  aspect: number;
  onChange: (c: Crop | null) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const whole = { x: 0, y: 0, w: 1, h: 1 };
  // Without a crop the frame covers the whole picture: what is shown is what is applied.
  const [draft, setDraft] = useState<Crop>(crop ?? whole);
  useEffect(() => {
    setDraft(crop ?? { x: 0, y: 0, w: 1, h: 1 });
  }, [crop]);
  const [frame, setFrame] = useState({ left: 0, top: 0, width: 0, height: 0 });
  useEffect(() => {
    const parent = box.current?.parentElement;
    if (!parent) return;
    const measure = () => {
      const r = parent.getBoundingClientRect();
      const width = Math.min(r.width, r.height * aspect),
        height = width / aspect;
      setFrame({ left: (r.width - width) / 2, top: (r.height - height) / 2, width, height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [aspect]);
  const drag = (e: React.PointerEvent<HTMLElement>, mode: "move" | "size") => {
    e.stopPropagation();
    const start = { x: e.clientX, y: e.clientY, crop: draft };
    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    let latest = draft;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - start.x) / frame.width,
        dy = (ev.clientY - start.y) / frame.height;
      const c = start.crop;
      latest =
        mode === "move"
          ? {
              ...c,
              x: Math.min(1 - c.w, Math.max(0, c.x + dx)),
              y: Math.min(1 - c.h, Math.max(0, c.y + dy)),
            }
          : {
              ...c,
              w: Math.min(1 - c.x, Math.max(0.05, c.w + dx)),
              h: Math.min(1 - c.y, Math.max(0.05, c.h + dy)),
            };
      setDraft(latest);
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
      target.removeEventListener("pointercancel", up);
      onChange(latest);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
    target.addEventListener("pointercancel", up);
  };
  return (
    <div
      ref={box}
      style={{
        position: "absolute",
        left: frame.left,
        top: frame.top,
        width: frame.width,
        height: frame.height,
        pointerEvents: "none",
      }}
    >
      <div
        className="crop-box"
        role="presentation"
        style={{
          left: `${draft.x * 100}%`,
          top: `${draft.y * 100}%`,
          width: `${draft.w * 100}%`,
          height: `${draft.h * 100}%`,
          pointerEvents: "auto",
        }}
        onPointerDown={(e) => drag(e, "move")}
      >
        <span className="corner" role="presentation" onPointerDown={(e) => drag(e, "size")} />
      </div>
    </div>
  );
}
