import { DUCKING, duckGain, duckingOf, ducks } from "@shared/audio";
import {
  animAt,
  BORDER_WIDTH,
  type Box,
  clipLayout,
  DEFAULT_TRANSFORM,
  maskRadius,
  rotationOf,
  type Shadow,
  shadowOffset,
  type Transform,
} from "@shared/compose";
import { transformAt, upsertKeyframe } from "@shared/keyframes";
import { driftCorrection } from "@shared/playbackSync";
import { clipEnd, clipSpeed, projectDuration, sourceAt, sourceEnd } from "@shared/timeline";
import {
  type DerivedClip,
  FOLD,
  foldGeometry,
  GLITCH_GRID,
  glitchBlockVisible,
  glitchSlot,
  isMask,
  maskCss,
  pageCorners,
  quadMatrix3d,
  tailProgress,
  withTransitions,
} from "@shared/transitions";
import type { Asset, Clip, Project } from "@shared/types";
import { zoomAt, zoomsIn } from "@shared/zoom";
import { zoomAffine, zoomsOver } from "@shared/zoomLayer";
import {
  ChevronLeft,
  ChevronRight,
  Loader,
  Maximize,
  Minus,
  Monitor,
  Pause,
  Play,
  Plus,
  ShieldCheck,
  SkipBack,
  SkipForward,
  Wand2,
  Zap,
} from "lucide-react";
import {
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSpeechSpans } from "@/lib/audio";
import { timecode } from "@/lib/format";
import { mediaUrl, playbackPath } from "@/lib/media";
import { listenPath, useVoiceListen } from "@/lib/voice";
import { heard, useApp } from "@/state/app";
import { liveTransform, useLiveEdit } from "@/state/liveEdit";
import { playback, usePlayback } from "@/state/playback";
import { assetMap, useProject, useShownProject } from "@/state/project";
import { PreviewMedia } from "@/ui/PreviewMedia";
import { BalloonTailControl } from "./BalloonTailControl";
import { CaptionOverlay, KeyOverlay, useCues } from "./CaptionOverlay";
import { CursorLayer } from "./CursorLayer";
import { CutFxLayer } from "./CutFxLayer";
import { ZoomTarget } from "./ZoomTarget";

/** Clips are mounted a little before they start so the decoder is warm when they appear. */
const PRELOAD_AHEAD = 4;
const KEEP_BEHIND = 1;
/** Screen pixels within which a dragged clip snaps to the frame and to the other pictures. */
const SNAP_PX = 8;
/** How far the preview zooms in (Ctrl + wheel) and out. */
const VIEW_MIN = 0.5;
const VIEW_MAX = 4;
/** Whether the safe areas are drawn over the preview, kept for the next session. */
const SAFE_KEY = "ediaula.preview.safeArea";
const remembered = (key: string): boolean => {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
};

