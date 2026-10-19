import { withRenderKeys } from "@informach/edi-desktop/renderer";
import { arrowHead, smoothPath } from "@shared/build";
import { type Annot, cssFontForText, LINE_HEIGHT, NOTE_SIZE, type TextAnnot } from "@shared/model";
import { MessageSquare } from "lucide-react";
import { ParagraphView } from "./ParagraphView";

const pts = (flat: number[]): [number, number][] => {
  const out: [number, number][] = [];
  for (let i = 0; i < flat.length; i += 2) out.push([flat[i], flat[i + 1]]);
  return out;
};

export const textStyle = (
  a: Pick<TextAnnot, "font" | "size" | "color" | "bold" | "italic" | "opacity"> & { text?: string },
  scale: number,
): React.CSSProperties => ({
  fontFamily: cssFontForText(a.font, a.text ?? ""),
  fontSize: a.size * scale,
  lineHeight: LINE_HEIGHT,
  color: a.color,
  fontWeight: a.bold ? 700 : 400,
  fontStyle: a.italic ? "italic" : "normal",
  opacity: a.opacity ?? 1,
});

/** SVG shapes (in view units: the parent <svg> has a viewBox in points). */
export function AnnotSvg({ a, hit }: { a: Annot; hit?: boolean }): React.ReactElement | null {
  const common = { "data-annot": a.id, opacity: a.opacity ?? 1 } as const;
  // A wide transparent stroke makes thin lines easy to grab.
  const hitStroke = hit ? { pointerEvents: "stroke" as const } : { pointerEvents: "none" as const };
  switch (a.kind) {
    case "rect":
      return (
        <rect
          {...common}
          x={a.x}
          y={a.y}
          width={a.w}
          height={a.h}
          fill={a.fill ?? "transparent"}
          stroke={a.stroke ?? "none"}
          strokeWidth={a.stroke ? a.width : 0}
          style={{ pointerEvents: hit ? "all" : "none" }}
        />
      );
    case "ellipse":
      return (
        <ellipse
          {...common}
          cx={a.x + a.w / 2}
          cy={a.y + a.h / 2}
          rx={a.w / 2}
          ry={a.h / 2}
          fill={a.fill ?? "transparent"}
          stroke={a.stroke ?? "none"}
          strokeWidth={a.stroke ? a.width : 0}
          style={{ pointerEvents: hit ? "all" : "none" }}
        />
      );
    case "line":
    case "arrow": {
      const segs = [
        [a.x1, a.y1, a.x2, a.y2],
        ...(a.kind === "arrow" ? arrowHead(a.x1, a.y1, a.x2, a.y2, a.width) : []),
      ];
      const d = segs.map(([x1, y1, x2, y2]) => `M${x1} ${y1}L${x2} ${y2}`).join("");
      return (
        <g {...common}>
          <path
            d={d}
            stroke={a.stroke}
            strokeWidth={a.width}
            strokeLinecap="round"
            fill="none"
            style={{ pointerEvents: "none" }}
          />
          {hit && (
            <path
              data-annot={a.id}
              d={d}
              stroke="transparent"
              strokeWidth={a.width + 10}
              fill="none"
              style={hitStroke}
            />
          )}
        </g>
      );
    }
    case "ink":
      return (
        <g {...common}>
          {withRenderKeys(a.paths, (path) => JSON.stringify(path)).map(({ key, value: p }) => {
            if (p.length === 2)
              return (
                <circle
                  key={key}
                  data-annot={a.id}
                  cx={p[0]}
                  cy={p[1]}
                  r={a.width / 2}
                  fill={a.stroke}
                  style={{ pointerEvents: hit ? "all" : "none" }}
                />
              );
            const d = smoothPath(pts(p));
            return (
              <g key={key}>
                <path
                  d={d}
                  stroke={a.stroke}
                  strokeWidth={a.width}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  style={{ pointerEvents: "none" }}
                />
                {hit && (
                  <path
                    data-annot={a.id}
                    d={d}
                    stroke="transparent"
                    strokeWidth={a.width + 10}
                    fill="none"
                    style={hitStroke}
                  />
                )}
              </g>
            );
          })}
        </g>
      );
    case "underline":
    case "strike":
      return (
        <g {...common}>
          {withRenderKeys(a.rects, (rect) => JSON.stringify(rect)).map(({ key, value: r }) => {
            const t = Math.max(0.8, r.h * 0.07);
            const y = a.kind === "underline" ? r.y + r.h - t * 1.5 : r.y + r.h * 0.55;
            return (
              <g key={key}>
                <line
                  x1={r.x}
                  x2={r.x + r.w}
                  y1={y}
                  y2={y}
                  stroke={a.color}
                  strokeWidth={t}
                  style={{ pointerEvents: "none" }}
                />
                {hit && (
                  <rect
                    data-annot={a.id}
                    x={r.x}
                    y={r.y}
                    width={r.w}
                    height={r.h}
                    fill="transparent"
                    style={{ pointerEvents: "all" }}
                  />
                )}
              </g>
            );
          })}
        </g>
      );
    case "highlight":
      return (
        <g {...common}>
          {withRenderKeys(a.rects, (rect) => JSON.stringify(rect)).map(({ key, value: r }) => (
            <rect
              key={key}
              data-annot={a.id}
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
              fill={a.color}
              style={{ pointerEvents: hit ? "all" : "none" }}
            />
          ))}
        </g>
      );
    default:
      return null;
  }
}

/** HTML-rendered annotations: text, images and note icons. */
export function AnnotHtml({
  a,
  scale,
  hit,
  onNoteClick,
  zIndex,
  selectable,
}: {
  a: Annot;
  scale: number;
  hit?: boolean;
  onNoteClick?: () => void;
  zIndex?: number;
  selectable?: boolean;
}): React.ReactElement | null {
  const pe = hit ? "auto" : "none";
  switch (a.kind) {
    case "paragraph":
      return (
        <ParagraphView a={a} scale={scale} zIndex={zIndex} hit={hit} selectable={selectable} />
      );
    case "text":
      return (
        <div
          data-annot={a.id}
          className="annot-text"
          style={{
            left: a.x * scale,
            top: a.y * scale,
            zIndex,
            pointerEvents: selectable ? "auto" : pe,
            userSelect: selectable ? "text" : undefined,
            cursor: selectable ? "text" : undefined,
            ...textStyle(a, scale),
          }}
        >
          {a.text || " "}
        </div>
      );
    case "image":
      return (
        <img
          data-annot={a.id}
          className="annot-image"
          alt="Imagem adicionada ao documento"
          src={a.src}
          draggable={false}
          style={{
            left: a.x * scale,
            zIndex,
            top: a.y * scale,
            width: a.w * scale,
            height: a.h * scale,
            opacity: a.opacity ?? 1,
            pointerEvents: pe,
          }}
        />
      );
    case "note":
      return (
        <button
          type="button"
          data-annot={a.id}
          className="annot-note"
          style={{
            left: a.x * scale,
            zIndex,
            top: a.y * scale,
            width: NOTE_SIZE * scale,
            height: NOTE_SIZE * scale,
            pointerEvents: pe,
            background: a.color,
          }}
          onDoubleClick={onNoteClick}
          title={a.text || "Comentário"}
        >
          <MessageSquare size={Math.max(10, NOTE_SIZE * scale * 0.6)} />
        </button>
      );
    default:
      return null;
  }
}

export const isSvgKind = (a: Annot): boolean =>
  !["text", "paragraph", "image", "note"].includes(a.kind);
