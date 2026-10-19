import { type Easing, easingSchema } from "@informach/edi-motion";
import { useEffectEvent, useId, useLayoutEffect, useRef, useState } from "react";
import { bindCurveHandles } from "./curveHandles";
import { curvePreview } from "./curvePreview";

type Kind = "linear" | "hold" | "elastic" | "cubic-bezier";
export interface CurveFields {
  p0: string;
  p1: string;
  p2: string;
  p3: string;
  amplitude: string;
  period: string;
}
const numeric = (value: string) => (value.trim() ? Number(value) : Number.NaN);
function parseCurve(kind: Kind, fields: CurveFields) {
  return easingSchema.safeParse(
    kind === "cubic-bezier"
      ? { kind, points: [fields.p0, fields.p1, fields.p2, fields.p3].map(numeric) }
      : kind === "elastic"
        ? { kind, amplitude: numeric(fields.amplitude), period: numeric(fields.period) }
        : kind,
  );
}

/** One dialog draft. Pointer gestures pin the axes; manual changes remeasure
 * them. No document changes or async results can outlive the owning dialog. */
export function useKeyCurve(initial: Easing, discrete: boolean) {
  const points =
      typeof initial !== "string" && initial.kind === "cubic-bezier"
        ? initial.points
        : [0.42, 0, 0.58, 1],
    [kind, setKind] = useState<Kind>(typeof initial === "string" ? initial : initial.kind),
    [fields, setFields] = useState<CurveFields>({
      p0: String(points[0]),
      p1: String(points[1]),
      p2: String(points[2]),
      p3: String(points[3]),
      amplitude: String(
        typeof initial !== "string" && initial.kind === "elastic" ? initial.amplitude : 1,
      ),
      period: String(
        typeof initial !== "string" && initial.kind === "elastic" ? initial.period : 0.3,
      ),
    }),
    [range, setRange] = useState(() => {
      const plot = curvePreview(initial);
      return { min: plot.min, max: plot.max };
    }),
    [copyStatus, setCopyStatus] = useState(""),
    svg = useRef<SVGSVGElement>(null),
    surface = useRef<HTMLDivElement>(null),
    pointFields = useRef(new Map<keyof CurveFields, HTMLInputElement>()),
    representation = useRef<HTMLInputElement>(null),
    handles = useRef<(() => void) | undefined>(undefined),
    live = useRef(true),
    id = useId(),
    resolved = parseCurve(discrete ? "hold" : kind, fields),
    easing: Easing | null = resolved.success ? resolved.data : null,
    plot = easing ? curvePreview(easing, range) : null,
    cubic = !!easing && typeof easing !== "string" && easing.kind === "cubic-bezier";
  useLayoutEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  function writePoints(values: number[]) {
    const parsed = easingSchema.parse({ kind: "cubic-bezier", points: values });
    if (typeof parsed === "string" || parsed.kind !== "cubic-bezier")
      throw new Error("Controle Bézier inválido.");
    if (live.current)
      setFields((fields) => ({
        ...fields,
        p0: String(parsed.points[0]),
        p1: String(parsed.points[1]),
        p2: String(parsed.points[2]),
        p3: String(parsed.points[3]),
      }));
  }
  const readPoints = useEffectEvent(() =>
      [fields.p0, fields.p1, fields.p2, fields.p3].map(numeric),
    ),
    writeEffect = useEffectEvent(writePoints);
  useLayoutEffect(() => {
    const host = svg.current,
      eventSurface = surface.current;
    if (!host || !eventSurface || !cubic) return;
    const dispose = bindCurveHandles(host, range, readPoints, writeEffect, eventSurface);
    handles.current = dispose;
    return () => {
      handles.current = undefined;
      dispose();
    };
  }, [cubic, range]);
  function manual(nextKind: Kind, nextFields: CurveFields) {
    handles.current?.();
    setKind(nextKind);
    setFields(nextFields);
    setCopyStatus("");
    const next = parseCurve(nextKind, nextFields);
    if (next.success) {
      const plot = curvePreview(next.data);
      setRange({ min: plot.min, max: plot.max });
    }
  }
  async function copyCurve() {
    const field = representation.current;
    if (!field) return;
    field.focus();
    field.select();
    if (!navigator.clipboard?.writeText) {
      setCopyStatus("Representação selecionada. Pressione Ctrl/Cmd+C para copiar.");
      return;
    }
    try {
      await navigator.clipboard.writeText(field.value);
      if (live.current) setCopyStatus("Representação copiada.");
    } catch {
      if (live.current)
        setCopyStatus(
          "A plataforma recusou a cópia automática. Pressione Ctrl/Cmd+C para copiar a seleção.",
        );
    }
  }
  return {
    kind,
    fields,
    discrete,
    id,
    easing,
    plot,
    svg,
    surface,
    pointFields,
    representation,
    copyStatus,
    manual,
    writePoints,
    copyCurve,
  };
}
