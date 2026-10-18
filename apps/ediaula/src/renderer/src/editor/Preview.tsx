import { DUCKING, duckGain, duckingOf, ducks, spotlightSpans } from "@shared/audio";
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
import { gainAt } from "@shared/gain";
import { transformAt, upsertKeyframe } from "@shared/keyframes";
import {
  backgroundCss,
  boxBlurSigma,
  colorSvg,
  DEVICE_COLORS,
  deviceGeometry,
  hasColor,
  type RegionFx,
  spotlightDarkness,
} from "@shared/look";
import { driftCorrection } from "@shared/playbackSync";
import { regionRectAt, regionStrength } from "@shared/regionFollow";
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
import { clipCues } from "@shared/webvtt";
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
import { clipRevealTimes, revealing, revealPicture, revealStateAt } from "@/lib/reveal";
import { listenPath, useVoiceListen } from "@/lib/voice";
import { heard, useApp } from "@/state/app";
import { liveTransform, useLiveEdit } from "@/state/liveEdit";
import { playback, usePlayback } from "@/state/playback";
import { assetMap, useProject, useShownProject } from "@/state/project";
import { BalloonTailControl } from "./BalloonTailControl";
import { CaptionOverlay, KeyOverlay, useCues } from "./CaptionOverlay";
import { CursorLayer } from "./CursorLayer";
import { CutFxLayer } from "./CutFxLayer";
import { MediaPool } from "./mediaPool";
import { buildLanes, type LanePlan, type PoolClip, pictureTarget, planLane } from "./previewPool";
import { RegionTarget } from "./RegionTarget";
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

/** Bumped whenever the captions change, so each element's track is made again. */
let captionsVersion = 0;

