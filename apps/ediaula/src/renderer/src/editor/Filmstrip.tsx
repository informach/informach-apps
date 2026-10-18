import type { Filmstrip as Strip } from "@shared/types";
import type { ReactNode } from "react";
import { mediaUrl } from "@/lib/media";

interface Props {
  strip: Strip;
  /** Source in-point and timeline length of the clip, and its speed. */
  sourceIn: number;
  duration: number;
  speed: number;
  zoom: number;
  /** Height of the pictures, in pixels, and the room left under them (the waveform). */
  height: number;
  bottom: number;
  /** Clip's left edge in timeline pixels, and the visible viewport in timeline pixels. */
  clipLeft: number;
  viewLeft: number;
  viewWidth: number;
}

/**
 * The pictures of the stretch of the video a clip shows, in order: each slot shows the picture
 * of the source second under its middle (the clip's in-point and speed), so a piece cut from the
 * middle of a recording shows its own part. Only the slots on screen are drawn.
 */
export function Filmstrip({
  strip,
  sourceIn,
  duration,
  speed,
  zoom,
  height,
  bottom,
  clipLeft,
  viewLeft,
  viewWidth,
}: Props): ReactNode {
  if (height < 8 || strip.count <= 0) return null;
  const tileW = (height * strip.width) / strip.height;
  const clipWidth = duration * zoom;
  const first = Math.max(0, Math.floor((viewLeft - clipLeft) / tileW));
  const last = Math.min(
    Math.ceil(clipWidth / tileW),
    Math.ceil((viewLeft + viewWidth - clipLeft) / tileW),
  );
  const rows = Math.ceil(strip.count / strip.columns);
  const url = `url("${mediaUrl(strip.path)}")`;
  const slots: ReactNode[] = [];
  for (let k = first; k < last; k++) {
    const middle = sourceIn + (((k + 0.5) * tileW) / zoom) * speed;
    const index = Math.max(0, Math.min(strip.count - 1, Math.floor(middle / strip.step)));
    const col = index % strip.columns;
    const row = Math.floor(index / strip.columns);
    slots.push(
      <span
        key={k}
        className="filmstrip-tile"
        style={{
          left: k * tileW,
          width: Math.min(tileW, clipWidth - k * tileW),
          height,
          backgroundImage: url,
          backgroundSize: `${strip.columns * tileW}px ${rows * height}px`,
          backgroundPosition: `${-col * tileW}px ${-row * height}px`,
        }}
      />,
    );
  }
  return (
    <div className="clip-filmstrip" style={{ bottom }}>
      {slots}
    </div>
  );
}
