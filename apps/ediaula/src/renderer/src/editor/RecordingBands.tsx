import { clipEnd, sourceAt, sourceEnd, timelineAt } from "@shared/timeline";
import type { Clip, Project } from "@shared/types";
import { moveZoomEdge } from "@shared/zoom";
import { type ReactNode, type PointerEvent as ReactPointerEvent, useState } from "react";
import { useApp } from "@/state/app";
import { playback } from "@/state/playback";
import { useProject } from "@/state/project";
import { cursorFxOf } from "./CursorLayer";
import { setAssetZooms, setCursorFx } from "./RecordingProps";

/** A band being dragged by one edge, in source seconds of its recording. */
interface EdgeDrag {
  kind: "zoom" | "range";
  assetId: string;
  id: string;
  edge: "start" | "end";
  /** Source second the edge is at now. */
  at: number;
}

interface Band {
  kind: "zoom" | "range";
  clip: Clip;
  assetId: string;
  id: string;
  /** Timeline seconds. */
  start: number;
  end: number;
  label: string;
}

const MIN_RANGE = 0.3;

/**
 * The zooms of the recordings (amber, along the ruler) and the stretches of cursor effects
 * (violet, at the foot of the recording's clip), over the timeline. A click selects one for the
 * side panel and the preview; dragging an edge moves where it starts or ends, in the recording's
 * own seconds, so it stays with the same moment through cuts.
 */
export function RecordingBands({
  project,
  zoom,
  laneTops,
  laneHeight,
  xToTime,
  rulerHeight,
}: {
  project: Project;
  /** Pixels per second. */
  zoom: number;
  laneTops: Map<string, number>;
  laneHeight: (trackId: string) => number;
  xToTime: (clientX: number) => number;
  rulerHeight: number;
}): ReactNode {
  const [drag, setDrag] = useState<EdgeDrag | null>(null);
  const editingZoom = useApp((s) => s.recordingZoom);
  const editingRange = useApp((s) => s.cursorRange);
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  const bands: Band[] = [];
  for (const clip of project.clips) {
    const asset = assets.get(clip.assetId);
    if (!asset) continue;
    const a = clip.in;
    const b = sourceEnd(clip);
    const place = (kind: Band["kind"], id: string, start: number, end: number, label: string) => {
      let s = start;
      let e = end;
      if (drag?.assetId === asset.id && drag.id === id && drag.kind === kind) {
        if (drag.edge === "start") s = drag.at;
        else e = drag.at;
      }
      const from = Math.max(a, s);
      const to = Math.min(b, e);
      if (to > from)
        bands.push({
          kind,
          clip,
          assetId: asset.id,
          id,
          start: timelineAt(clip, from),
          end: timelineAt(clip, to),
          label,
        });
    };
    for (const z of asset.zooms ?? [])
      place(
        "zoom",
        z.id,
        z.start,
        z.end,
        `Zoom ${Math.round(z.scale * 100)}%${z.auto ? " · automático" : ""}: clique para editar, arraste as pontas para mudar`,
      );
    if (asset.cursor)
      for (const r of cursorFxOf(asset).ranges ?? [])
        place("range", r.id, r.start, r.end, "Efeito do cursor neste trecho");
  }

  const select = (band: Band): void => {
    useProject.getState().select([band.clip.id]);
    useApp.getState().set(
      band.kind === "zoom"
        ? {
            recordingZoom: { assetId: band.assetId, zoomId: band.id },
            sideTab: "properties",
          }
        : { cursorRange: band.id, sideTab: "properties" },
    );
    playback.seek(Math.min(clipEnd(band.clip) - 0.01, band.start + 0.05));
  };

  const grab = (e: ReactPointerEvent, band: Band, edge: "start" | "end"): void => {
    e.preventDefault();
    e.stopPropagation();
    const asset = assets.get(band.assetId);
    if (!asset) return;
    const clip = band.clip;
    const sourceOf = (clientX: number): number =>
      sourceAt(clip, Math.max(clip.start, Math.min(clipEnd(clip), xToTime(clientX))));
    let at = sourceOf(e.clientX);
    // A click on an edge that does not drag it changes nothing (an automatic zoom stays one).
    const x0 = e.clientX;
    let moved = false;
    setDrag({ kind: band.kind, assetId: band.assetId, id: band.id, edge, at });
    const move = (ev: PointerEvent): void => {
      if (Math.abs(ev.clientX - x0) > 2) moved = true;
      at = sourceOf(ev.clientX);
      setDrag({ kind: band.kind, assetId: band.assetId, id: band.id, edge, at });
    };
    const up = (): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setDrag(null);
      if (!moved) return;
      if (band.kind === "zoom")
        setAssetZooms(band.assetId, (zooms) =>
          moveZoomEdge(zooms, band.id, edge, at, asset.duration),
        );
      else {
        const ranges = cursorFxOf(asset).ranges ?? [];
        setCursorFx(band.assetId, {
          ranges: ranges.map((r) =>
            r.id !== band.id
              ? r
              : edge === "start"
                ? { ...r, start: Math.max(0, Math.min(at, r.end - MIN_RANGE)) }
                : { ...r, end: Math.min(asset.duration, Math.max(at, r.start + MIN_RANGE)) },
          ),
        });
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <>
      {bands.map((band) => {
        const selected =
          band.kind === "zoom"
            ? editingZoom?.assetId === band.assetId && editingZoom.zoomId === band.id
            : editingRange === band.id;
        // Zooms run along the ruler (the stylesheet places them); stretches at the clip's foot.
        const top =
          band.kind === "zoom"
            ? undefined
            : (laneTops.get(band.clip.trackId) ?? rulerHeight) + laneHeight(band.clip.trackId) - 9;
        return (
          <div
            key={`${band.kind}:${band.clip.id}:${band.id}`}
            className={`${band.kind === "zoom" ? "zoom-band" : "cursor-band"}${selected ? " is-selected" : ""}`}
            style={{
              left: band.start * zoom,
              width: Math.max(4, (band.end - band.start) * zoom),
              top,
            }}
            title={band.label}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.stopPropagation();
              select(band);
            }}
          >
            <span className="band-edge is-start" onPointerDown={(e) => grab(e, band, "start")} />
            <span className="band-edge is-end" onPointerDown={(e) => grab(e, band, "end")} />
          </div>
        );
      })}
    </>
  );
}
