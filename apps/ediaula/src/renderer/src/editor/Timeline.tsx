import { focusOnMount } from "@informach/edi-desktop/renderer";
import { timelineProtected } from "@shared/cleanup";
import {
  clipEnd,
  clipSpeed,
  placeClips,
  projectDuration,
  rippleMoveFrom,
  snapTime,
  sourceEnd,
  timelineAt,
  trackLabels,
  trimClip,
} from "@shared/timeline";
import { previousClip, TRANSITIONS, type TransitionKind } from "@shared/transitions";
import type { Asset, Clip, Project, Track } from "@shared/types";
import {
  ArrowRightLeft,
  ChevronsDownUp,
  ChevronsUpDown,
  Eye,
  EyeOff,
  Film,
  FoldHorizontal,
  Image,
  Lock,
  LockOpen,
  Magnet,
  Maximize2,
  MousePointer2,
  Music,
  Plus,
  Redo2,
  Scissors,
  SplitSquareHorizontal,
  Undo2,
  Volume2,
  VolumeX,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  Fragment,
  memo,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { actions } from "@/lib/actions";
import { rulerLabel, timecode } from "@/lib/format";
import { importMedia } from "@/lib/importMedia";
import { mediaUrl } from "@/lib/media";
import { speedLabel } from "@/lib/speed";
import { timelineView, zoomBy, zoomToFit } from "@/lib/timelineView";
import { selectJunction, setTransition, TRANSITION_DRAG } from "@/lib/transitions";
import { useApp, ZOOM_MAX, ZOOM_MIN } from "@/state/app";
import { playback, usePlayback } from "@/state/playback";
import { assetMap, useProject } from "@/state/project";
import { IconButton, Kbd } from "@/ui";
import { ClipMenu } from "./ClipMenu";
import { ASSET_MIME } from "./Library";
import { NarrationPanel } from "./NarrationPanel";
import { Waveform } from "./Waveform";

const TRACK_H: Record<Track["kind"], number> = { video: 66, audio: 58 };
const TRACK_MIN = 30;
const TRACK_MAX = 220;
/** A track's height: its own (dragged) or the default for its kind. */
const trackH = (t: Track): number => t.height ?? TRACK_H[t.kind];
const RULER_H = 28;
const SNAP_PX = 8;
const EPS = 1e-6;
const TICK_STEPS = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1200, 1800, 3600];

interface PreviewState {
  clips: Map<string, Clip>;
  snap?: number;
  playhead?: number;
}

export function Timeline(): ReactNode {
  const project = useProject((s) => s.project);
  if (!project) return null;
  return <TimelineInner project={project} />;
}