/** The preview's own zoom by `factor`, keeping the point (`px`, `py` from the center) still. */
function zoomedView(
  v: { zoom: number; x: number; y: number },
  factor: number,
  px: number,
  py: number,
): { zoom: number; x: number; y: number } {
  const zoom = Math.min(VIEW_MAX, Math.max(VIEW_MIN, v.zoom * factor));
  if (zoom === 1) return { zoom, x: 0, y: 0 };
  const k = zoom / v.zoom;
  return { zoom, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
}

/** Turned around the center of the layer (transform-origin 0 0), after whatever comes before. */
const spin = (degrees: number): string =>
  degrees ? ` translate(50%, 50%) rotate(${degrees}deg) translate(-50%, -50%)` : "";

/** Guide lines shown while dragging a picture, in frame pixels. */
interface Guides {
  x: number[];
  y: number[];
}

function mountedClipIds(project: Project, t: number): string {
  return project.clips
    .filter((c) => c.start - PRELOAD_AHEAD <= t && clipEnd(c) + KEEP_BEHIND >= t)
    .map((c) => c.id)
    .sort()
    .join(",");
}

/** Avatars play their transparent version once it exists; everything else the proxy or original. */
const visualPath = (a: Asset): string => (a.key && a.keyed ? a.keyed : playbackPath(a));

/** Every track can hold pictures (like Camtasia): what is visual is decided by the media itself. */
const isVisual = (_project: Project, _c: Clip, a: Asset | undefined): boolean =>
  !!a && a.kind !== "audio";

/**
 * The transparent avatar video has no sound: its voice plays from the original file, on the
 * side. A video whose voice was treated also plays it apart, from the treated file.
 */
const VOICE = "#voice";
const needsVoice = (a: Asset, original: boolean): boolean =>
  a.hasAudio && ((!!a.key && !!a.keyed) || !!listenPath(a, original));
/** What a clip's sound plays from: the treated voice (shared/voiceChain.ts), else the media. */
const soundPath = (a: Asset, original: boolean): string =>
  listenPath(a, original) ?? playbackPath(a);

/** The drop shadow as a CSS filter (k = screen pixels per 1080p pixel); same blur as the export. */
function cssShadow(s: Shadow, k: number): string {
  const { dx, dy } = shadowOffset(s);
  const v = parseInt(s.color.slice(1, 7), 16);
  return `drop-shadow(${dx * k}px ${dy * k}px ${s.blur * k}px rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${s.opacity}))`;
}

/** Mask of the outgoing scene's glitch blocks (same cells and timing as the export), cached per frame. */
const glitchMasks = new Map<string, string>();
function glitchMask(e: number, slot: number): string {
  const key = `${slot}:${e.toFixed(2)}`;
  let url = glitchMasks.get(key);
  if (!url) {
    const { cols, rows } = GLITCH_GRID;
    const cell = 16;
    const c = document.createElement("canvas");
    c.width = cols * cell;
    c.height = rows * cell;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#000";
    for (let by = 0; by < rows; by++)
      for (let bx = 0; bx < cols; bx++)
        if (glitchBlockVisible(bx, by, slot, e)) ctx.fillRect(bx * cell, by * cell, cell, cell);
    url = `url(${c.toDataURL()})`;
    if (glitchMasks.size > 400) glitchMasks.clear();
    glitchMasks.set(key, url);
  }
  return url;
}

export function Preview(): ReactNode {
  // A draft waiting for review is what the preview shows.
  const raw = useShownProject();
  const captionCues = useCues(raw);
  const textCues = useMemo(
    () =>
      captionCues.map((cue) => ({
        start: cue.start,
        end: cue.end,
        text: cue.lines.map((line) => line.map((word) => word.text).join(" ")).join("\n"),
      })),
    [captionCues],
  );
  // Drawn through the same transition model as the export (dissolve tails, fades).
  const project = useMemo(() => (raw ? withTransitions(raw) : null), [raw]);
  const selection = useProject((s) => s.selection);
  // A/B of the audio panel: the original voice instead of the treated one.
  const original = useVoiceListen((s) => s.original);
  const [mountKey, setMountKey] = useState("");
  const media = useRef(new Map<string, HTMLVideoElement | HTMLAudioElement | HTMLImageElement>());
  const layers = useRef(new Map<string, HTMLDivElement>());
  const contents = useRef(new Map<string, HTMLDivElement>());
  const flaps = useRef(new Map<string, HTMLSpanElement>());
  const areaRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState({ w: 640, h: 360 });
  // Zoom and pan of the preview itself (not of the lesson): the stage is laid out bigger, so
  // everything drawn on it keeps using the same scale.
  const [view, setView] = useState({ zoom: 1, x: 0, y: 0 });
  const size = { w: Math.round(fit.w * view.zoom), h: Math.round(fit.h * view.zoom) };
  const [safeArea, setSafeArea] = useState(() => remembered(SAFE_KEY));
  const zoomed = useRef(false);
  zoomed.current = view.zoom !== 1;
  // Ctrl + wheel zooms the preview around the pointer (never the page); the wheel alone moves a
  // zoomed preview. A listener of its own, since React's wheel listener cannot hold the page.
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      if (e.ctrlKey) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        const px = e.clientX - rect.left - rect.width / 2;
        const py = e.clientY - rect.top - rect.height / 2;
        setView((v) => zoomedView(v, factor, px, py));
      } else if (zoomed.current) {
        e.preventDefault();
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  const [guides, setGuides] = useState<Guides | null>(null);
  const live = useLiveEdit((s) => s.live);
  const [draft, setDraft] = useState<{ id: string; t: Transform } | null>(null);
  const [tailEditing, setTailEditing] = useState<string | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  // Background music steps aside while anyone speaks (the same envelope as the export).
  const speech = useRef<[number, number][]>([]);
  speech.current = useSpeechSpans(raw);
  const ducking = useRef(DUCKING);
  ducking.current = raw ? duckingOf(raw) : DUCKING;
  const settings = project?.settings ?? { width: 1920, height: 1080, fps: 30 };
  const scale = size.w / settings.width;

  // Fit the stage to the available area, keeping the project's aspect ratio. Full screen shows
  // the area itself (not just the stage), so this same measure fills the screen.
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const aw = el.clientWidth;
      const ah = el.clientHeight;
      const ratio = settings.width / settings.height;
      const w = Math.min(aw, ah * ratio);
      setFit({ w: Math.floor(w), h: Math.floor(w / ratio) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [settings.width, settings.height]);

  // Recompute which clips need media elements only when that set changes, not every frame.
  useEffect(() => {
    if (!project) return;
    const update = (): void => {
      const key = mountedClipIds(project, usePlayback.getState().time);
      setMountKey((prev) => (prev === key ? prev : key));
    };
    update();
    return usePlayback.subscribe(update);
  }, [project]);

  // While a zoom layer is selected the preview shows the frame without it (its box is drawn instead).
  const editingZoom =
    selection.length === 1
      ? (project?.clips.find((c) => c.id === selection[0] && c.zoomLayer)?.id ?? null)
      : null;

  // Drive every media element and layer from the playback clock.
  useEffect(() => {
    if (!project) return;
    const assets = assetMap(project);
    const tracks = new Map(project.tracks.map((t) => [t.id, t]));
    const order = new Map(project.tracks.map((t, i) => [t.id, i]));
    const clips = new Map(project.clips.map((c) => [c.id, c]));
    const mounted = new Set(mountKey.split(","));
    // The media's zooms over each mounted clip's stretch of the source.
    const zoomsOf = new Map(
      project.clips
        .filter((c) => mounted.has(c.id))
        .map((c) => [c.id, zoomsIn(assets.get(c.assetId)?.zooms, c.in, sourceEnd(c))]),
    );
    const frame = 1 / project.settings.fps;

    const sync = (): void => {
      const { time: t, playing, rate } = usePlayback.getState();
      const live = useLiveEdit.getState().live;
      const solo = useApp.getState().solo;
      for (const [id, layer] of layers.current) {
        if (!mounted.has(id)) continue;
        const c = clips.get(id);
        const track = c && tracks.get(c.trackId);
        if (!c || !track) continue;
        const active = t >= c.start && t < clipEnd(c) && !track.hidden;
        layer.style.visibility = active ? "visible" : "hidden";
        if (active) {
          // Entrance/exit: same curves as the export (size around the center, offset, opacity).
          const a = animAt(c, t);
          const shown = liveTransform(c, live);
          layer.style.opacity = String(shown.opacity * a.opacity);
          const stage = stageRef.current;
          // Movement first, then the turn around the layer's own center (as the export draws it).
          const turn = spin(rotationOf(shown));
          const moves = a.scale !== 1 || a.dx || a.dy;
          layer.style.transformOrigin = moves || turn ? "0 0" : "";
          layer.style.transform = moves
            ? `translate(${a.dx * (stage?.clientWidth ?? 0)}px, ${a.dy * (stage?.clientHeight ?? 0)}px) translate(50%, 50%) scale(${a.scale}) translate(-50%, -50%)${turn}`
            : turn.trim();
          // Transition tails: a mask wipes them away, or they turn like a page (same curves as the export).
          const dc = c as DerivedClip;
          const e = dc.tailFx ? tailProgress(dc, t) : 0;
          const w = layer.offsetWidth;
          const h = layer.offsetHeight;
          const fx =
            isMask(dc.tailFx) && e > 0
              ? dc.tailFx === "glitch"
                ? {
                    mask: glitchMask(
                      e,
                      glitchSlot(t - (dc.start + dc.duration - (dc.tail ?? 0)), GLITCH_GRID.rate),
                    ),
                  }
                : maskCss(dc.tailFx, e, w, h)
              : {};
          layer.style.clipPath = fx.clipPath ?? "";
          layer.style.maskImage = fx.mask ?? "";
          layer.style.maskSize = fx.mask ? "100% 100%" : "";
          // Paper fold: what is left of the page, and the flap showing the back of the paper.
          const flap = flaps.current.get(id);
          if (dc.tailFx === "fold" && e > 0) {
            const g = foldGeometry(e, w, h);
            const poly = (pts: [number, number][]): string =>
              `polygon(${pts.map(([x, y]) => `${x.toFixed(1)}px ${y.toFixed(1)}px`).join(",")})`;
            layer.style.clipPath = g.page.length ? poly(g.page) : "inset(50%)";
            if (flap) {
              const mMax = w * FOLD.u[0] + h * FOLD.u[1];
              const at = mMax - g.line;
              const [pr, pg, pb] = FOLD.paper;
              flap.style.display = g.flap.length ? "block" : "none";
              flap.style.clipPath = g.flap.length ? poly(g.flap) : "";
              flap.style.background = `linear-gradient(${Math.atan2(-FOLD.u[0], FOLD.u[1])}rad, rgb(${pr * 0.78},${pg * 0.78},${pb * 0.78}) ${at}px, rgb(${pr},${pg},${pb}) ${at + 0.18 * mMax}px)`;
            }
          } else if (flap) flap.style.display = "none";
          if (dc.tailFx === "page" && e > 0) {
            layer.style.transformOrigin = "0 0";
            // The page folds first and the folded page turns (the export's order): the turn is
            // written first, since CSS applies the list from the right.
            layer.style.transform = `${turn} ${quadMatrix3d(
              layer.offsetWidth,
              layer.offsetHeight,
              pageCorners(e, layer.offsetWidth, layer.offsetHeight),
            )}`.trim();
          }
        }
        const content = contents.current.get(id);
        // Keyframed movement: place the layer for this moment (same curves as the export).
        const asset = assets.get(c.assetId);
        if (c.keyframes?.length && asset && content && draftRef.current?.id !== id) {
          const k = stageRef.current ? stageRef.current.clientWidth / project.settings.width : 0;
          const lay = clipLayout({ transform: transformAt(c, t) }, asset, project.settings);
          Object.assign(layer.style, {
            left: `${lay.visible.x * k}px`,
            top: `${lay.visible.y * k}px`,
            width: `${lay.visible.w * k}px`,
            height: `${lay.visible.h * k}px`,
          });
          Object.assign(content.style, {
            left: `${(lay.full.x - lay.visible.x) * k}px`,
            top: `${(lay.full.y - lay.visible.y) * k}px`,
            width: `${lay.full.w * k}px`,
            height: `${lay.full.h * k}px`,
          });
        }
        // Zoom: the same view the export computes, from the source time on screen.
        const zooms = zoomsOf.get(id);
        if (content && zooms?.length) {
          const el = media.current.get(id);
          const src = el instanceof HTMLVideoElement && active ? el.currentTime : sourceAt(c, t);
          const v = zoomAt(zooms, src);
          content.style.transform = `translate(${(0.5 - v.cx * v.scale) * 100}%, ${(0.5 - v.cy * v.scale) * 100}%) scale(${v.scale})`;
        } else if (content) content.style.transform = "";
        // Zoom layers above this track: the same view as the export, applied to this layer.
        const stage = stageRef.current;
        const views =
          active && stage
            ? zoomsOver(project, order.get(c.trackId) ?? 0, t, editingZoom ?? undefined)
            : [];
        if (
          views.length &&
          stage &&
          !((c as DerivedClip).tailFx === "page" && tailProgress(c as DerivedClip, t) > 0)
        ) {
          const A = zoomAffine(views, stage.clientWidth, stage.clientHeight);
          const m = animAt(c, t);
          const w = layer.offsetWidth;
          const h = layer.offsetHeight;
          const dx = m.dx * stage.clientWidth;
          const dy = m.dy * stage.clientHeight;
          const X =
            A.s * (layer.offsetLeft + w / 2 + dx - (m.scale * w) / 2) + A.tx - layer.offsetLeft;
          const Y =
            A.s * (layer.offsetTop + h / 2 + dy - (m.scale * h) / 2) + A.ty - layer.offsetTop;
          layer.style.transformOrigin = "0 0";
          layer.style.transform = `translate(${X}px, ${Y}px) scale(${A.s * m.scale})${spin(rotationOf(liveTransform(c, live)))}`;
        }
      }
      for (const [id, el] of media.current) {
        const voice = id.endsWith(VOICE);
        const c = clips.get(voice ? id.slice(0, -VOICE.length) : id);
        const asset = c && assets.get(c.assetId);
        const track = c && tracks.get(c.trackId);
        if (!c || !asset || !track || el instanceof HTMLImageElement) continue;
        const active = t >= c.start && t < clipEnd(c);
        const tail = (c as DerivedClip).tail;
        // A dissolve tail is picture only: the sound stops at the real cut. A cut-out avatar's
        // picture is silent; its voice element plays the sound instead.
        el.muted =
          !heard(track, solo) ||
          !!c.mutedFor ||
          !asset.hasAudio ||
          (!!tail && t >= clipEnd(c) - tail) ||
          (!voice && el instanceof HTMLVideoElement && needsVoice(asset, original));
        el.volume = Math.min(
          1,
          Math.max(
            0,
            c.volume *
              (ducks(track)
                ? duckGain(speech.current, t, ducking.current.depth, ducking.current.ramp)
                : 1),
          ),
        );
        const local = sourceAt(c, t);
        // The clip's own speed multiplies the playback rate (the browser keeps the pitch, like
        // atempo), also at half and a quarter of the speed with K held.
        const r = rate * clipSpeed(c);
        if (!el.preservesPitch) el.preservesPitch = true;
        if (active && playing && rate > 0) {
          if (el.paused) {
            if (el.playbackRate !== r) el.playbackRate = r;
            el.currentTime = local;
            void el.play().catch(() => undefined);
          } else {
            // Picture and the cut-out avatar's voice follow the clock the same way (shared/playbackSync.ts).
            const fix = driftCorrection(el.currentTime, local, r, frame, el.playbackRate !== r);
            if (fix.seek) el.currentTime = local;
            if (el.playbackRate !== fix.rate) el.playbackRate = fix.rate;
          }
        } else {
          if (!el.paused) el.pause();
          const target = active ? local : c.in;
          if (!el.seeking && Math.abs(el.currentTime - target) > frame / 2) el.currentTime = target;
        }
      }
    };
    sync();
    const unsub = usePlayback.subscribe(sync);
    // A slider held in the panel and the solo of a track show at once.
    const unsubLive = useLiveEdit.subscribe(sync);
    const unsubSolo = useApp.subscribe((s, prev) => {
      if (s.solo !== prev.solo) sync();
    });
    const onSeeked = (): void => {
      sync();
    };
    const els = [...media.current.values()].filter(
      (e): e is HTMLMediaElement => !(e instanceof HTMLImageElement),
    );
    els.forEach((m) => {
      m.addEventListener("seeked", onSeeked);
    });
    return () => {
      unsub();
      unsubLive();
      unsubSolo();
      els.forEach((m) => {
        m.removeEventListener("seeked", onSeeked);
      });
    };
  }, [project, mountKey, editingZoom, original]);

  // Pause everything when leaving the editor.
  useEffect(
    () => () => {
      for (const el of media.current.values()) if (!(el instanceof HTMLImageElement)) el.pause();
    },
    [],
  );

  const mountedIds = new Set(mountKey.split(",").filter(Boolean));
  const assets = assetMap(project);
  const trackIndex = new Map((project?.tracks ?? []).map((t, i) => [t.id, i]));
  const mounted = (project?.clips ?? []).filter((c) => mountedIds.has(c.id));
  const proxyActive = project?.assets.some((a) => a.proxyStatus === "ready");
  const keying =
    project?.assets.filter(
      (a) => a.key && a.keyStatus === "pending" && project.clips.some((c) => c.assetId === a.id),
    ) ?? [];
  const jobs = useApp((s) => s.jobs);
  const keyJob = Object.values(jobs).find((j) => j.label.startsWith("Removendo fundo"));

  const transformOf = (c: Clip): Transform =>
    draft?.id === c.id ? draft.t : liveTransform(c, live);

  /** The pictures on screen at time `t`, top layer first, with what each one covers. */
  const visibleAt = (t: number): { clip: Clip; bounds: Box }[] => {
    if (!project) return [];
    const out: { clip: Clip; bounds: Box; order: number }[] = [];
    for (const c of project.clips) {
      const a = assets.get(c.assetId);
      const track = project.tracks.find((tr) => tr.id === c.trackId);
      if (!a || a.missing || c.zoomLayer || !isVisual(project, c, a) || !track || track.hidden)
        continue;
      if (t < c.start || t >= clipEnd(c)) continue;
      out.push({
        clip: c,
        bounds: clipLayout({ transform: transformAt(c, t) }, a, project.settings).bounds,
        order: trackIndex.get(c.trackId) ?? 0,
      });
    }
    return out.sort((x, y) => x.order - y.order);
  };

  /**
   * Alt + click (without dragging): the picture under the one selected at that point (each
   * Alt + click goes one layer down, and from the bottom back to the top). Alt + drag moves the
   * picture clicked without snapping, as before.
   */
  const layerBelow = (clientX: number, clientY: number, clicked: Clip): Clip => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || !project) return clicked;
    const fx = ((clientX - rect.left) / rect.width) * project.settings.width;
    const fy = ((clientY - rect.top) / rect.height) * project.settings.height;
    const stack = visibleAt(usePlayback.getState().time)
      .filter(({ bounds: b }) => fx >= b.x && fx <= b.x + b.w && fy >= b.y && fy <= b.y + b.h)
      .map(({ clip }) => clip);
    if (stack.length < 2) return clicked;
    const current = useProject.getState().selection[0];
    const at = stack.findIndex((c) => c.id === (current ?? clicked.id));
    return stack[(at < 0 ? stack.findIndex((c) => c.id === clicked.id) : at) + 1] ?? stack[0];
  };

  /** Moves (or, from a corner, resizes) a clip by dragging it on the stage; one drag is one undo step. */
  const startDrag = (e: ReactPointerEvent, clip: Clip, mode: "move" | "scale"): void => {
    if (e.button !== 0 || !project) return;
    const track = project.tracks.find((t) => t.id === clip.trackId);
    const asset = assets.get(clip.assetId);
    if (!asset) return;
    e.stopPropagation();
    // Which layer an Alt + click goes to is decided now, from the selection before the click,
    // and chosen only if the pointer goes up without dragging.
    const below = e.altKey && mode === "move" ? layerBelow(e.clientX, e.clientY, clip) : null;
    const pick = (): void => {
      if (!useProject.getState().selection.includes(clip.id))
        useProject.getState().select([clip.id]);
    };
    if (track?.locked) {
      if (below) useProject.getState().select([below.id]);
      else pick();
      return;
    }
    if (!below) pick();
    e.preventDefault();
    const rect = stageRef.current!.getBoundingClientRect();
    const base = clip.keyframes?.length
      ? transformAt(clip, usePlayback.getState().time)
      : (clip.transform ?? DEFAULT_TRANSFORM);
    const frame = project.settings;
    const px = rect.width / frame.width;
    const cx = rect.left + base.x * rect.width;
    const cy = rect.top + base.y * rect.height;
    const d0 = Math.max(4, Math.hypot(e.clientX - cx, e.clientY - cy));
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;

    // The frame's edges and center, and the edges and centers of the other pictures on screen.
    const others = visibleAt(usePlayback.getState().time).filter((o) => o.clip.id !== clip.id);
    const targetsX = [0, frame.width / 2, frame.width];
    const targetsY = [0, frame.height / 2, frame.height];
    for (const { bounds: b } of others) {
      targetsX.push(b.x, b.x + b.w / 2, b.x + b.w);
      targetsY.push(b.y, b.y + b.h / 2, b.y + b.h);
    }
    /** The nearest target of any of `edges` within the threshold: [offset, target] or null. */
    const nearest = (edges: number[], targets: number[], thr: number): [number, number] | null => {
      let best: [number, number] | null = null;
      for (const edge of edges)
        for (const target of targets) {
          const d = target - edge;
          if (Math.abs(d) < thr && (!best || Math.abs(d) < Math.abs(best[0]))) best = [d, target];
        }
      return best;
    };
    const snap = (t: Transform): Transform => {
      const v = clipLayout({ transform: t }, asset, frame).bounds;
      const thr = SNAP_PX / px;
      const alongX = nearest([v.x, v.x + v.w / 2, v.x + v.w], targetsX, thr);
      const alongY = nearest([v.y, v.y + v.h / 2, v.y + v.h], targetsY, thr);
      setGuides(
        alongX || alongY ? { x: alongX ? [alongX[1]] : [], y: alongY ? [alongY[1]] : [] } : null,
      );
      return {
        ...t,
        x: t.x + (alongX?.[0] ?? 0) / frame.width,
        y: t.y + (alongY?.[0] ?? 0) / frame.height,
      };
    };

    const onMove = (ev: PointerEvent): void => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 3) return;
      if (!moved && below) pick();
      moved = true;
      let t: Transform;
      if (mode === "move") {
        t = {
          ...base,
          x: base.x + (ev.clientX - sx) / rect.width,
          y: base.y + (ev.clientY - sy) / rect.height,
        };
        if (!ev.altKey) t = snap(t);
        else setGuides(null);
      } else {
        const d = Math.hypot(ev.clientX - cx, ev.clientY - cy);
        t = { ...base, scale: Math.min(5, Math.max(0.05, (base.scale * d) / d0)) };
      }
      setDraft({ id: clip.id, t });
    };
    const onUp = (): void => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setGuides(null);
      const done = draftRef.current;
      if (!moved && below) useProject.getState().select([below.id]);
      if (moved && done) {
        const local = Math.max(
          0,
          Math.min(clip.duration, usePlayback.getState().time - clip.start),
        );
        useProject.getState().commit((p) => ({
          ...p,
          clips: p.clips.map((c) =>
            c.id !== clip.id
              ? c
              : c.keyframes?.length
                ? {
                    ...c,
                    keyframes: upsertKeyframe(c.keyframes, {
                      t: local,
                      x: done.t.x,
                      y: done.t.y,
                      scale: done.t.scale,
                    }),
                  }
                : { ...c, transform: done.t },
          ),
        }));
      }
      setDraft(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const mediaRef =
    (c: Clip, suffix = "") =>
    (el: HTMLVideoElement | HTMLAudioElement | HTMLImageElement | null) => {
      if (el) media.current.set(c.id + suffix, el);
      else media.current.delete(c.id + suffix);
    };
  const flapRef = (c: Clip) => (el: HTMLSpanElement | null) => {
    if (el) flaps.current.set(c.id, el);
    else flaps.current.delete(c.id);
  };
  const layerRef = (c: Clip) => (el: HTMLDivElement | null) => {
    if (el) layers.current.set(c.id, el);
    else layers.current.delete(c.id);
  };
  const contentRef = (c: Clip) => (el: HTMLDivElement | null) => {
    if (el) contents.current.set(c.id, el);
    else contents.current.delete(c.id);
  };

  /** Zooms the preview by `factor`, keeping the point (`px`, `py` from the area's center) still. */
  const zoomView = (factor: number, px = 0, py = 0): void =>
    setView((v) => zoomedView(v, factor, px, py));

  const selected =
    selection.length === 1 ? project?.clips.find((c) => c.id === selection[0]) : undefined;
  const selectedAsset = selected && assets.get(selected.assetId);

  return (
    <section className="preview">
      <div className="preview-header">
        <div className="row-6">
          <span className="info-chip">
            <Monitor size={12} /> {settings.width}×{settings.height} · {settings.fps} fps
          </span>
          {proxyActive && (
            <span
              className="info-chip"
              title="O preview usa cópias leves (720p) dos vídeos 4K. A exportação sempre usa o original."
            >
              <Zap size={12} className="accent" /> Proxy ativo
            </span>
          )}
          {keying.length > 0 && (
            <span
              className="info-chip"
              title="Enquanto isso o preview mostra o vídeo com o fundo original."
            >
              <Loader size={12} className="spin accent" /> Removendo fundo
              {keyJob ? ` ${Math.round(keyJob.ratio * 100)}%` : "…"}
            </span>
          )}
        </div>
        <div className="row-4 preview-view">
          <button
            type="button"
            className={`ctl ctl-sm ${safeArea ? "is-on" : ""}`}
            aria-pressed={safeArea}
            title="Áreas seguras: a margem de 5% que todo player mostra, onde a legenda e o apresentador costumam ficar"
            onClick={() => {
              setSafeArea(!safeArea);
              try {
                localStorage.setItem(SAFE_KEY, safeArea ? "0" : "1");
              } catch {
                // Only a convenience: the choice is not kept.
              }
            }}
          >
            <ShieldCheck size={14} />
          </button>
          <button
            type="button"
            className="ctl ctl-sm"
            title="Afastar a prévia (Ctrl + roda do mouse)"
            disabled={view.zoom <= VIEW_MIN}
            onClick={() => zoomView(1 / 1.25)}
          >
            <Minus size={13} />
          </button>
          <button
            type="button"
            className="ctl ctl-sm view-percent mono"
            title="Ajustar a prévia à área (clique)"
            onClick={() => setView({ zoom: 1, x: 0, y: 0 })}
          >
            {Math.round(view.zoom * 100)}%
          </button>
          <button
            type="button"
            className="ctl ctl-sm"
            title="Aproximar a prévia (Ctrl + roda do mouse; arraste com o botão do meio para mover)"
            disabled={view.zoom >= VIEW_MAX}
            onClick={() => zoomView(1.25)}
          >
            <Plus size={13} />
          </button>
        </div>
      </div>

      <div
        className="stage-area"
        ref={areaRef}
        onPointerDown={(e) => {
          if (e.button !== 1) return;
          // Middle button: moves the zoomed preview around.
          e.preventDefault();
          const start = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
          const move = (ev: PointerEvent): void =>
            setView((v) => ({
              ...v,
              x: start.vx + ev.clientX - start.x,
              y: start.vy + ev.clientY - start.y,
            }));
          const up = (): void => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
          };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", up);
        }}
      >
        <div
          className="stage"
          role="application"
          aria-label="Prévia da aula. Transformações também disponíveis no painel de propriedades."
          ref={stageRef}
          style={{
            width: size.w,
            height: size.h,
            transform: view.x || view.y ? `translate(${view.x}px, ${view.y}px)` : undefined,
          }}
          onDoubleClick={() => void areaRef.current?.requestFullscreen()}
          onPointerDown={(e) => {
            if (e.button === 0) useProject.getState().select([]);
          }}
        >
          {mounted.map((c) => {
            const a = assets.get(c.assetId);
            if (!a || a.missing || !project || c.zoomLayer) return null;
            if (!isVisual(project, c, a))
              return (
                <PreviewMedia
                  kind="audio"
                  clip={c}
                  cues={textCues}
                  key={c.id}
                  mediaRef={mediaRef(c)}
                  src={mediaUrl(soundPath(a, original))}
                />
              );
            const lay = clipLayout({ transform: transformOf(c) }, a, settings);
            const tf = transformOf(c);
            const radius = maskRadius(tf, lay.visible.w, lay.visible.h, settings.height) * scale;
            const box = {
              left: lay.visible.x * scale,
              top: lay.visible.y * scale,
              width: lay.visible.w * scale,
              height: lay.visible.h * scale,
              borderRadius: radius || undefined,
              filter: tf.shadow
                ? cssShadow(tf.shadow, (settings.height / 1080) * scale)
                : undefined,
            };
            const inner = {
              left: (lay.full.x - lay.visible.x) * scale,
              top: (lay.full.y - lay.visible.y) * scale,
              width: lay.full.w * scale,
              height: lay.full.h * scale,
            };
            return (
              <div
                key={c.id}
                ref={layerRef(c)}
                className="stage-layer"
                style={{
                  ...box,
                  zIndex:
                    (100 - (trackIndex.get(c.trackId) ?? 0)) * 2 +
                    ((c as DerivedClip).drawAfter ? 1 : 0),
                  visibility: "hidden",
                }}
                onPointerDown={(e) => startDrag(e, c, "move")}
              >
                <div
                  className="stage-flip"
                  style={
                    tf.flipH || tf.flipV
                      ? { transform: `scale(${tf.flipH ? -1 : 1}, ${tf.flipV ? -1 : 1})` }
                      : undefined
                  }
                >
                  <div ref={contentRef(c)} className="stage-content" style={inner}>
                    {a.kind === "image" ? (
                      <img
                        ref={mediaRef(c)}
                        src={mediaUrl(a.path)}
                        className="stage-media"
                        style={{ opacity: tailEditing === c.id ? 0 : undefined }}
                        alt=""
                        draggable={false}
                      />
                    ) : (
                      <PreviewMedia
                        kind="video"
                        clip={c}
                        cues={textCues}
                        mediaRef={mediaRef(c)}
                        src={mediaUrl(visualPath(a))}
                        className="stage-media"
                      />
                    )}
                    {a.kind === "video" && needsVoice(a, original) && (
                      <PreviewMedia
                        kind="audio"
                        clip={c}
                        cues={textCues}
                        mediaRef={mediaRef(c, VOICE)}
                        src={mediaUrl(soundPath(a, original))}
                      />
                    )}
                    {a.cursor && (
                      <CursorLayer
                        asset={a}
                        width={inner.width}
                        height={inner.height}
                        getVideo={() => media.current.get(c.id) as HTMLVideoElement | undefined}
                      />
                    )}
                  </div>
                </div>
                {(c as DerivedClip).tailFx === "fold" && (
                  <span ref={flapRef(c)} className="paper-flap" />
                )}
                {tf.border && (
                  <span
                    className="stage-ring"
                    style={{
                      borderRadius: radius || undefined,
                      borderColor: tf.border,
                      borderWidth: ((BORDER_WIDTH * settings.height) / 1080) * scale,
                    }}
                  />
                )}
              </div>
            );
          })}
          {project?.cutFx && (
            <CutFxLayer effects={project.cutFx} width={size.w} height={size.h} frame={settings} />
          )}
          {project?.captions?.burn && (
            <CaptionOverlay project={project} width={size.w} height={size.h} />
          )}
          {project && <KeyOverlay project={project} height={size.h} />}
          {safeArea && <SafeAreas portrait={settings.height > settings.width} />}
          {guides && (
            <div className="stage-guides" aria-hidden="true">
              {guides.x.map((x) => (
                <span key={`x${x}`} className="stage-guide is-v" style={{ left: x * scale }} />
              ))}
              {guides.y.map((y) => (
                <span key={`y${y}`} className="stage-guide is-h" style={{ top: y * scale }} />
              ))}
            </div>
          )}
          {selected?.zoomLayer && <ZoomTarget clip={selected} width={size.w} height={size.h} />}
          {selected &&
            selectedAsset &&
            project &&
            !selected.zoomLayer &&
            isVisual(project, selected, selectedAsset) && (
              <Gizmo
                dragging={draft?.id === selected.id}
                clip={selected}
                asset={selectedAsset}
                transform={transformOf(selected)}
                project={project}
                scale={scale}
                onDrag={startDrag}
              />
            )}
          {!project?.clips.length && (
            <div className="stage-empty">
              <strong>Nada na timeline ainda</strong>
              <span>Arraste um vídeo da biblioteca para a timeline.</span>
            </div>
          )}
          {selected?.annotation?.kind === "balloon" && selectedAsset && project && (
            <BalloonTailControl
              key={selected.id}
              clip={selected}
              asset={selectedAsset}
              project={project}
              scale={scale}
              onEditing={setTailEditing}
            />
          )}
        </div>
      </div>

      <Transport
        fps={settings.fps}
        onFullscreen={() => void areaRef.current?.requestFullscreen()}
      />
    </section>
  );
}