export function Preview(): ReactNode {
  // A draft waiting for review is what the preview shows.
  const raw = useShownProject();
  // The words heard, for the captions track of each media element (clipCues, source seconds).
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
  const cuesVersion = useMemo(() => {
    captionsVersion += 1;
    return `${captionsVersion}:${textCues.length}`;
  }, [textCues]);
  // Drawn through the same transition model as the export (dissolve tails, fades).
  const project = useMemo(() => (raw ? withTransitions(raw) : null), [raw]);
  const selection = useProject((s) => s.selection);
  // A/B of the audio panel: the original voice instead of the treated one.
  const original = useVoiceListen((s) => s.original);
  const [mountKey, setMountKey] = useState("");
  /** The media element serving each clip now (its picture or sound; `<id>#voice` its voice). */
  const served = useRef(new Map<string, HTMLMediaElement>());
  /** Where each video clip's element goes (its layer), and the pictures of still clips. */
  const hosts = useRef(new Map<string, HTMLDivElement>());
  const images = useRef(new Map<string, HTMLImageElement>());
  const regions = useRef(new Map<string, HTMLDivElement>());
  const parkingRef = useRef<HTMLDivElement>(null);
  const poolRef = useRef<MediaPool | null>(null);
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

  /**
   * The lanes of the pool (previewPool.ts): each file of each track in each role (picture, voice
   * of a cut-out or treated video, sound) with its pieces in order.
   */
  const lanes = useMemo(() => {
    const info = new Map<
      string,
      { kind: "video" | "audio"; path: string; role: "p" | "v" | "s" }
    >();
    const entries: { lane: string; clip: PoolClip }[] = [];
    if (!project) return { lanes: new Map<string, PoolClip[]>(), info };
    const assets = assetMap(project);
    for (const c of project.clips) {
      const a = assets.get(c.assetId);
      if (!a || a.missing || c.zoomLayer || c.regionFx || a.kind === "image") continue;
      const clip: PoolClip = {
        id: c.id,
        start: c.start,
        end: clipEnd(c),
        in: c.in,
        speed: clipSpeed(c),
      };
      const add = (role: "p" | "v" | "s", kind: "video" | "audio", path: string): void => {
        const lane = `${role}|${c.trackId}|${path}`;
        info.set(lane, { kind, path, role });
        entries.push({ lane, clip });
      };
      if (a.kind === "video") {
        add("p", "video", visualPath(a));
        if (needsVoice(a, original)) add("v", "audio", soundPath(a, original));
      } else add("s", "audio", soundPath(a, original));
    }
    return { lanes: buildLanes(entries), info };
  }, [project, original]);
  // A highlighted track ("Destacar faixa") makes the others step aside (same as the export).
  const spotlit = useRef<[number, number][]>([]);
  spotlit.current = useMemo(
    () => (raw ? spotlightSpans(raw, ducking.current.ramp, ducking.current.hold) : []),
    [raw],
  );
  // When the words of annotations that come in word by word appear.
  const [revealTimes, setRevealTimes] = useState(new Map<string, number[]>());
  useEffect(() => {
    let alive = true;
    if (!raw) return;
    const clips = raw.clips.filter((c) => revealing(c) && c.annotation?.reveal === "words");
    if (!clips.length) {
      setRevealTimes(new Map());
      return;
    }
    void Promise.all(clips.map(async (c) => [c.id, await clipRevealTimes(raw, c)] as const)).then(
      (list) => alive && setRevealTimes(new Map(list)),
    );
    return () => {
      alive = false;
    };
  }, [raw]);

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
          const el = served.current.get(id);
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
      // Region effects show while their clip lasts; zoom layers above them magnify them with
      // the rest of the picture, and a region that follows the recording goes with its zooms.
      for (const [id, el] of regions.current) {
        const c = clips.get(id);
        const track = c && tracks.get(c.trackId);
        const fx = c?.regionFx;
        const stage = stageRef.current;
        let on = !!c && !!track && !track.hidden && t >= c.start && t < clipEnd(c);
        if (c && fx && stage && on) {
          const k = stage.clientWidth / project.settings.width;
          if (fx.follow) {
            const f = regionRectAt(project, c, t);
            if (f)
              applyRegionLook(el, fx, {
                box: {
                  left: f.rect.x * k,
                  top: f.rect.y * k,
                  width: f.rect.w * k,
                  height: f.rect.h * k,
                },
                radius: f.radius * f.scale * k,
                block: f.block * f.scale * k,
                feather: f.feather * f.scale * k,
              });
            else on = false;
          }
          const views = zoomsOver(project, order.get(c.trackId) ?? 0, t, editingZoom ?? undefined);
          if (views.length) {
            const A = zoomAffine(views, stage.clientWidth, stage.clientHeight);
            const target =
              fx.kind === "spotlight" && el.firstElementChild instanceof HTMLElement
                ? el.firstElementChild
                : el;
            const L = target.offsetLeft;
            const T = target.offsetTop;
            el.style.transformOrigin = "0 0";
            el.style.transform =
              target === el
                ? `translate(${(A.s - 1) * L + A.tx}px, ${(A.s - 1) * T + A.ty}px) scale(${A.s})`
                : `translate(${A.tx}px, ${A.ty}px) scale(${A.s})`;
          } else el.style.transform = "";
        }
        el.style.visibility = on ? "visible" : "hidden";
      }
      // Annotations that come in: the picture of the state at this moment.
      for (const [id, img] of images.current) {
        const c = clips.get(id);
        const asset = c && assets.get(c.assetId);
        if (!c || !asset || !revealing(c)) continue;
        const state = revealStateAt(c, revealTimes.get(id) ?? [], t);
        const want = state ? JSON.stringify(state) : "";
        if (img.dataset.reveal === want) continue;
        img.dataset.reveal = want;
        if (!state) img.src = mediaUrl(asset.path);
        else
          void revealPicture(project, c, state).then((url) => {
            if (img.dataset.reveal === want && url) img.src = url;
          });
      }
      const pool = poolRef.current;
      if (!pool) return;
      // Sound and voices first: the picture of a cut-out avatar follows its voice.
      const laneOrder = [...lanes.lanes.keys()].sort(
        (a, b) => +a.startsWith("p|") - +b.startsWith("p|"),
      );
      const plans = new Map<string, LanePlan>();
      for (const key of laneOrder)
        plans.set(key, planLane(lanes.lanes.get(key) ?? [], t, PRELOAD_AHEAD));
      served.current.clear();
      const used = new Set<HTMLMediaElement>();
      for (const key of laneOrder) {
        const info = lanes.info.get(key);
        const plan = plans.get(key);
        if (!info || !plan) continue;
        plan.forEach((slotPlan, index) => {
          if (!slotPlan) return;
          const c = clips.get(slotPlan.clipId);
          const asset = c && assets.get(c.assetId);
          const track = c && tracks.get(c.trackId);
          if (!c || !asset || !track) return;
          const slot = index === 0 ? 0 : 1;
          const el = pool.element(key, slot, info.kind, mediaUrl(info.path), "stage-media");
          used.add(el);
          if (info.role === "p") pool.host(el, hosts.current.get(c.id));
          served.current.set(info.role === "v" ? c.id + VOICE : c.id, el);
          // The piece's words as the element's captions (the voice's for a cut-out avatar).
          if (info.role !== "p" || !needsVoice(asset, original))
            pool.captions(
              el,
              `${c.id}:${c.in}:${c.duration}:${cuesVersion}`,
              clipCues(textCues, c),
            );
          const tail = (c as DerivedClip).tail;
          // A dissolve tail is picture only: the sound stops at the real cut. A cut-out
          // avatar's picture is silent; its voice element plays the sound instead.
          const muted =
            !heard(track, solo) ||
            !!c.mutedFor ||
            !asset.hasAudio ||
            (!!tail && t >= clipEnd(c) - tail) ||
            (info.role === "p" && needsVoice(asset, original));
          el.muted = muted;
          // The clip's volume (above 100% too), its envelope, the music stepping aside for the
          // voice and the tracks stepping aside for a highlighted one: one gain node.
          const music = ducks(track)
            ? duckGain(speech.current, t, ducking.current.depth, ducking.current.ramp)
            : 1;
          const aside =
            spotlit.current.length && !track.spotlight
              ? duckGain(spotlit.current, t, ducking.current.depth, ducking.current.ramp)
              : 1;
          pool.setGain(el, muted ? 0 : c.volume * music * aside * gainAt(c.gain, t - c.start));
          // The clip's own speed multiplies the playback rate (the browser keeps the pitch, like
          // atempo), also at half and a quarter of the speed with K held.
          const r = rate * clipSpeed(c);
          if (slotPlan.play && playing && rate > 0) {
            pool.wake();
            const voice = info.role === "p" ? served.current.get(c.id + VOICE) : undefined;
            const target = pictureTarget(
              slotPlan.time,
              voice
                ? {
                    // Where the voice is heard now: its position less the sound's buffering.
                    time: voice.currentTime - pool.latency() * clipSpeed(c),
                    playing: !voice.paused,
                    seeking: voice.seeking,
                  }
                : null,
            );
            if (el.paused) {
              if (el.playbackRate !== r) el.playbackRate = r;
              if (Math.abs(el.currentTime - target) > frame / 2) el.currentTime = target;
              void el.play().catch(() => undefined);
            } else {
              // Picture and voice follow their clock the same way (shared/playbackSync.ts).
              const fix = driftCorrection(el.currentTime, target, r, frame, el.playbackRate !== r);
              if (fix.seek) {
                el.currentTime = target;
                pool.seeks++;
              }
              if (el.playbackRate !== fix.rate) el.playbackRate = fix.rate;
            }
          } else {
            if (!el.paused) el.pause();
            // The element waiting for the next piece stands at its first frame.
            if (!el.seeking && Math.abs(el.currentTime - slotPlan.time) > frame / 2)
              el.currentTime = slotPlan.time;
          }
        });
      }
      for (const el of pool.all()) if (!used.has(el) && !el.paused) el.pause();
    };
    sync();
    const unsub = usePlayback.subscribe(sync);
    // A slider held in the panel and the solo of a track show at once.
    const unsubLive = useLiveEdit.subscribe(sync);
    const unsubSolo = useApp.subscribe((s, prev) => {
      if (s.solo !== prev.solo) sync();
    });
    const pool = poolRef.current;
    // An element that finished seeking is placed again right away (a paused preview too).
    if (pool) pool.onSeeked = sync;
    pool?.keepOnly(new Set(lanes.lanes.keys()));
    return () => {
      unsub();
      unsubLive();
      unsubSolo();
      if (pool) pool.onSeeked = null;
    };
  }, [project, mountKey, editingZoom, original, lanes, revealTimes, textCues, cuesVersion]);

  // The pool of media elements lives as long as the preview; leaving the editor stops it all.
  useLayoutEffect(() => {
    const parking = parkingRef.current;
    if (!parking) return;
    const pool = new MediaPool(parking);
    poolRef.current = pool;
    // For the checks (and for whoever wants to see how smooth the preview is).
    Reflect.set(window, "__ediaulaPreview", { stats: () => pool.stats() });
    return () => {
      Reflect.deleteProperty(window, "__ediaulaPreview");
      poolRef.current = null;
      pool.dispose();
    };
  }, []);

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

  const hostRef = (c: Clip) => (el: HTMLDivElement | null) => {
    if (el) hosts.current.set(c.id, el);
    else hosts.current.delete(c.id);
  };
  const imageRef = (c: Clip) => (el: HTMLImageElement | null) => {
    if (el) images.current.set(c.id, el);
    else images.current.delete(c.id);
  };
  const regionRef = (c: Clip) => (el: HTMLDivElement | null) => {
    if (el) regions.current.set(c.id, el);
    else regions.current.delete(c.id);
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
            background: backgroundCss(
              project?.background,
              project?.background?.kind === "image"
                ? (() => {
                    const bg = project.background;
                    const a = assets.get(bg.assetId);
                    return a && !a.missing ? mediaUrl(a.path) : undefined;
                  })()
                : undefined,
            ),
            transform: view.x || view.y ? `translate(${view.x}px, ${view.y}px)` : undefined,
          }}
          onDoubleClick={() => void areaRef.current?.requestFullscreen()}
          onPointerDown={(e) => {
            if (e.button === 0) useProject.getState().select([]);
          }}
        >
          <ColorFilters clips={mounted} />
          {mounted.map((c) => {
            const a = assets.get(c.assetId);
            if (!a || a.missing || !project || c.zoomLayer) return null;
            if (c.regionFx)
              return (
                <RegionLayer
                  // Remade when it starts or stops following: the loop places a following one.
                  key={`${c.id}:${c.regionFx.follow ? "follow" : "still"}`}
                  fx={c.regionFx}
                  width={size.w}
                  height={size.h}
                  zIndex={(100 - (trackIndex.get(c.trackId) ?? 0)) * 2}
                  elRef={regionRef(c)}
                />
              );
            // Sound plays from the pool's elements, which need no place on the stage.
            if (!isVisual(project, c, a)) return null;
            const lay = clipLayout({ transform: transformOf(c) }, a, settings);
            const tf = transformOf(c);
            const device = tf.device
              ? deviceGeometry(tf.device, lay.visible.w, lay.visible.h)
              : null;
            const k = device ? device.screen.w / lay.visible.w : 1;
            const radius = maskRadius(tf, lay.visible.w, lay.visible.h, settings.height) * scale;
            const box = {
              left: lay.visible.x * scale,
              top: lay.visible.y * scale,
              width: lay.visible.w * scale,
              height: lay.visible.h * scale,
              borderRadius: device ? undefined : radius || undefined,
              filter: tf.shadow
                ? cssShadow(tf.shadow, (settings.height / 1080) * scale)
                : undefined,
            };
            // On a device, the picture goes on its screen, smaller by k.
            const inner = {
              left: (lay.full.x - lay.visible.x) * scale * k,
              top: (lay.full.y - lay.visible.y) * scale * k,
              width: lay.full.w * scale * k,
              height: lay.full.h * scale * k,
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
                  className={`stage-flip ${device ? "on-device" : ""}`}
                  style={{
                    ...(tf.flipH || tf.flipV
                      ? { transform: `scale(${tf.flipH ? -1 : 1}, ${tf.flipV ? -1 : 1})` }
                      : {}),
                    ...(device
                      ? {
                          left: device.screen.x * scale,
                          top: device.screen.y * scale,
                          width: device.screen.w * scale,
                          height: device.screen.h * scale,
                          borderRadius: device.screenRadius * scale,
                        }
                      : {}),
                  }}
                >
                  <div
                    ref={contentRef(c)}
                    className="stage-content"
                    style={{
                      ...inner,
                      ...(hasColor(c.color) ? { filter: `url(#cf-${c.id})` } : {}),
                    }}
                  >
                    {a.kind === "image" ? (
                      <img
                        ref={imageRef(c)}
                        src={mediaUrl(a.path)}
                        className="stage-media"
                        style={{ opacity: tailEditing === c.id ? 0 : undefined }}
                        alt=""
                        draggable={false}
                      />
                    ) : (
                      <div ref={hostRef(c)} className="stage-media-host" />
                    )}
                    {a.cursor && (
                      <CursorLayer
                        asset={a}
                        width={inner.width}
                        height={inner.height}
                        getVideo={() => {
                          const el = served.current.get(c.id);
                          return el instanceof HTMLVideoElement ? el : undefined;
                        }}
                      />
                    )}
                  </div>
                </div>
                {device && tf.device && (
                  <DeviceFrame
                    device={tf.device}
                    width={lay.visible.w * scale}
                    height={lay.visible.h * scale}
                  />
                )}
                {(c as DerivedClip).tailFx === "fold" && (
                  <span ref={flapRef(c)} className="paper-flap" />
                )}
                {tf.border && !device && (
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
          {selected?.regionFx && <RegionTarget clip={selected} width={size.w} height={size.h} />}
          {selected &&
            selectedAsset &&
            project &&
            !selected.zoomLayer &&
            !selected.regionFx &&
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
          <div ref={parkingRef} className="stage-parking" aria-hidden="true" />
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

/**
 * The color correction of the clips on screen as SVG filters (shared/look.ts colorSvg): the same
 * saturation, contrast, brightness and temperature the export draws.
 */
function ColorFilters({ clips }: { clips: Clip[] }): ReactNode {
  const colored = clips.filter((c) => hasColor(c.color));
  if (!colored.length) return null;
  return (
    <svg className="stage-defs" width="0" height="0" aria-hidden="true">
      <defs>
        {colored.map((c) => {
          const f = colorSvg(c.color ?? {});
          return (
            <filter key={c.id} id={`cf-${c.id}`} colorInterpolationFilters="sRGB">
              <feColorMatrix
                type="matrix"
                values={f.matrix.map((v) => Number(v.toFixed(5))).join(" ")}
              />
              <feColorMatrix
                type="matrix"
                values={`${f.rgb[0]} 0 0 0 0 0 ${f.rgb[1]} 0 0 0 0 0 ${f.rgb[2]} 0 0 0 0 0 1 0`}
              />
            </filter>
          );
        })}
      </defs>
    </svg>
  );
}

const deviceFrames = new Map<string, string>();

/** The device around a picture, drawn with the same geometry as the export's frame. */
function deviceFrameUrl(device: "laptop" | "phone", w: number, h: number): string {
  const W = Math.max(2, Math.round(w));
  const H = Math.max(2, Math.round(h));
  const key = `${device}:${W}x${H}`;
  let url = deviceFrames.get(key);
  if (url) return url;
  const g = deviceGeometry(device, W, H);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  const box = (r: { x: number; y: number; w: number; h: number }, radius: number): Path2D => {
    const p = new Path2D();
    p.roundRect(r.x, r.y, r.w, r.h, Math.min(radius, r.w / 2, r.h / 2));
    return p;
  };
  ctx.fillStyle = DEVICE_COLORS.body;
  ctx.fill(box(g.body, g.bodyRadius));
  ctx.globalCompositeOperation = "destination-out";
  ctx.fill(box(g.screen, g.screenRadius));
  ctx.globalCompositeOperation = "source-over";
  if (g.notch) {
    ctx.fillStyle = DEVICE_COLORS.body;
    ctx.fill(box(g.notch, g.notch.h / 2));
  }
  if (g.base) {
    ctx.fillStyle = DEVICE_COLORS.base;
    ctx.fill(box(g.base, g.base.h * 0.35));
  }
  if (g.groove) {
    ctx.fillStyle = DEVICE_COLORS.groove;
    ctx.fill(box(g.groove, g.groove.h / 2));
  }
  url = c.toDataURL("image/png");
  if (deviceFrames.size > 60) deviceFrames.clear();
  deviceFrames.set(key, url);
  return url;
}

function DeviceFrame({
  device,
  width,
  height,
}: {
  device: "laptop" | "phone";
  width: number;
  height: number;
}): ReactNode {
  return (
    <img
      className="stage-device"
      src={deviceFrameUrl(device, width, height)}
      alt=""
      draggable={false}
      style={{ width, height }}
    />
  );
}

/** A region's look on the stage, in stage pixels: the export's radius, block and soft edge. */
interface RegionLook {
  box: { left: number; top: number; width: number; height: number };
  /** boxblur radius and pixel block, already clamped as the export clamps them. */
  radius: number;
  block: number;
  feather: number;
}

/** The look of a region that stays on the frame, for a stage `width` × `height`. */
function fixedLook(fx: RegionFx, width: number, height: number): RegionLook {
  const box = {
    left: fx.rect.x * width,
    top: fx.rect.y * height,
    width: fx.rect.w * width,
    height: fx.rect.h * height,
  };
  const { radius, block } = regionStrength(fx, height, { w: box.width, h: box.height });
  return { box, radius, block, feather: (fx.feather * height) / 1080 };
}

/** Backdrop filter and soft-edge mask of a blur or pixelate region. */
function regionCss(fx: RegionFx, look: RegionLook): { filter: string; mask: string } {
  // Soft edges: the effect fades out over the feather, as the export's mask.
  const fade = look.feather > 0.5 ? look.feather : 0;
  const mask = fade
    ? `linear-gradient(to right, transparent, #000 ${fade}px, #000 calc(100% - ${fade}px), transparent), linear-gradient(to bottom, transparent, #000 ${fade}px, #000 calc(100% - ${fade}px), transparent)`
    : "";
  const filter =
    fx.kind === "blur"
      ? `blur(${boxBlurSigma(look.radius).toFixed(2)}px)`
      : `url(#${pixelFilter(Math.round(look.block))})`;
  return { filter, mask };
}

/** Places a region's element (or the clear box of a spotlight) for this frame. */
function applyRegionLook(el: HTMLDivElement, fx: RegionFx, look: RegionLook): void {
  const px = (v: number): string => `${v.toFixed(2)}px`;
  const place = (target: HTMLElement): void => {
    target.style.left = px(look.box.left);
    target.style.top = px(look.box.top);
    target.style.width = px(look.box.width);
    target.style.height = px(look.box.height);
  };
  if (fx.kind === "spotlight") {
    const box = el.firstElementChild;
    if (!(box instanceof HTMLElement)) return;
    place(box);
    box.style.borderRadius = px(Math.min(look.box.width, look.box.height) * 0.12);
    box.style.boxShadow = `0 0 ${px(look.feather * 2)} 9999px rgba(0, 0, 0, ${spotlightDarkness(fx)})`;
    return;
  }
  place(el);
  const css = regionCss(fx, look);
  el.style.backdropFilter = css.filter;
  el.style.maskImage = css.mask;
  el.style.maskComposite = css.mask ? "intersect" : "";
}

/**
 * A region effect over the preview (shared/look.ts): blur and pixelate through a backdrop
 * filter of the layers below it, the spotlight as a dark frame around a clear box with a soft
 * edge. It sits in the stack where its track is, like a zoom layer. A region that follows the
 * recording is placed on every frame by the playback loop (applyRegionLook).
 */
function RegionLayer({
  fx,
  width,
  height,
  zIndex,
  elRef,
}: {
  fx: RegionFx;
  width: number;
  height: number;
  zIndex: number;
  elRef: (el: HTMLDivElement | null) => void;
}): ReactNode {
  const look = fixedLook(fx, width, height);
  if (fx.kind === "spotlight")
    return (
      <div
        ref={elRef}
        className="stage-region is-spotlight"
        style={{ zIndex, visibility: "hidden" }}
      >
        <span
          style={{
            ...look.box,
            borderRadius: Math.min(look.box.width, look.box.height) * 0.12,
            boxShadow: `0 0 ${look.feather * 2}px 9999px rgba(0, 0, 0, ${spotlightDarkness(fx)})`,
          }}
        />
      </div>
    );
  const css = regionCss(fx, look);
  return (
    <div
      ref={elRef}
      className={`stage-region is-${fx.kind}`}
      style={{
        ...look.box,
        zIndex,
        visibility: "hidden",
        backdropFilter: css.filter,
        maskImage: css.mask || undefined,
        maskComposite: css.mask ? "intersect" : undefined,
      }}
    />
  );
}

/**
 * The classic SVG pixelation (one sample per block, grown back to the block's size) for a
 * block of `size` pixels: made once per size in a hidden SVG of the page, so a region that
 * follows a zoom gets a new size on any frame. Returns the filter's id.
 */
function pixelFilter(size: number): string {
  const s = Math.max(2, Math.round(size));
  const id = `px-${s}`;
  if (document.getElementById(id)) return id;
  const NS = "http://www.w3.org/2000/svg";
  let defs: Element | null = document.getElementById("stage-pixel-filters");
  if (!defs) {
    const svg = document.createElementNS(NS, "svg");
    svg.id = "stage-pixel-filters";
    svg.setAttribute("class", "stage-defs");
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.setAttribute("aria-hidden", "true");
    document.body.append(svg);
    defs = svg;
  }
  const node = (name: string, attrs: Record<string, string | number>): Element => {
    const n = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    return n;
  };
  const filter = node("filter", { id, x: 0, y: 0, width: "100%", height: "100%" });
  filter.append(
    node("feFlood", { x: s / 2, y: s / 2, height: 1, width: 1 }),
    node("feComposite", { width: s, height: s }),
    node("feTile", { result: "grid" }),
    node("feComposite", { in: "SourceGraphic", in2: "grid", operator: "in" }),
    node("feMorphology", { operator: "dilate", radius: s / 2 }),
  );
  defs.append(filter);
  return id;
}