function TimelineInner({ project }: { project: Project }): ReactNode {
  const selection = useProject((s) => s.selection);
  const junction = useApp((s) => s.junction);
  const zoom = useApp((s) => s.zoom);
  const tool = useApp((s) => s.tool);
  const snapping = useApp((s) => s.snapping);
  const cleanupMarks = useApp((s) => s.cleanupMarks);
  const proposal = useApp((s) => s.proposal);
  const scrollRef = useRef<HTMLDivElement>(null);
  const headsRef = useRef<HTMLDivElement>(null);
  const cancelRipple = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelRipple.current?.(), []);
  const [view, setView] = useState({ left: 0, width: 1200 });
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [interval, setInterval] = useState<{ start: number; end: number } | null>(null);
  const [narration, setNarration] = useState<{
    projectId: string;
    start: number;
    end: number;
  } | null>(null);
  const [dropAt, setDropAt] = useState<{ trackId: string; time: number } | null>(null);
  const zoomAnchor = useRef<{ time: number; px: number } | null>(null);
  const prevZoom = useRef(zoom);

  const assets = assetMap(project);
  const labels = trackLabels(project.tracks);
  const tracks = project.tracks;
  const duration = projectDuration(project);
  const previewEnd = preview ? projectDuration({ clips: [...preview.clips.values()] }) : 0;
  const contentWidth = Math.max((Math.max(duration, previewEnd) + 30) * zoom, view.width);
  const lanesHeight = tracks.reduce((h, t) => h + trackH(t), 0);

  // Viewport size, shared with zoom-to-fit.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    timelineView.scrollTo = (x) => {
      el.scrollLeft = x;
    };
    const ro = new ResizeObserver(() => {
      timelineView.width = el.clientWidth;
      setView({ left: el.scrollLeft, width: el.clientWidth });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Keep the time under the mouse (wheel zoom) or the view center (buttons, keys) fixed when zooming.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || prevZoom.current === zoom) return;
    const anchor = zoomAnchor.current ?? {
      time: (el.scrollLeft + el.clientWidth / 2) / prevZoom.current,
      px: el.clientWidth / 2,
    };
    el.scrollLeft = Math.max(0, anchor.time * zoom - anchor.px);
    zoomAnchor.current = null;
    prevZoom.current = zoom;
    setView({ left: el.scrollLeft, width: el.clientWidth });
  }, [zoom]);

  // Wheel: horizontal scroll by default, Ctrl to zoom around the cursor, Alt for vertical scroll.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      if (e.ctrlKey) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const z = useApp.getState().zoom;
        zoomAnchor.current = { time: (el.scrollLeft + px) / z, px };
        zoomBy(e.deltaY < 0 ? 1.18 : 1 / 1.18);
      } else if (!e.altKey && !e.shiftKey && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const raf = useRef(0);
  const onScroll = (): void => {
    const el = scrollRef.current!;
    if (headsRef.current) headsRef.current.scrollTop = el.scrollTop;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() =>
      setView({ left: el.scrollLeft, width: el.clientWidth }),
    );
  };

  const xToTime = (clientX: number): number => {
    const el = scrollRef.current!;
    return Math.max(0, (clientX - el.getBoundingClientRect().left + el.scrollLeft) / zoom);
  };

  /** Index of the lane under a viewport y coordinate, or null when outside the lanes. */
  const laneAt = (clientY: number): number | null => {
    const el = scrollRef.current!;
    let y = clientY - el.getBoundingClientRect().top + el.scrollTop - RULER_H;
    if (y < 0) return null;
    for (let i = 0; i < tracks.length; i++) {
      y -= trackH(tracks[i]);
      if (y < 0) return i;
    }
    return null;
  };

  const snapCandidates = (exclude: Set<string>): number[] => {
    const c = [0, usePlayback.getState().time];
    for (const clip of project.clips) if (!exclude.has(clip.id)) c.push(clip.start, clipEnd(clip));
    return c;
  };

  const trackIndex = new Map(tracks.map((t, i) => [t.id, i]));
  const isLocked = (c: Clip): boolean => !!tracks[trackIndex.get(c.trackId) ?? -1]?.locked;

  const listen = (move: (e: PointerEvent) => void, up: (e: PointerEvent) => void): (() => void) => {
    const cleanup = (): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", onUp);
    };
    const onUp = (e: PointerEvent): void => {
      cleanup();
      up(e);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", onUp);
    return cleanup;
  };

  const beginMove = (e: React.PointerEvent, anchor: Clip, selected: string[]): void => {
    const moving = project.clips.filter((c) => selected.includes(c.id) && !isLocked(c));
    if (!moving.length) return;
    const ids = new Set(moving.map((c) => c.id));
    const cands = snapCandidates(ids);
    const minStart = Math.min(...moving.map((c) => c.start));
    const anchorLane = trackIndex.get(anchor.trackId)!;
    const startX = e.clientX;
    const startY = e.clientY;
    let started = false;
    let result: Clip[] | null = null;

    listen(
      (ev) => {
        const dx = ev.clientX - startX;
        if (!started && Math.hypot(dx, ev.clientY - startY) < 4) return;
        started = true;
        let dt = Math.max(dx / zoom, -minStart);
        let snap: number | undefined;
        if (snapping) {
          const th = SNAP_PX / zoom;
          const a = snapTime(anchor.start + dt, cands, th);
          const b = snapTime(clipEnd(anchor) + dt, cands, th);
          const da = a.snapped ? Math.abs(a.time - (anchor.start + dt)) : Infinity;
          const db = b.snapped ? Math.abs(b.time - (clipEnd(anchor) + dt)) : Infinity;
          if (da <= db && a.snapped) {
            dt = a.time - anchor.start;
            snap = a.time;
          } else if (b.snapped) {
            dt = b.time - clipEnd(anchor);
            snap = b.time;
          }
          dt = Math.max(dt, -minStart);
        }
        const lane = laneAt(ev.clientY);
        let delta = lane === null ? 0 : lane - anchorLane;
        const valid = moving.every((c) => {
          const from = tracks[trackIndex.get(c.trackId)!];
          const to = tracks[trackIndex.get(c.trackId)! + delta];
          return !!from && !!to && !to.locked;
        });
        if (!valid) delta = 0;
        result = moving.map((c) => ({
          ...c,
          start: c.start + dt,
          trackId: tracks[trackIndex.get(c.trackId)! + delta].id,
        }));
        setPreview({ clips: new Map(result.map((c) => [c.id, c])), snap });
      },
      () => {
        setPreview(null);
        const moved = result;
        if (moved)
          useProject.getState().commit((p) => ({ ...p, clips: placeClips(p.clips, moved) }));
      },
    );
  };

  const beginTrim = (clip: Clip, edge: "start" | "end"): void => {
    const asset = assets.get(clip.assetId);
    const neighbours = project.clips.filter((c) => c.trackId === clip.trackId && c.id !== clip.id);
    // Trims stop at the neighbouring clips instead of overwriting them.
    const lower = Math.max(
      0,
      ...neighbours.filter((c) => clipEnd(c) <= clip.start + EPS).map(clipEnd),
    );
    const upper = Math.min(
      Infinity,
      ...neighbours.filter((c) => c.start >= clipEnd(clip) - EPS).map((c) => c.start),
    );
    const cands = snapCandidates(new Set([clip.id]));
    let result: Clip | null = null;
    listen(
      (ev) => {
        let t = xToTime(ev.clientX);
        let snap: number | undefined;
        if (snapping) {
          const s = snapTime(t, cands, SNAP_PX / zoom);
          t = s.time;
          if (s.snapped) snap = s.time;
        }
        t = edge === "start" ? Math.max(t, lower) : Math.min(t, upper);
        result = trimClip(clip, edge, t, asset);
        setPreview({ clips: new Map([[clip.id, result]]), snap });
      },
      () => {
        setPreview(null);
        const trimmed = result;
        if (trimmed)
          useProject.getState().commit((p) => ({
            ...p,
            clips: p.clips.map((c) => (c.id === trimmed.id ? trimmed : c)),
          }));
      },
    );
  };

  const [menu, setMenu] = useState<{ x: number; y: number; clipId: string } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const onClipMenu = useCallback((e: React.MouseEvent, clip: Clip): void => {
    e.preventDefault();
    e.stopPropagation();
    // Right-clicking outside the selection selects that clip, like Premiere and Camtasia.
    if (!useProject.getState().selection.includes(clip.id)) useProject.getState().select([clip.id]);
    setMenu({ x: e.clientX, y: e.clientY, clipId: clip.id });
  }, []);

  const onClipDown = (e: React.PointerEvent, clip: Clip, part: "body" | "start" | "end"): void => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (isLocked(clip)) return;
    if (tool === "cut" && part === "body") {
      let t = xToTime(e.clientX);
      if (snapping) t = snapTime(t, [usePlayback.getState().time], SNAP_PX / zoom).time;
      actions.splitClipAt(clip.id, t);
      return;
    }
    const { select } = useProject.getState();
    let sel = selection;
    if (e.ctrlKey || e.shiftKey) {
      sel = sel.includes(clip.id) ? sel.filter((id) => id !== clip.id) : [...sel, clip.id];
      select(sel);
      if (!sel.includes(clip.id)) return;
    } else if (!sel.includes(clip.id)) {
      sel = [clip.id];
      select(sel);
    }
    if (part === "body") beginMove(e, clip, sel);
    else beginTrim(clip, part);
  };

  const onPlayheadDown = (
    e: React.PointerEvent,
    forceRipple = false,
    originX = e.clientX,
  ): void => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (!e.shiftKey && !forceRipple) {
      onRulerDown(e);
      return;
    }
    playback.pause();
    const at = usePlayback.getState().time;
    cancelRipple.current?.();
    const origin = xToTime(originX);
    const revision = useProject.getState().revision;
    const previousInterval = interval;
    let result = { clips: project.clips, delta: 0 };
    let requested = 0;
    const move = (ev: PointerEvent): void => {
      if (ev.pointerId !== e.pointerId) return;
      requested = xToTime(ev.clientX) - origin;
      result = rippleMoveFrom(project.clips, tracks, at, requested);
      setInterval({ start: Math.min(at, at + result.delta), end: Math.max(at, at + result.delta) });
      setPreview({
        clips: new Map(result.clips.filter((c, i) => c !== project.clips[i]).map((c) => [c.id, c])),
        playhead: at + result.delta,
      });
    };
    const finish = (apply: boolean): void => {
      cancelRipple.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", cancel);
      setPreview(null);
      const current = useProject.getState().project;
      const unchanged =
        useProject.getState().revision === revision &&
        current?.id === project.id &&
        current.clips === project.clips &&
        current.tracks === tracks;
      if (!apply || !unchanged || Math.abs(result.delta) <= EPS) setInterval(previousInterval);
      if (apply && unchanged && Math.abs(requested) > 0.05 && Math.abs(result.delta) <= EPS) {
        useApp
          .getState()
          .toast(
            requested < 0
              ? "Movimento bloqueado: clipes anteriores estão encostados em uma das faixas. Trave essa faixa para deixá-la fora do arrasto."
              : "Não há clipes à direita do marcador em faixas destravadas.",
            "info",
          );
      }
      if (apply && Math.abs(result.delta) > EPS && unchanged) {
        useProject.getState().commit((p) => ({ ...p, clips: result.clips }));
        playback.seek(at + result.delta);
      }
    };
    const up = (ev: PointerEvent): void => {
      if (ev.pointerId === e.pointerId) finish(true);
    };
    const cancel = (): void => {
      finish(false);
    };
    cancelRipple.current = cancel;
    const key = (ev: KeyboardEvent): void => {
      if (ev.key === "Escape") {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        cancel();
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", cancel);
  };

  const onRulerDown = (e: React.PointerEvent): void => {
    if (e.button !== 0) return;
    if (e.shiftKey) {
      onPlayheadDown(e);
      return;
    }
    playback.pause();
    playback.seek(xToTime(e.clientX));
    const stop = listen(
      (ev) => {
        if (ev.shiftKey) {
          stop();
          onPlayheadDown(e, true, ev.clientX);
          return;
        }
        playback.seek(xToTime(ev.clientX));
      },
      () => undefined,
    );
  };

  const acceptsDrop = (e: React.DragEvent): boolean =>
    e.dataTransfer.types.includes(ASSET_MIME) || e.dataTransfer.types.includes("Files");

  const dropTime = (clientX: number): number => {
    const t = xToTime(clientX);
    return snapping ? snapTime(t, snapCandidates(new Set()), (SNAP_PX * 2) / zoom).time : t;
  };

  const onLaneDrop = async (e: React.DragEvent, track: Track): Promise<void> => {
    e.preventDefault();
    e.stopPropagation();
    setDropAt(null);
    if (track.locked) return;
    const time = dropTime(e.clientX);
    const raw = e.dataTransfer.getData(ASSET_MIME);
    if (raw) {
      const ids = JSON.parse(raw) as string[];
      const list = ids.map((id) => assets.get(id)).filter((a): a is Asset => !!a);
      actions.placeAssets(list, track, time);
      return;
    }
    const paths = [...e.dataTransfer.files].map((f) => window.api.pathForFile(f)).filter(Boolean);
    if (paths.length) actions.placeAssets(await importMedia(paths), track, time);
  };

  const shown = preview ? project.clips.map((c) => preview.clips.get(c.id) ?? c) : project.clips;
  const selectedSet = new Set(selection);
  let laneTop = RULER_H;

  return (
    <div className={`tl tool-${tool}`}>
      <Toolbar />
      {narration && (
        <NarrationPanel
          {...narration}
          fps={project.settings.fps}
          close={() => setNarration(null)}
        />
      )}
      {interval && (
        <div className="tl-interval-info">
          <button
            type="button"
            className="tool"
            disabled={interval.end <= interval.start || interval.end > duration}
            onClick={() => setNarration({ projectId: project.id, ...interval })}
          >
            Narrar intervalo
          </button>
          <span>
            Início <b>{timecode(interval.start, project.settings.fps)}</b>
          </span>
          <span>
            Fim <b>{timecode(interval.end, project.settings.fps)}</b>
          </span>
          <span>
            Duração <b>{timecode(interval.end - interval.start, project.settings.fps)}</b>
          </span>
          <button
            type="button"
            className="tool"
            title="Limpar intervalo"
            onClick={() => setInterval(null)}
          >
            <X size={13} />
          </button>
        </div>
      )}
      <div className="tl-body">
        <div className="tl-heads" ref={headsRef}>
          <div className="ruler-head">
            <button
              type="button"
              className="add-track"
              onClick={() => actions.addTrack("video")}
              title="Nova faixa no topo (fica na frente das outras). Qualquer faixa aceita vídeo, imagem ou som."
            >
              <Plus size={12} /> Faixa ↑
            </button>
            <button
              type="button"
              className="add-track"
              onClick={() => actions.addTrack("audio")}
              title="Nova faixa embaixo (fica atrás das outras). Qualquer faixa aceita vídeo, imagem ou som."
            >
              <Plus size={12} /> ↓
            </button>
          </div>
          {tracks.map((t) => (
            <TrackHeader
              key={t.id}
              track={t}
              label={labels.get(t.id)!}
              empty={!project.clips.some((c) => c.trackId === t.id)}
            />
          ))}
          <div style={{ height: 40 }} />
        </div>

        <div className="tl-scroll" ref={scrollRef} onScroll={onScroll}>
          <fieldset
            className="tl-content"
            aria-label="Conteúdo da timeline"
            style={{ width: contentWidth, height: RULER_H + lanesHeight + 40 }}
            onDragOver={(e) => {
              if (!acceptsDrop(e)) return;
              e.preventDefault();
              e.stopPropagation();
              const index = laneAt(e.clientY);
              const track = index === null ? undefined : tracks[index];
              if (!track || track.locked) {
                e.dataTransfer.dropEffect = "none";
                setDropAt(null);
                return;
              }
              e.dataTransfer.dropEffect = "copy";
              const time = dropTime(e.clientX);
              setDropAt((d) =>
                d && d.trackId === track.id && Math.abs(d.time - time) < 1e-3
                  ? d
                  : { trackId: track.id, time },
              );
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropAt(null);
            }}
            onDrop={(e) => {
              if (!acceptsDrop(e)) return;
              e.preventDefault();
              e.stopPropagation();
              setDropAt(null);
              const index = laneAt(e.clientY);
              if (index !== null) void onLaneDrop(e, tracks[index]);
            }}
          >
            <Ruler zoom={zoom} left={view.left} width={view.width} onPointerDown={onRulerDown} />
            {tracks.map((t) => {
              const top = laneTop;
              laneTop += trackH(t);
              return (
                <div
                  key={t.id}
                  className={`lane lane-${t.kind} ${t.locked ? "is-locked" : ""}`}
                  style={{ top, height: trackH(t) }}
                  onPointerDown={(e) =>
                    e.button === 0 && !e.ctrlKey && !e.shiftKey && useProject.getState().select([])
                  }
                >
                  {dropAt?.trackId === t.id && (
                    <div className="drop-marker" style={{ left: dropAt.time * zoom }} />
                  )}
                </div>
              );
            })}
            {shown.map((c) => {
              const top =
                RULER_H +
                tracks.slice(0, trackIndex.get(c.trackId)).reduce((h, t) => h + trackH(t), 0);
              const track = tracks[trackIndex.get(c.trackId)!];
              if (!track) return null;
              return (
                <ClipView
                  key={c.id}
                  clip={c}
                  asset={assets.get(c.assetId)}
                  track={track}
                  top={top}
                  height={trackH(track)}
                  zoom={zoom}
                  selected={selectedSet.has(c.id)}
                  dragging={!!preview?.clips.has(c.id)}
                  viewLeft={view.left}
                  viewWidth={view.width}
                  onPointerDown={onClipDown}
                  onContextMenu={onClipMenu}
                />
              );
            })}
            {cleanupMarks
              .filter((m) => m.end * zoom >= view.left && m.start * zoom <= view.left + view.width)
              .map((m) => (
                <div
                  key={`${m.kind}${m.start}`}
                  className={`cut-mark cut-mark-${m.kind}`}
                  style={{
                    left: m.start * zoom,
                    width: Math.max(1, (m.end - m.start) * zoom),
                    top: RULER_H,
                    height: lanesHeight,
                  }}
                />
              ))}
            {proposal?.items.map((m) => (
              <div
                key={`${m.start}:${m.end}:${m.reason}`}
                className="cut-mark cut-mark-proposal"
                style={{
                  left: m.start * zoom,
                  width: Math.max(2, (m.end - m.start) * zoom),
                  top: RULER_H,
                  height: lanesHeight,
                }}
                title={m.reason}
              />
            ))}
            {project.clips
              .filter((c) => previousClip(project.clips, c))
              .map((c) => {
                const lane =
                  RULER_H +
                  tracks.slice(0, trackIndex.get(c.trackId)).reduce((h, t) => h + trackH(t), 0);
                const h = trackH(tracks[trackIndex.get(c.trackId)!]);
                const tr = c.transition;
                const label = tr
                  ? (TRANSITIONS.find((x) => x.id === tr.kind)?.label ?? tr.kind)
                  : "";
                return (
                  <Fragment key={`j${c.id}`}>
                    {tr && (
                      <div
                        className="transition-mark"
                        style={{
                          left: c.start * zoom - Math.max(6, (tr.duration * zoom) / 2),
                          width: Math.max(12, tr.duration * zoom),
                          top: lane,
                        }}
                      />
                    )}
                    <button
                      type="button"
                      className={`junction ${tr ? "has-transition" : ""} ${junction === c.id ? "is-selected" : ""}`}
                      style={{ left: c.start * zoom, top: lane + h / 2 }}
                      title={
                        tr
                          ? `${label} · ${tr.duration.toFixed(1)} s. Clique para trocar ou remover (Delete).`
                          : "Corte sem transição. Clique para escolher uma, ou arraste uma transição do painel até aqui."
                      }
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => selectJunction(c.id)}
                      onDragOver={(e) => {
                        if (e.dataTransfer.types.includes(TRANSITION_DRAG)) {
                          e.preventDefault();
                          e.currentTarget.classList.add("is-drop");
                        }
                      }}
                      onDragLeave={(e) => e.currentTarget.classList.remove("is-drop")}
                      onDrop={(e) => {
                        const kind = e.dataTransfer.getData(TRANSITION_DRAG) as TransitionKind;
                        e.currentTarget.classList.remove("is-drop");
                        if (!kind) return;
                        e.preventDefault();
                        setTransition(c.id, kind);
                        selectJunction(c.id);
                      }}
                    >
                      <span />
                    </button>
                  </Fragment>
                );
              })}
            {recordingMarks(project).map((m) =>
              m.kind === "zoom" ? (
                <div
                  key={`${m.kind}:${m.start}:${m.label}`}
                  className="zoom-band"
                  style={{ left: m.start * zoom, width: Math.max(3, (m.end - m.start) * zoom) }}
                  title={m.label}
                />
              ) : (
                <div
                  key={`${m.kind}:${m.start}:${m.label}`}
                  className={`rec-mark rec-mark-${m.kind}`}
                  style={{ left: m.start * zoom }}
                  title={m.label}
                />
              ),
            )}
            {timelineProtected(project).map((r) => (
              <div
                key={`${r.id}${r.start}`}
                className="prot-band"
                style={{ left: r.start * zoom, width: Math.max(2, (r.end - r.start) * zoom) }}
                title={`Protegido: ${r.label}`}
              />
            ))}
            {preview?.snap !== undefined && (
              <div
                className="snap-line"
                style={{ left: preview.snap * zoom, height: RULER_H + lanesHeight }}
              />
            )}
            <Playhead
              zoom={zoom}
              height={RULER_H + lanesHeight}
              scrollRef={scrollRef}
              previewTime={preview?.playhead}
              onPointerDown={onPlayheadDown}
              onClearInterval={() => setInterval(null)}
            />
            <IntervalMarkers
              interval={interval}
              fps={project.settings.fps}
              zoom={zoom}
              height={RULER_H + lanesHeight}
              onDrag={(e, edge) => {
                if (e.button !== 0) return;
                if (e.shiftKey) {
                  onPlayheadDown(e);
                  return;
                }
                e.preventDefault();
                e.stopPropagation();
                playback.pause();
                const initial = interval ?? {
                  start: usePlayback.getState().time,
                  end: usePlayback.getState().time,
                };
                setInterval(initial);
                const stop = listen(
                  (ev) => {
                    if (ev.shiftKey) {
                      stop();
                      onPlayheadDown(e, true, ev.clientX);
                      return;
                    }
                    const t =
                      Math.round(xToTime(ev.clientX) * project.settings.fps) / project.settings.fps;
                    setInterval(
                      edge === "start"
                        ? { start: Math.min(t, initial.end), end: initial.end }
                        : { start: initial.start, end: Math.max(t, initial.start) },
                    );
                  },
                  () => undefined,
                );
              }}
            />
            {project.clips.length === 0 && (
              <div className="tl-empty" style={{ top: RULER_H + 8, left: view.left + 24 }}>
                Arraste vídeos da biblioteca (ou do Windows Explorer) para cá.
              </div>
            )}
          </fieldset>
        </div>
      </div>
      {menu && <ClipMenu x={menu.x} y={menu.y} clipId={menu.clipId} onClose={closeMenu} />}
    </div>
  );
}

