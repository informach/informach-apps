import type { PageRef } from "@shared/model";
import {
  compilePageNumbers,
  decorationApplies,
  numberPosition,
  watermarkPosition,
} from "@shared/page-decorations";
import { useEffect, useMemo, useState } from "react";
import { localFonts } from "../lib/fonts";
import { acquireLocalFont } from "../lib/local-font-face";
import type { DocState } from "../state/store";

export function DecorationsLayer({
  doc,
  page,
  width,
  height,
}: {
  doc: DocState;
  page: PageRef;
  width: number;
  height: number;
}): React.ReactElement | null {
  const plan = useMemo(() => {
    try {
      return {
        numbers: compilePageNumbers(doc.content.pages, doc.content.pageNumbers).get(page.id),
        watermark:
          doc.content.watermark?.text && decorationApplies(doc.content.watermark.scope, page.id)
            ? doc.content.watermark
            : null,
        error: "",
      };
    } catch (failure) {
      return {
        numbers: undefined,
        watermark: null,
        error: failure instanceof Error ? failure.message : "Numeração indisponível.",
      };
    }
  }, [doc.content, page.id]);
  const needRegular = !!plan.numbers?.entries.length,
    needBold = !!plan.watermark;
  const fontKey = `${needRegular}:${needBold}`;
  const [fonts, setFonts] = useState<{ key: string; regular?: string; bold?: string } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  useEffect(() => {
    const abort = new AbortController(),
      releases: (() => void)[] = [];
    const release = () => {
      for (const end of releases.splice(0)) end();
    };
    setFailure(null);
    if (!needRegular && !needBold) {
      setFonts(null);
      return () => abort.abort();
    }
    void (async () => {
      const bytes = await localFonts();
      abort.signal.throwIfAborted();
      const prepared: { key: string; regular?: string; bold?: string } = { key: fontKey };
      if (needRegular) {
        const lease = await acquireLocalFont(bytes.regular, abort.signal);
        releases.push(lease.release);
        prepared.regular = lease.family;
      }
      if (needBold) {
        const lease = await acquireLocalFont(bytes.bold, abort.signal);
        releases.push(lease.release);
        prepared.bold = lease.family;
      }
      abort.signal.throwIfAborted();
      setFonts(prepared);
    })().catch((error: unknown) => {
      release();
      if (!abort.signal.aborted)
        setFailure({
          key: fontKey,
          message: error instanceof Error ? error.message : "Fonte das marcas indisponível.",
        });
    });
    return () => {
      abort.abort();
      release();
    };
  }, [fontKey, needRegular, needBold]);
  const readyFonts = fonts?.key === fontKey ? fonts : null;
  const measured = useMemo(() => {
    if (!readyFonts) return null;
    try {
      const context = document.createElement("canvas").getContext("2d");
      if (!context) throw new Error("Não foi possível medir as marcas da página.");
      const wm = plan.watermark;
      let watermark: { x: number; y: number; size: number; family: string } | undefined;
      if (wm && readyFonts.bold) {
        context.font = `${wm.size}px "${readyFonts.bold}"`;
        const metrics = context.measureText(wm.text);
        const advanced =
          wm.position !== undefined ||
          wm.fit !== undefined ||
          wm.marginX !== undefined ||
          wm.marginY !== undefined;
        watermark = {
          ...watermarkPosition(
            width,
            height,
            metrics.width,
            wm,
            advanced
              ? { ascent: metrics.fontBoundingBoxAscent, descent: metrics.fontBoundingBoxDescent }
              : undefined,
          ),
          family: readyFonts.bold,
        };
      }
      const numbers = (plan.numbers?.entries ?? []).map((entry) => {
        if (!readyFonts.regular) throw new Error("Fonte da numeração ainda não preparada.");
        context.font = `${entry.size}px "${readyFonts.regular}"`;
        const metrics = context.measureText(entry.text),
          settings = doc.content.pageNumbers;
        const advanced =
          settings?.scope !== undefined ||
          settings?.marginX !== undefined ||
          settings?.marginY !== undefined ||
          settings?.style !== undefined ||
          settings?.additional !== undefined;
        return {
          ...entry,
          ...numberPosition(
            entry.position,
            width,
            height,
            metrics.width,
            entry.size,
            doc.content.pageNumbers?.marginX,
            doc.content.pageNumbers?.marginY,
            advanced
              ? { ascent: metrics.fontBoundingBoxAscent, descent: metrics.fontBoundingBoxDescent }
              : undefined,
          ),
          family: readyFonts.regular,
        };
      });
      return { watermark, numbers, error: "" };
    } catch (error) {
      return {
        watermark: undefined,
        numbers: [],
        error: error instanceof Error ? error.message : "Marcas indisponíveis.",
      };
    }
  }, [readyFonts, plan, width, height, doc.content.pageNumbers]);
  const error = plan.error || (failure?.key === fontKey ? failure.message : "") || measured?.error;
  if (error)
    return (
      <span className="page-warning" role="alert">
        {error}
      </span>
    );
  if (!needRegular && !needBold) return null;
  if (!measured)
    return (
      <span className="muted small" role="status">
        Preparando marcas da página…
      </span>
    );
  const wm = plan.watermark,
    placed = measured.watermark;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Marcas, cabeçalhos e rodapés da página"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        overflow: "hidden",
        fontSynthesis: "none",
      }}
    >
      <title>Marcas e cabeçalhos</title>
      {wm && placed && (
        <text
          className="page-watermark"
          x={placed.x}
          y={placed.y}
          fontSize={placed.size}
          fontFamily={placed.family}
          fill={wm.color}
          opacity={wm.opacity}
          transform={`rotate(${-wm.angle} ${placed.x} ${placed.y})`}
        >
          {wm.text}
        </text>
      )}
      {measured.numbers.map((entry) => (
        <text
          className="page-number"
          key={entry.position}
          x={entry.x}
          y={entry.y}
          fontSize={entry.size}
          fontFamily={entry.family}
          fill={entry.color}
        >
          {entry.text}
        </text>
      ))}
    </svg>
  );
}