/** Selection frame on the stage: drag inside to move, drag a corner to resize. Shown while the clip is on screen. */
function Gizmo({
  dragging,
  clip,
  asset,
  transform,
  project,
  scale,
  onDrag,
}: {
  dragging: boolean;
  clip: Clip;
  asset: Asset;
  transform: Transform;
  project: Project;
  scale: number;
  onDrag: (e: ReactPointerEvent, clip: Clip, mode: "move" | "scale") => void;
}): ReactNode {
  const time = usePlayback((s) =>
    clip.keyframes?.length ? s.time : s.time >= clip.start && s.time < clipEnd(clip) ? 1 : 0,
  );
  const onScreen = usePlayback((s) => s.time >= clip.start && s.time < clipEnd(clip));
  if (!onScreen) return null;
  // Moving clips show where they are now; while dragging, where the drag puts them.
  const shown =
    clip.keyframes?.length && !dragging ? { ...transform, ...transformAt(clip, time) } : transform;
  const lay = clipLayout({ transform: shown }, asset, project.settings);
  const v = lay.visible;
  const style = {
    left: v.x * scale,
    top: v.y * scale,
    width: v.w * scale,
    height: v.h * scale,
    ...(lay.rotation ? { transform: `rotate(${lay.rotation}deg)` } : {}),
  };
  return (
    <fieldset
      className="gizmo"
      aria-label="Transformação do clipe selecionado"
      style={style}
      onPointerDown={(e) => onDrag(e, clip, "move")}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {(["nw", "ne", "sw", "se"] as const).map((h) => (
        <span
          key={h}
          className={`gizmo-handle gizmo-${h}`}
          onPointerDown={(e) => onDrag(e, clip, "scale")}
        />
      ))}
      {asset.key && asset.keyStatus !== "ready" && (
        <span className="gizmo-badge">
          <Wand2 size={11} /> removendo fundo…
        </span>
      )}
    </fieldset>
  );
}