function Toolbar(): ReactNode {
  const tool = useApp((s) => s.tool);
  const snapping = useApp((s) => s.snapping);
  const zoom = useApp((s) => s.zoom);
  const set = useApp((s) => s.set);
  const canUndo = useProject((s) => s.past.length > 0);
  const canRedo = useProject((s) => s.future.length > 0);
  const hasSelection = useProject((s) => s.selection.length > 0);
  // Slider works on a log scale so both "whole lesson" and "frame by frame" are reachable.
  const toSlider = (z: number): number => Math.log(z / ZOOM_MIN) / Math.log(ZOOM_MAX / ZOOM_MIN);
  const fromSlider = (v: number): number => ZOOM_MIN * (ZOOM_MAX / ZOOM_MIN) ** v;

  return (
    <div className="tl-toolbar">
      <div className="row-4">
        <IconButton
          icon={Undo2}
          label="Desfazer (Ctrl+Z)"
          disabled={!canUndo}
          onClick={() => useProject.getState().undo()}
        />
        <IconButton
          icon={Redo2}
          label="Refazer (Ctrl+Shift+Z)"
          disabled={!canRedo}
          onClick={() => useProject.getState().redo()}
        />
        <span className="sep" />
        <button
          type="button"
          className={`tool ${tool === "select" ? "is-active" : ""}`}
          onClick={() => set({ tool: "select" })}
          title="Selecionar e mover clipes"
        >
          <MousePointer2 size={14} /> Seleção <Kbd>V</Kbd>
        </button>
        <button
          type="button"
          className={`tool ${tool === "cut" ? "is-active" : ""}`}
          onClick={() => set({ tool: "cut" })}
          title="Clique em um clipe para cortá-lo naquele ponto"
        >
          <Scissors size={14} /> Corte <Kbd>C</Kbd>
        </button>
        <button
          type="button"
          className="tool"
          onClick={actions.splitAtPlayhead}
          title="Divide os clipes selecionados (ou todos) no cursor de reprodução"
        >
          <SplitSquareHorizontal size={14} /> Dividir <Kbd>S</Kbd>
        </button>
        <span className="sep" />
        <button
          type="button"
          className={`tool ${snapping ? "is-on" : ""}`}
          onClick={() => set({ snapping: !snapping })}
          title="Ímã: encaixa nas bordas dos clipes e no cursor"
        >
          <Magnet size={14} /> Ímã
        </button>
        <button
          type="button"
          className="tool"
          onClick={() => actions.deleteSelection(true)}
          disabled={!hasSelection}
          title="Exclui e puxa o restante para fechar o buraco (Shift+Del)"
        >
          <ArrowRightLeft size={14} /> Excluir com ripple
        </button>
        <button
          type="button"
          className="tool"
          onClick={actions.closeGaps}
          title="Remove todos os espaços vazios entre clipes"
        >
          <FoldHorizontal size={14} /> Fechar lacunas
        </button>
      </div>
      <div className="row-6">
        <IconButton
          icon={ChevronsDownUp}
          label="Faixas mais baixas"
          onClick={() => scaleTracks(0.8)}
        />
        <IconButton
          icon={ChevronsUpDown}
          label="Faixas mais altas (ou arraste a borda de baixo de uma faixa)"
          onClick={() => scaleTracks(1.25)}
        />
        <span className="sep" />
        <IconButton icon={ZoomOut} label="Diminuir zoom (−)" onClick={() => zoomBy(0.8)} />
        <input
          type="range"
          className="range zoom-slider"
          min={0}
          max={1}
          step={0.001}
          value={toSlider(zoom)}
          onChange={(e) => set({ zoom: fromSlider(Number(e.target.value)) })}
          aria-label="Zoom da timeline"
        />
        <IconButton icon={ZoomIn} label="Aumentar zoom (+)" onClick={() => zoomBy(1.25)} />
        <IconButton icon={Maximize2} label="Ajustar à tela (\)" onClick={zoomToFit} />
      </div>
    </div>
  );
}

