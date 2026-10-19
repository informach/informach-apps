import { withRenderKeys } from "@informach/edi-desktop/renderer";
import type { ParagraphAnnot } from "@shared/model";
import { paragraphFontBytes } from "@shared/paragraph-font";
import type { ParagraphLayout } from "@shared/paragraph-layout";
import { useEffect, useMemo, useState } from "react";
import { localFonts } from "../lib/fonts";
import { acquireLocalFont } from "../lib/local-font-face";
import { paragraphLayoutInWorker } from "../lib/paragraph-layout";

export function ParagraphView({
  a,
  scale,
  zIndex,
  hit,
  selectable,
  positioned = true,
  onReady,
}: {
  a: ParagraphAnnot;
  scale: number;
  zIndex?: number;
  hit?: boolean;
  selectable?: boolean;
  positioned?: boolean;
  onReady?: (input: ParagraphAnnot | null) => void;
}): React.ReactElement {
  const { text, w, h, size, bold, italic, align, spacing, padding, list } = a;
  const fontData = a.fontData?.data;
  const input = useMemo<ParagraphAnnot>(
    () => ({
      id: "paragraph-preview",
      page: "p",
      kind: "paragraph",
      x: 0,
      y: 0,
      text,
      w,
      h,
      size,
      color: "#000000",
      bold,
      italic,
      align,
      spacing,
      padding,
      list,
      fontData: fontData === undefined ? undefined : { name: "Fonte local", data: fontData },
    }),
    [text, w, h, size, bold, italic, align, spacing, padding, list, fontData],
  );
  const [prepared, setPrepared] = useState<{ layout: ParagraphLayout; family: string } | null>(
      null,
    ),
    [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController();
    let release: (() => void) | undefined;
    setPrepared(null);
    setError("");
    onReady?.(null);
    void (async () => {
      const bytes = paragraphFontBytes(input, await localFonts());
      abort.signal.throwIfAborted();
      const layout = await paragraphLayoutInWorker(input, bytes, abort.signal);
      const font = await acquireLocalFont(bytes, abort.signal);
      release = font.release;
      abort.signal.throwIfAborted();
      setPrepared({ layout, family: font.family });
      onReady?.(input);
    })().catch((failure: unknown) => {
      release?.();
      release = undefined;
      if (!abort.signal.aborted)
        setError(failure instanceof Error ? failure.message : "Falha na caixa de texto.");
    });
    return () => {
      abort.abort();
      release?.();
    };
  }, [input, onReady]);
  return (
    <div
      data-annot={positioned ? a.id : undefined}
      className={positioned ? "annot-paragraph" : "paragraph-preview"}
      style={{
        position: positioned ? "absolute" : "relative",
        left: positioned ? a.x * scale : undefined,
        top: positioned ? a.y * scale : undefined,
        width: a.w * scale,
        height: a.h * scale,
        zIndex,
        opacity: a.opacity ?? 1,
        pointerEvents: selectable || hit ? "auto" : "none",
        userSelect: selectable ? "text" : "none",
      }}
    >
      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : prepared ? (
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${a.w} ${a.h}`}
          role="img"
          aria-label={`Caixa de texto: ${a.text}`}
          style={{ overflow: "visible", fontKerning: "none", fontVariantLigatures: "normal" }}
        >
          <title>Caixa de texto</title>
          {withRenderKeys(prepared.layout.runs, (run) => JSON.stringify(run)).map(
            ({ key, value: run }) => (
              <text
                key={key}
                x={run.x}
                y={run.baseline}
                fontFamily={prepared.family}
                fontSize={a.size}
                fill={a.color}
                textLength={run.width || undefined}
                lengthAdjust="spacingAndGlyphs"
                xmlSpace="preserve"
              >
                {run.text}
              </text>
            ),
          )}
        </svg>
      ) : (
        <p role="status">Compondo caixa de texto…</p>
      )}
    </div>
  );
}
