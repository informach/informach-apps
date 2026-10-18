import { clipLayout } from "@shared/compose";
import { clipEnd, sourceAt } from "@shared/timeline";
import type { Asset, Clip, ProjectSettings } from "@shared/types";
import { focusIndexAt, setZoomFocus, updateZoom } from "@shared/zoom";
import type { ReactNode } from "react";
import { usePlayback } from "@/state/playback";
import { setAssetZooms } from "./RecordingProps";
import { FocusBox } from "./ZoomTarget";

/**
 * The rectangle of a recording's zoom being edited, over its clip in the preview (the same box
 * as the zoom layer's): it moves the focus point in force at the playhead, and the wheel
 * changes how close the zoom gets.
 */
export function RecordingZoomTarget({
  clip,
  asset,
  zoomId,
  settings,
  scale,
}: {
  clip: Clip;
  asset: Asset;
  zoomId: string;
  settings: ProjectSettings;
  /** Preview pixels per lesson pixel. */
  scale: number;
}): ReactNode {
  const time = usePlayback((s) => s.time);
  const zoom = asset.zooms?.find((z) => z.id === zoomId);
  if (!zoom || time < clip.start || time >= clipEnd(clip)) return null;
  const src = sourceAt(clip, time);
  const point = zoom.focus[focusIndexAt(zoom, src)] ?? { x: 0.5, y: 0.5 };
  const lay = clipLayout(clip, asset, settings);
  return (
    <FocusBox
      focus={{ scale: zoom.scale, x: point.x, y: point.y }}
      left={lay.full.x * scale}
      top={lay.full.y * scale}
      width={lay.full.w * scale}
      height={lay.full.h * scale}
      min={1.05}
      onCommit={(change) =>
        setAssetZooms(asset.id, (zooms) => {
          let next = zooms;
          if (change.scale !== undefined) next = updateZoom(next, zoom.id, { scale: change.scale });
          if (change.x !== undefined || change.y !== undefined)
            next = setZoomFocus(next, zoom.id, src, change.x ?? point.x, change.y ?? point.y);
          return next;
        })
      }
    />
  );
}
