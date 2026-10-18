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
  // Sheets of ten minutes (a strip made before sheets is one sheet with every picture).
  const sheets = strip.sheets?.length ? strip.sheets : [strip.path];
  const perSheet = strip.sheets?.length && strip.perSheet ? strip.perSheet : strip.count;
  const slots: ReactNode[] = [];
  for (let k = first; k < last; k++) {
    const middle = sourceIn + (((k + 0.5) * tileW) / zoom) * speed;
    const index = Math.max(0, Math.min(strip.count - 1, Math.floor(middle / strip.step)));
    const sheet = Math.min(sheets.length - 1, Math.floor(index / perSheet));
    const local = index - sheet * perSheet;
    const pictures = Math.min(perSheet, strip.count - sheet * perSheet);
    const rows = Math.ceil(pictures / strip.columns);
    const col = local % strip.columns;
    const row = Math.floor(local / strip.columns);
    const url = `url("${mediaUrl(sheets[sheet])}")`;
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