function Transport({ fps, onFullscreen }: { fps: number; onFullscreen: () => void }): ReactNode {
  const time = usePlayback((s) => s.time);
  const playing = usePlayback((s) => s.playing);
  const rate = usePlayback((s) => s.rate);
  const shown = useShownProject();
  const total = shown ? projectDuration(shown) : 0;
  return (
    <div className="transport">
      <div className="tc">
        <span className="tc-now mono">{timecode(time, fps)}</span>
        <span className="tc-total mono">/ {timecode(total, fps)}</span>
      </div>
      <div className="controls">
        <button
          type="button"
          className="ctl"
          title="Início (Home)"
          onClick={() => playback.seek(0)}
        >
          <SkipBack size={16} />
        </button>
        <button
          type="button"
          className="ctl"
          title="Quadro anterior (←)"
          onClick={() => playback.step(-1 / fps)}
        >
          <ChevronLeft size={16} />
        </button>
        <button
          type="button"
          className="ctl ctl-play"
          title="Play / pausa (Espaço)"
          onClick={playback.toggle}
        >
          {playing ? <Pause size={17} /> : <Play size={17} />}
        </button>
        <button
          type="button"
          className="ctl"
          title="Próximo quadro (→)"
          onClick={() => playback.step(1 / fps)}
        >
          <ChevronRight size={16} />
        </button>
        <button
          type="button"
          className="ctl"
          title="Fim (End)"
          onClick={() => playback.seek(Infinity)}
        >
          <SkipForward size={16} />
        </button>
      </div>
      <div className="row-6">
        <span
          className="info-chip mono"
          title="J volta, K pausa e L avança; aperte de novo para acelerar. Segure K com J ou L para ir devagar (0,5× e 0,25×)."
        >
          {playing ? `${String(rate).replace(".", ",")}×` : "J K L"}
        </span>
        <button
          type="button"
          className="ctl"
          title="Tela cheia (duplo clique no vídeo)"
          onClick={onFullscreen}
        >
          <Maximize size={15} />
        </button>
      </div>
    </div>
  );
}

/**
 * Safe areas over the preview: the 5% margin every player keeps, the band where the captions go
 * and, in a horizontal lesson, the side where the presenter usually stands (AVATAR_PLACEMENTS).
 */
function SafeAreas({ portrait }: { portrait: boolean }): ReactNode {
  return (
    <div className="safe-areas" aria-hidden="true">
      <span className="safe-action" />
      <span className={`safe-zone safe-captions ${portrait ? "is-portrait" : ""}`}>
        <em>Legenda</em>
      </span>
      {!portrait && (
        <span className="safe-zone safe-presenter">
          <em>Apresentador</em>
        </span>
      )}
    </div>
  );
}
