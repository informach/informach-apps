import type { Annotation } from "@shared/annotation";
import type { Asset, Clip, Project } from "@shared/types";
import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import {
  loadAnnotationFonts,
  type TextField,
  type TextLayout,
  textLayout,
  updateAnnotation,
} from "@/lib/annotations";
import { useApp } from "@/state/app";
import { playback, usePlayback } from "@/state/playback";
import { registerDraft } from "@/state/project";
import { annotationOnStage } from "./annotationOnStage";

type Key = TextField["key"];

/** The text of an annotation is typed on the stage (balloon, note, label, title, step, name bar, card). */
export const typedOnStage = (a: Annotation | undefined): boolean => !!a && TYPED.has(a.kind);
const TYPED = new Set<Annotation["kind"]>([
  "balloon",
  "note",
  "label",
  "title",
  "step",
  "lowerthird",
  "card",
]);

/** The field of the layout under a point of the stage (or the main text). */
function fieldAt(
  fields: TextField[],
  at: { x: number; y: number } | null,
  toStage: (x: number, y: number) => [number, number],
  density: number,
): Key {
  if (!at) return "text";
  let best: { key: Key; d: number } | null = null;
  for (const f of fields) {
    const r = f.box ?? {
      x: f.left,
      y: f.top,
      w: f.width,
      h: f.lineHeight * f.lines,
    };
    const [x, y] = toStage(r.x, r.y);
    const w = r.w * density;
    const h = r.h * density;
    const dx = Math.max(x - at.x, 0, at.x - (x + w));
    const dy = Math.max(y - at.y, 0, at.y - (y + h));
    const d = Math.hypot(dx, dy);
    if (!best || d < best.d) best = { key: f.key, d };
  }
  return best?.key ?? "text";
}

/**
 * A text of an annotation typed right where it is drawn (double click on it in the preview): a
 * field over it with the same letters, size, colors and line breaks as the picture (the same
 * numbers it is drawn with, lib/annotations.ts textLayout), growing as the text grows from the
 * point a redraw keeps still. Of a name bar or a card, the text double-clicked (name, line
 * above, line below). Leaving the field (or Ctrl + Enter; Enter in a one-line text) redraws it,
 * one undo step; Esc leaves it as it was. While open it is a draft of the project, so closing
 * the window or leaving the lesson writes it first.
 */