/** Drags a track's height: one undo step for the whole drag. */
function resizeTrack(e: React.PointerEvent, track: Track): void {
  if (e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  const y0 = e.clientY;
  const h0 = trackH(track);
  const setHeight = (height: number): void => {
    useProject.getState().patch((p) => ({
      ...p,
      tracks: p.tracks.map((t) => (t.id === track.id ? { ...t, height } : t)),
    }));
  };
  useProject.getState().commit((p) => ({
    ...p,
    tracks: p.tracks.map((t) => (t.id === track.id ? { ...t, height: h0 } : t)),
  }));
  document.body.classList.add("is-resizing-track");
  const move = (ev: PointerEvent): void => {
    setHeight(Math.round(Math.min(TRACK_MAX, Math.max(TRACK_MIN, h0 + ev.clientY - y0))));
  };
  const up = (): void => {
    document.body.classList.remove("is-resizing-track");
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
}

/** Every track taller or shorter at once (toolbar buttons); one undo step. */
function scaleTracks(k: number): void {
  useProject.getState().commit((p) => ({
    ...p,
    tracks: p.tracks.map((t) => ({
      ...t,
      height: Math.round(Math.min(TRACK_MAX, Math.max(TRACK_MIN, trackH(t) * k))),
    })),
  }));
}

function TrackHeader({
  track,
  label,
  empty,
}: {
  track: Track;
  label: string;
  empty: boolean;
}): ReactNode {
  const [editing, setEditing] = useState(false);
  return (
    <div
      className={`track-head track-head-${track.kind} ${trackH(track) < 44 ? "is-short" : ""}`}
      style={{ height: trackH(track) }}
    >
      <span className={`track-tag tag-${track.kind}`}>{label}</span>
      {editing ? (
        <input
          className="track-name-input"
          ref={focusOnMount}
          defaultValue={track.name}
          onBlur={(e) => {
            setEditing(false);
            if (e.target.value.trim() && e.target.value !== track.name)
              actions.updateTrack(track.id, { name: e.target.value.trim() });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur();
          }}
        />
      ) : (
        <button
          type="button"
          className="track-name"
          style={{ border: 0, padding: 0, background: "none", color: "inherit", textAlign: "left" }}
          onClick={() => setEditing(true)}
          title="Dois cliques para renomear"
        >
          {track.name}
        </button>
      )}
      <span className="spacer" />
      {
        <IconButton
          icon={track.hidden ? EyeOff : Eye}
          size={13}
          label={track.hidden ? "Mostrar faixa" : "Ocultar faixa"}
          active={track.hidden}
          onClick={() => actions.updateTrack(track.id, { hidden: !track.hidden })}
        />
      }
      <IconButton
        icon={track.muted ? VolumeX : Volume2}
        size={13}
        label={track.muted ? "Ativar som" : "Silenciar faixa"}
        active={track.muted}
        onClick={() => actions.updateTrack(track.id, { muted: !track.muted })}
      />
      <IconButton
        icon={track.locked ? Lock : LockOpen}
        size={13}
        label={track.locked ? "Destravar" : "Travar faixa"}
        active={track.locked}
        onClick={() => actions.updateTrack(track.id, { locked: !track.locked })}
      />
      {empty && (
        <IconButton
          icon={X}
          size={12}
          label="Remover faixa vazia"
          className="track-remove"
          onClick={() => actions.removeTrack(track.id)}
        />
      )}
      <hr
        className="track-resize"
        style={{ margin: 0, border: 0 }}
        tabIndex={0}
        aria-label={`Altura da faixa ${track.name}`}
        aria-orientation="horizontal"
        aria-valuemin={TRACK_MIN}
        aria-valuemax={TRACK_MAX}
        aria-valuenow={trackH(track)}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            actions.updateTrack(track.id, {
              height: Math.min(
                TRACK_MAX,
                Math.max(TRACK_MIN, trackH(track) + (event.key === "ArrowDown" ? 8 : -8)),
              ),
            });
          } else if (event.key === "Home") actions.updateTrack(track.id, { height: undefined });
        }}
        onPointerDown={(e) => resizeTrack(e, track)}
        onDoubleClick={() => actions.updateTrack(track.id, { height: undefined })}
        title="Arraste para mudar a altura da faixa · dois cliques voltam ao normal"
      />
    </div>
  );
}

