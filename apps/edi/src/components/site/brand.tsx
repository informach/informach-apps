import { EDI_TOOL_BRAND, type EdiGlyphShape } from "@informach/config/edi-brand";
import { EDI_TOOLS, type EdiToolId } from "@informach/config/edi-tools";
import Link from "next/link";
import type { CSSProperties } from "react";

/** Inline style that exposes a tool colour to CSS as `--tool`. */
export function toolStyle(tool: EdiToolId): CSSProperties & { "--tool": string } {
  return { "--tool": EDI_TOOL_BRAND[tool].color };
}

function Glyph({ shapes, size }: { shapes: readonly EdiGlyphShape[]; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {shapes.map((shape, index) => {
        const key = `${shape.kind}-${index}`;
        if (shape.kind === "path") return <path key={key} d={shape.d} />;
        if (shape.kind === "circle")
          return <circle key={key} cx={shape.cx} cy={shape.cy} r={shape.r} />;
        return (
          <rect
            key={key}
            x={shape.x}
            y={shape.y}
            width={shape.width}
            height={shape.height}
            rx={shape.rx}
          />
        );
      })}
    </svg>
  );
}

const glyphSize = { xs: 14, sm: 20, md: 24, lg: 28 } as const;

export function ToolIcon({
  tool,
  size = "md",
}: {
  tool: EdiToolId;
  size?: keyof typeof glyphSize;
}) {
  return (
    <span
      className={size === "md" ? "tool-icon" : `tool-icon tool-icon--${size}`}
      style={{ backgroundColor: EDI_TOOL_BRAND[tool].color }}
    >
      <Glyph shapes={EDI_TOOL_BRAND[tool].glyph} size={glyphSize[size]} />
    </span>
  );
}

export function SuiteBars({ large = false }: { large?: boolean }) {
  return (
    <span className={large ? "suite-bars suite-bars--lg" : "suite-bars"} aria-hidden="true">
      {EDI_TOOLS.map((tool) => (
        <span
          key={tool.id}
          className="suite-bars__bar"
          style={{ backgroundColor: EDI_TOOL_BRAND[tool.id].color }}
        />
      ))}
    </span>
  );
}

export function HubIcon({ size = "lg" }: { size?: "md" | "lg" }) {
  return (
    <span className={size === "md" ? "hub-icon hub-icon--md" : "hub-icon"} aria-hidden="true">
      <SuiteBars large={size === "lg"} />
    </span>
  );
}

export function Wordmark() {
  return (
    <Link className="wordmark" href="/" aria-label="Suíte Edi, início">
      <span className="wordmark__text" aria-hidden="true">
        edi
      </span>
      <SuiteBars />
    </Link>
  );
}
