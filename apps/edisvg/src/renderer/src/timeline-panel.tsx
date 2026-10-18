import { useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { animationKeySelectionId } from "../../shared/animationKeyReference";
import type { TimelineClip } from "../../shared/animationTimeline";
import { timelineWindow } from "./timelineWindow";

interface State {
  selectedKey: { trackId: string; keyId: string } | null;
  selectedKeys?: string[];
  timelineZoom?: number;
  timelineScroll?: { left: number; top: number };
}
interface Props {
  clip: TimelineClip;
  state: State;
  seek(frame: number): void;
  updatePose(): void;
}
const rowHeight = 24;
interface Viewport {
  width: number;
  height: number;
  left: number;
  top: number;
  label: number;
}
function TimelinePanel({
  clip,
  state,
  seek,
  updatePose,
  initialViewport,
  viewportContainer,
}: Props & { initialViewport: Viewport; viewportContainer: HTMLElement }) {
  const ref = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState(initialViewport);
  const zoom = state.timelineZoom ?? 1,
    width = Math.max(200, viewport.width - viewport.label - 20) * zoom;
  const tracks = clip.tracks;
  const selected = new Set(
    state.selectedKeys?.length
      ? state.selectedKeys
      : state.selectedKey
        ? [state.selectedKey.keyId]
        : [],
  );
  const selectedByTrack = new Map<string, Set<string>>();
  for (const id of selected) {
    const entry = clip.keyIndex.get(id);
    if (!entry) continue;
    let ids = selectedByTrack.get(entry.track.id);
    if (!ids) {
      ids = new Set();
      selectedByTrack.set(entry.track.id, ids);
    }
    ids.add(entry.key.id);
  }
  useLayoutEffect(() => {
    const playhead = ref.current?.querySelector("#playhead");
    if (playhead instanceof HTMLElement) playhead.dataset.timelineWidth = String(width);
    updatePose();
  }, [updatePose, width]);
  useLayoutEffect(() => {
    const container = viewportContainer;
    container.scrollLeft = state.timelineScroll?.left ?? 0;
    container.scrollTop = state.timelineScroll?.top ?? 0;
    const update = () =>
      setViewport({
        width: container.clientWidth,
        height: container.clientHeight,
        left: container.scrollLeft,
        top: container.scrollTop,
        label: parseFloat(getComputedStyle(container).getPropertyValue("--track-label")) || 260,
      });
    const observer = new ResizeObserver(update);
    observer.observe(container);
    container.addEventListener("scroll", update);
    update();
    return () => {
      observer.disconnect();
      container.removeEventListener("scroll", update);
    };
  }, [state, viewportContainer]);
  const start = Math.max(0, Math.floor(viewport.top / rowHeight) - 2),
    end = Math.min(tracks.length, Math.ceil((viewport.top + viewport.height) / rowHeight) + 2);
  const minFrame = Math.max(0, ((viewport.left - 16) / width) * clip.frames),
    maxFrame = Math.min(
      clip.frames,
      ((viewport.left + viewport.width - viewport.label + 16) / width) * clip.frames,
    );
  return (
    <div
      ref={ref}
      className="virtual-timeline"
      style={{
        width: width + viewport.label + 20,
        height: (Math.max(tracks.length, 1) + 1) * rowHeight,
      }}
    >
      <div className="virtual-ruler" style={{ width: width + viewport.label }}>
        <div className="ruler-label" style={{ width: viewport.label }}>
          {clip.fps} FPS · PROPRIEDADES
        </div>
        <div
          className="ruler"
          style={{ width }}
          onPointerDown={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            seek(Math.round(((event.clientX - box.left) / box.width) * clip.frames));
          }}
        >
          {[0, 1 / 6, 1 / 3, 1 / 2, 2 / 3, 5 / 6, 1].map((fraction) => (
            <span key={fraction}>{Math.round(clip.frames * fraction)}</span>
          ))}
        </div>
      </div>
      {tracks.slice(start, end).map((track, index) => {
        const window = timelineWindow(
          track,
          minFrame,
          maxFrame,
          width,
          clip.frames,
          selectedByTrack.get(track.id) ?? new Set(),
        );
        return (
          <div
            key={track.id}
            className="virtual-track-row"
            style={{ top: (start + index + 1) * rowHeight, height: rowHeight }}
          >
            <div className="track-label" style={{ width: viewport.label }} title={track.label}>
              {track.label} · {track.property}
            </div>
            <div className="track" data-track-id={track.id} style={{ width, height: rowHeight }}>
              {window.entries.map(({ key, count }) => {
                const id = animationKeySelectionId({ ...track.source, keyId: key.id });
                return (
                  <button
                    type="button"
                    key={key.id}
                    className={`keyframe ${selected.has(id) ? "violet" : ""}`}
                    data-clip-key={id}
                    data-clip-track={track.id}
                    data-clip-frame={key.frame}
                    style={{ left: `${(key.frame / clip.frames) * 100}%` }}
                    aria-pressed={selected.has(id)}
                    aria-label={`${track.label} ${track.property}, quadro ${key.frame}, valor ${key.value}${count > 1 ? ` · ${count} chaves próximas; amplie o zoom temporal` : ""}`}
                  >
                    ◆
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      {!tracks.length && (
        <div className="virtual-track-row" style={{ top: rowHeight, height: rowHeight }}>
          <div className="track-label" style={{ width: viewport.label }}>
            Selecione um objeto
          </div>
          <div className="track" style={{ width }}>
            Grave uma pose, um canal de rig ou ative Autochave.
          </div>
        </div>
      )}
      <div id="playhead" data-timeline-width={width} style={{ left: viewport.label }}>
        <span />
      </div>
    </div>
  );
}
export function mountTimelinePanel(host: Element, props: Props) {
  const container = host.parentElement;
  if (!container) throw new Error("Container da timeline ausente.");
  // First render must use real dimensions. Restoring scroll into a temporary
  // narrower virtual surface clamps the offset before ResizeObserver can run.
  const initialViewport: Viewport = {
    width: container.clientWidth,
    height: container.clientHeight,
    left: props.state.timelineScroll?.left ?? 0,
    top: props.state.timelineScroll?.top ?? 0,
    label: parseFloat(getComputedStyle(container).getPropertyValue("--track-label")) || 260,
  };
  const root = createRoot(host);
  flushSync(() =>
    root.render(
      <TimelinePanel {...props} initialViewport={initialViewport} viewportContainer={container} />,
    ),
  );
  return () => {
    // Capture before React removes the wide virtual surface. Layout-effect
    // cleanup may observe an already-empty container, whose scroll is clamped
    // to zero. Scroll events are asynchronous and cannot own this handoff.
    props.state.timelineScroll = { left: container.scrollLeft, top: container.scrollTop };
    root.unmount();
  };
}