export function AnnotationTextEditor({
  clip,
  asset,
  project,
  scale,
  at,
  field: asked,
  onClose,
  onHide,
}: {
  clip: Clip;
  asset: Asset;
  project: Project;
  scale: number;
  /** Where it was double-clicked, in stage pixels. */
  at: { x: number; y: number } | null;
  /** The text asked for by name (from the panel), also one not drawn yet (an empty line). */
  field?: Key;
  onClose: () => void;
  /** Hides the picture while the field covers nothing behind its text (titles). */
  onHide: (id: string | null) => void;
}): ReactNode {
  const time = usePlayback((s) => s.time);
  const a = clip.annotation!;
  const frame = project.settings;
  // The fields are measured once the annotation's fonts are there.
  const [ready, setReady] = useState(false);
  const [key, setKey] = useState<Key | null>(null);
  const [value, setValue] = useState("");
  const typed = useRef<{ key: Key; value: string; written: string } | null>(null);
  const cancelled = useRef(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const write = useRef((): void => {
    const t = typed.current;
    if (cancelled.current || !t || t.value === t.written) return;
    t.written = t.value;
    updateAnnotation(clip.id, { [t.key]: t.value }).catch((error: unknown) =>
      useApp.getState().toast(String(error), "error"),
    );
  });
  // Opened once per annotation (the component is keyed by the clip).
  useEffect(() => {
    playback.pause();
    const forget = registerDraft(() => write.current());
    return () => {
      forget();
      write.current();
    };
  }, []);
  const fontFamily = a.fontFamily;
  useEffect(() => {
    let alive = true;
    void loadAnnotationFonts(fontFamily, frame.height).then(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, [fontFamily, frame.height]);

  const on = annotationOnStage(clip, asset, project, scale, time, true);
  // Gone from the screen (the playhead moved away, the track locked or hidden): what was typed stays.
  useEffect(() => {
    if (!on.editable) onClose();
  }, [on.editable, onClose]);

  const saved: TextLayout | null = ready ? textLayout(a, frame.height, frame.width) : null;
  const d = on.density;
  // The picture is its layout with the shadow's margin all around.
  const ex = saved ? (asset.width - saved.width) / 2 : 0;
  const ey = saved ? (asset.height - saved.height) / 2 : 0;
  const fromSaved = (x: number, y: number): [number, number] => [
    on.x + (ex + x) * d,
    on.y + (ey + y) * d,
  ];

  // The field double-clicked, chosen once the layout is known.
  useEffect(() => {
    if (!saved || key) return;
    const chosen = asked ?? fieldAt(saved.fields, at, fromSaved, d);
    const text = a[chosen] ?? "";
    typed.current = { key: chosen, value: text, written: text };
    setKey(chosen);
    setValue(text);
  });
  // Absent for a line not drawn yet (an empty line above or below, asked for by the panel).
  const savedField = saved?.fields.find((f) => f.key === key);
  // Laid out with the text typed so far (an empty line takes its place while it is typed).
  const live =
    saved && key ? textLayout({ ...a, [key]: value || "​" }, frame.height, frame.width) : null;
  const f = live?.fields.find((x) => x.key === key) ?? savedField;
  const hides = !!f && !f.box;
  useEffect(() => {
    if (!key) return;
    field.current?.focus();
    field.current?.select();
  }, [key]);
  useEffect(() => {
    if (!hides) return;
    onHide(clip.id);
    return () => onHide(null);
  }, [hides, onHide, clip.id]);

  if (!on.editable || !saved || !key || !f) return null;
  // A redraw keeps the anchor still: the live layout hangs from where the anchor is now.
  const [ax, ay] = fromSaved(saved.anchor.x, saved.anchor.y);
  const fromLive = (x: number, y: number): [number, number] =>
    live ? [ax + (x - live.anchor.x) * d, ay + (y - live.anchor.y) * d] : fromSaved(x, y);
  // Laid out in picture pixels, as big as the picture is drawn, and shrunk to the screen: the
  // letters measure as the canvas measures them, so the lines break where the picture breaks.
  const place = ([left, top]: [number, number]): CSSProperties => ({
    left,
    top,
    transform: `scale(${d})`,
  });
  const ring = 2 / d;
  const close = (apply: boolean): void => {
    if (!apply) cancelled.current = true;
    onClose();
  };
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: only keeps the stage from taking the clicks meant for the field.
    <div
      className="ann-text-edit"
      onPointerDown={(e) => {
        e.stopPropagation();
        // A click on the box around the text keeps typing.
        if (e.target !== field.current) e.preventDefault();
      }}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {savedField?.box && (
        <span
          className="ann-text-cover"
          style={{
            ...place(fromSaved(savedField.box.x, savedField.box.y)),
            width: savedField.box.w,
            height: savedField.box.h,
            borderRadius: savedField.box.radius,
            background: savedField.box.color,
          }}
        />
      )}
      {f.box && (
        <span
          className="ann-text-cover"
          style={{
            ...place(fromLive(f.box.x, f.box.y)),
            width: f.box.w,
            height: f.box.h,
            borderRadius: f.box.radius,
            background: f.box.color,
            boxShadow: `0 0 0 ${ring}px var(--accent)`,
          }}
        />
      )}
      <textarea
        ref={field}
        className="ann-text-field"
        rows={1}
        value={value}
        maxLength={f.maxLength}
        spellCheck
        aria-label={FIELD_LABEL[key]}
        title={`${f.wrap ? "Ctrl + Enter" : "Enter"} ou clique fora para aplicar. Esc cancela.`}
        style={{
          ...place(fromLive(f.left, f.top)),
          width: f.width + 1,
          height: f.lineHeight * f.lines,
          font: f.font,
          lineHeight: `${f.lineHeight}px`,
          textAlign: f.align,
          color: f.color,
          whiteSpace: f.wrap ? "pre-wrap" : "pre",
          ...(f.uppercase ? { textTransform: "uppercase" } : {}),
          ...(f.stroke
            ? {
                WebkitTextStroke: `${f.stroke.width}px ${f.stroke.color}`,
                paintOrder: "stroke fill",
              }
            : {}),
          ...(f.box ? {} : { outline: `${ring}px dashed var(--accent)`, outlineOffset: 8 / d }),
        }}
        onChange={(e) => {
          const next = e.target.value;
          if (typed.current) typed.current.value = next;
          setValue(next);
        }}
        // Switching to another window keeps the field open (the focus comes back to it).
        onBlur={() => document.hasFocus() && close(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            close(false);
          } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey || !f.wrap)) {
            e.preventDefault();
            close(true);
          }
        }}
      />
    </div>
  );
}

const FIELD_LABEL: Record<Key, string> = {
  text: "Texto da anotação",
  kicker: "Linha de cima",
  subtitle: "Linha de baixo",
};