function Ruler({
  zoom,
  left,
  width,
  onPointerDown,
}: {
  zoom: number;
  left: number;
  width: number;
  onPointerDown: (e: React.PointerEvent) => void;
}): ReactNode {
  const step = TICK_STEPS.find((s) => s * zoom >= 80) ?? 3600;
  const minor = (step * zoom) / 5 >= 8 ? step / 5 : step / 2;
  const from = Math.max(0, Math.floor(left / zoom / step) * step);
  const to = (left + width) / zoom + step;
  const ticks: ReactNode[] = [];
  for (let t = from; t <= to; t += minor) {
    const major = Math.abs(t / step - Math.round(t / step)) < 1e-6;
    ticks.push(
      <div
        key={t.toFixed(3)}
        className={`tick ${major ? "tick-major" : ""}`}
        style={{ left: t * zoom }}
      >
        {major && <span>{rulerLabel(t, step)}</span>}
      </div>,
    );
  }
  return (
    <div className="ruler" onPointerDown={onPointerDown}>
      {ticks}
    </div>
  );
}

function IntervalMarkers({
  interval,
  fps,
  zoom,
  height,
  onDrag,
}: {
  interval: { start: number; end: number } | null;
  fps: number;
  zoom: number;
  height: number;
  onDrag: (e: React.PointerEvent, edge: "start" | "end") => void;
}): ReactNode {
  const time = usePlayback((s) => s.time);
  const [active, setActive] = useState<"start" | "end" | null>(null);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const startRef = useRef<HTMLButtonElement>(null);
  const endRef = useRef<HTMLButtonElement>(null);
  const start = interval?.start ?? time;
  const end = interval?.end ?? time;
  const updatePosition = useCallback((): void => {
    if (!active) return;
    const rect = (active === "start" ? startRef : endRef).current?.getBoundingClientRect();
    if (rect) {
      const next = {
        left: Math.max(8, Math.min(rect.right - 242, window.innerWidth - 250)),
        top: Math.max(8, rect.top - 62),
      };
      setPosition((previous) =>
        previous.left === next.left && previous.top === next.top ? previous : next,
      );
    }
  }, [active]);
  // The anchor can move after any timeline layout update, including zoom and trimming.
  useLayoutEffect(() => {
    updatePosition();
  });
  useEffect(() => {
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [updatePosition]);
  useEffect(() => {
    const dismiss = (e: PointerEvent): void => {
      if (e.target !== startRef.current && e.target !== endRef.current) setActive(null);
    };
    const key = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setActive(null);
    };
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", key);
    };
  }, []);
  useEffect(() => {
    if (!interval) setActive(null);
  }, [interval]);
  return (
    <>
      {end > start && (
        <div
          className="tl-interval-fill"
          style={{ left: start * zoom, width: (end - start) * zoom, height }}
        />
      )}
      <button
        type="button"
        ref={startRef}
        className="tl-interval-handle is-start"
        style={{ left: start * zoom }}
        aria-label="Início do intervalo"
        onPointerDown={(e) => {
          if (e.button === 0) setActive(e.shiftKey ? null : "start");
          onDrag(e, "start");
        }}
      />
      <button
        type="button"
        ref={endRef}
        className="tl-interval-handle is-end"
        style={{ left: end * zoom }}
        aria-label="Fim do intervalo"
        onPointerDown={(e) => {
          if (e.button === 0) setActive(e.shiftKey ? null : "end");
          onDrag(e, "end");
        }}
      />
      {active &&
        createPortal(
          <div className="tl-interval-tooltip" role="tooltip" style={position}>
            <div>
              <span>{active === "start" ? "Início da seleção:" : "Término da seleção:"}</span>
              <b>{timecode(active === "start" ? start : end, fps)}</b>
            </div>
            <div>
              <span>Duração:</span>
              <b>{timecode(end - start, fps)}</b>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function Playhead({
  zoom,
  height,
  scrollRef,
  previewTime,
  onPointerDown,
  onClearInterval,
}: {
  zoom: number;
  height: number;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  previewTime?: number;
  onPointerDown: (e: React.PointerEvent) => void;
  onClearInterval: () => void;
}): ReactNode {
  const time = usePlayback((s) => s.time);
  const playing = usePlayback((s) => s.playing);
  const x = (previewTime ?? time) * zoom;

  // Page the view forward while playing so the playhead never leaves the screen.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !playing) return;
    if (x > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = x - 80;
    else if (x < el.scrollLeft) el.scrollLeft = Math.max(0, x - 80);
  }, [x, playing, scrollRef]);

  return (
    <>
      <div className="playhead" style={{ left: x, height }} />
      <div className="playhead-head" style={{ left: x }} />
      <fieldset
        className="playhead-hit"
        aria-label="Indicador de reprodução. Use os controles de transporte para navegar pelo teclado."
        style={{ left: x, height }}
        onPointerDown={onPointerDown}
        onDoubleClick={(e) => {
          if (
            e.button !== 0 ||
            e.shiftKey ||
            e.clientY - e.currentTarget.getBoundingClientRect().top > 16
          )
            return;
          e.preventDefault();
          e.stopPropagation();
          onClearInterval();
        }}
        title="Duplo clique na cabeça para limpar o intervalo. Arraste para navegar. Shift + arrasto move os clipes à direita. Esc cancela."
      />
    </>
  );
}

const KIND_ICON = { video: Film, audio: Music, image: Image };

interface ClipProps {
  clip: Clip;
  asset: Asset | undefined;
  track: Track;
  top: number;
  height: number;
  zoom: number;
  selected: boolean;
  dragging: boolean;
  viewLeft: number;
  viewWidth: number;
  onPointerDown: (e: React.PointerEvent, clip: Clip, part: "body" | "start" | "end") => void;
  onContextMenu: (e: React.MouseEvent, clip: Clip) => void;
}

const ClipView = memo(function ClipView({
  clip,
  asset,
  track,
  top,
  height,
  zoom,
  selected,
  dragging,
  viewLeft,
  viewWidth,
  onPointerDown,
  onContextMenu,
}: ClipProps): ReactNode {
  const left = clip.start * zoom;
  const width = Math.max(2, clip.duration * zoom);
  // Skip clips far off screen.
  if (left > viewLeft + viewWidth + 200 || left + width < viewLeft - 200) return null;
  const kind = asset?.kind ?? "video";
  const Icon = KIND_ICON[kind];
  const showThumbs = kind !== "audio" && asset?.thumb;
  const showWave = asset?.hasAudio && asset.waveform;
  const balloonText =
    clip.annotation?.kind === "balloon"
      ? clip.annotation.text?.replace(/\s+/g, " ").trim()
      : undefined;
  const name = balloonText ? `Balão · ${balloonText}` : (asset?.name ?? "Mídia removida");

  return (
    <fieldset
      className={`clip clip-${clip.zoomLayer ? "zoomfx" : kind} ${selected ? "is-selected" : ""} ${dragging ? "is-dragging" : ""} ${asset?.missing || !asset ? "is-missing" : ""} ${track.hidden ? "is-hidden" : ""} ${track.muted ? "is-muted" : ""}`}
      aria-label={`Clipe ${name}`}
      style={{ left, width, top: top + 3, height: height - 6 }}
      onPointerDown={(e) => onPointerDown(e, clip, "body")}
      onContextMenu={(e) => onContextMenu(e, clip)}
      title={`${name}${clipSpeed(clip) !== 1 ? ` · velocidade ${speedLabel(clipSpeed(clip))}` : ""}`}
    >
      {showThumbs && (
        <div
          className="clip-thumbs"
          style={{ backgroundImage: `url("${mediaUrl(asset.thumb!)}")` }}
        />
      )}
      {showWave && (
        <div className={`clip-wave ${kind === "audio" ? "is-full" : ""}`}>
          <Waveform
            path={asset.waveform!}
            sourceIn={clip.in}
            duration={clip.duration}
            speed={clipSpeed(clip)}
            zoom={zoom}
            clipLeft={left}
            viewLeft={viewLeft}
            viewWidth={viewWidth}
            color={kind === "audio" ? "#3FD3C2" : "#8FB0FF"}
          />
        </div>
      )}
      {width > 28 && (
        <div className="clip-label">
          <Icon size={11} />
          <span>
            {clip.zoomLayer ? `Zoom ${clip.zoomLayer.scale.toFixed(1)}× · faixas abaixo` : name}
          </span>
          {clipSpeed(clip) !== 1 && (
            <span className="clip-speed mono">{speedLabel(clipSpeed(clip))}</span>
          )}
          {clip.volume !== 1 && (
            <span className="clip-vol mono">{Math.round(clip.volume * 100)}%</span>
          )}
        </div>
      )}
      <div className="trim trim-start" onPointerDown={(e) => onPointerDown(e, clip, "start")} />
      <div className="trim trim-end" onPointerDown={(e) => onPointerDown(e, clip, "end")} />
    </fieldset>
  );
});

/** Zooms and recording markers (Ctrl+M, Ctrl+R) of the clips, in timeline seconds. */
function recordingMarks(
  project: Project,
): { kind: "zoom" | "marker" | "retake"; start: number; end: number; label: string }[] {
  const out: { kind: "zoom" | "marker" | "retake"; start: number; end: number; label: string }[] =
    [];
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  for (const c of project.clips) {
    const toT = (src: number): number => timelineAt(c, src);
    const inside = (src: number): boolean => src >= c.in && src <= sourceEnd(c);
    for (const z of c.zooms ?? []) {
      const a = Math.max(c.in, z.start);
      const b = Math.min(sourceEnd(c), z.end);
      if (b > a)
        out.push({
          kind: "zoom",
          start: toT(a),
          end: toT(b),
          label: `Zoom ${Math.round(z.scale * 100)}%${z.auto ? " · automático" : ""}`,
        });
    }
    for (const m of assets.get(c.assetId)?.markers ?? [])
      if (inside(m.t))
        out.push({
          kind: m.kind,
          start: toT(m.t),
          end: toT(m.t),
          label: m.kind === "retake" ? "Refazer (Ctrl+R)" : "Marcador (Ctrl+M)",
        });
  }
  return out;
}
