import {
  ANNOTATION_TEXT,
  type Annotation,
  defaultOutline,
  KIND_LABEL,
  type Outline,
  type OutlineStyle,
  outlineStyle,
  type Tail,
} from "@shared/annotation";
import type { Clip } from "@shared/types";
import { MessageSquareText } from "lucide-react";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { updateAnnotation } from "@/lib/annotations";
import { annotationStyle } from "@/lib/sharedLibrary";
import { registerDraft } from "@/state/project";
import { Slider } from "./ClipVisual";
import { FontPicker } from "./FontPicker";
import { FavoriteStyle, RevealRow } from "./LookSections";
import { ShadowControls } from "./ShadowControls";
import { Swatches } from "./Swatches";

const DEFAULT_FONT: Partial<Record<Annotation["kind"], number>> = {
  card: 96,
  title: 72,
};

const TAILS: [Tail, string][] = [
  ["none", "Sem"],
  ["bottom-left", "↙"],
  ["bottom-right", "↘"],
  ["top-left", "↖"],
  ["top-right", "↗"],
  ["left", "←"],
  ["right", "→"],
];

const ARROW_DIRECTIONS: [number, string][] = [
  [-135, "↖"],
  [-90, "↑"],
  [-45, "↗"],
  [180, "←"],
  [0, "→"],
  [135, "↙"],
  [90, "↓"],
  [45, "↘"],
];

/** Kinds whose main color is the outline itself (the color row edits both). */
const OUTLINE_IS_COLOR = new Set<Annotation["kind"]>(["highlight"]);
const TEXT_KINDS = new Set<Annotation["kind"]>([
  "balloon",
  "note",
  "label",
  "title",
  "step",
  "card",
  "lowerthird",
]);

function Chips<T extends string | number>({
  value,
  options,
  onPick,
}: {
  value: T;
  options: [T, string][];
  onPick: (v: T) => void;
}): ReactNode {
  return (
    <div className="chip-row">
      {options.map(([id, label]) => (
        <button
          type="button"
          key={String(id)}
          className={`chip ${value === id ? "is-active" : ""}`}
          onClick={() => onPick(id)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/**
 * A text field of the annotation, written on blur and also when the section goes away (another
 * clip selected, the panel closed): an unmounted field never gets its blur. While something is
 * typed and not written yet it is a draft of the project (registerDraft), so leaving the
 * project or closing the window writes it first.
 */
function useAnnotationText(
  clipId: string,
  key: "text" | "kicker" | "subtitle",
  saved: string,
): [string, (value: string) => void, () => void] {
  const [value, setValue] = useState(saved);
  const draft = useRef<string | null>(null);
  const forget = useRef<(() => void) | null>(null);
  const savedRef = useRef(saved);
  useLayoutEffect(() => {
    savedRef.current = saved;
    draft.current = null;
    forget.current?.();
    forget.current = null;
    setValue(saved);
  }, [saved]);
  const commit = useRef((): void => {
    const typed = draft.current;
    draft.current = null;
    forget.current?.();
    forget.current = null;
    if (typed !== null && typed !== savedRef.current)
      void updateAnnotation(clipId, { [key]: typed });
  });
  useEffect(() => () => commit.current(), []);
  const change = (next: string): void => {
    draft.current = next;
    forget.current ??= registerDraft(commit.current);
    setValue(next);
  };
  return [value, change, commit.current];
}

/** Editing an annotation redraws its picture; each change is one undo step. */
export function AnnotationSection({ clip }: { clip: Clip }): ReactNode {
  const a = clip.annotation!;
  const set = (c: Partial<Annotation>): void => {
    void updateAnnotation(clip.id, c);
  };
  const [text, setText, saveText] = useAnnotationText(clip.id, "text", a.text ?? "");
  const hasText = TEXT_KINDS.has(a.kind);
  const [kicker, setKicker, saveKicker] = useAnnotationText(clip.id, "kicker", a.kicker ?? "");
  const [subtitle, setSubtitle, saveSubtitle] = useAnnotationText(
    clip.id,
    "subtitle",
    a.subtitle ?? "",
  );
  const fullFrame = a.kind === "card" || (a.kind === "panel" && (a.boxWidth ?? 0) >= 1920);
  const ol = a.outline ?? defaultOutline(a);
  const setOutline = (c: Partial<Outline>): void => {
    set({ outline: { ...ol, ...c } });
  };
  const style = outlineStyle(ol);
  // Turning the outline back on restores a sensible width (the kind's usual one, or 4 px).
  const setStyle = (st: OutlineStyle): void => {
    setOutline(
      st === "none"
        ? { width: 0 }
        : {
            width:
              ol.width > 0 ? ol.width : defaultOutline({ kind: a.kind, color: a.color }).width || 4,
            dash: st === "solid" ? undefined : st,
          },
    );
  };
  const setColor = (color: string): void => {
    set({
      color,
      ...(OUTLINE_IS_COLOR.has(a.kind) && a.outline ? { outline: { ...a.outline, color } } : {}),
    });
  };

  return (
    <>
      <div className="props-section">
        <div className="props-head">
          <h3>
            <MessageSquareText size={13} /> {KIND_LABEL[a.kind]}
          </h3>
          <FavoriteStyle
            target="annotation"
            name={KIND_LABEL[a.kind]}
            kind={a.kind}
            value={() => annotationStyle(a)}
          />
        </div>
        <RevealRow clip={clip} annotation={a} />
        {hasText &&
          (a.kind === "step" ? (
            <input
              className="input"
              value={text}
              maxLength={3}
              onChange={(e) => setText(e.target.value)}
              onBlur={saveText}
            />
          ) : (
            <textarea
              className="input ann-text"
              rows={a.kind === "label" ? 1 : 3}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={saveText}
              onKeyDown={(e) =>
                e.key === "Enter" && e.ctrlKey && (e.currentTarget as HTMLTextAreaElement).blur()
              }
              placeholder="Texto"
              style={a.fontFamily ? { fontFamily: `"${a.fontFamily}"` } : undefined}
            />
          ))}
        {a.kind === "lowerthird" && (
          <input
            className="input"
            placeholder="Linha de baixo"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            onBlur={saveSubtitle}
          />
        )}
        {a.kind === "card" && (
          <>
            <Chips
              value={a.layout ?? "left"}
              options={[
                ["left", "À esquerda"],
                ["center", "Centralizado"],
              ]}
              onPick={(layout) => set({ layout })}
            />
            <input
              className="input"
              placeholder="Linha de cima (curso)"
              value={kicker}
              onChange={(e) => setKicker(e.target.value)}
              onBlur={saveKicker}
            />
            <input
              className="input"
              placeholder="Linha de baixo"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              onBlur={saveSubtitle}
            />
          </>
        )}
        {hasText && (
          <FontPicker value={a.fontFamily} onChange={(fontFamily) => set({ fontFamily })} />
        )}
        {a.kind === "balloon" ? (
          <>
            <span className="field-label">Preenchimento</span>
            <Swatches value={a.fill ?? "#FFFFFF"} onPick={(fill) => fill && set({ fill })} />
          </>
        ) : (
          <>
            <span className="field-label">
              {OUTLINE_IS_COLOR.has(a.kind)
                ? "Cor (contorno)"
                : a.kind === "panel"
                  ? "Cor (preenchimento)"
                  : "Cor"}
            </span>
            <Swatches value={a.color} onPick={(c) => c && setColor(c)} />
          </>
        )}
        {a.kind === "balloon" && (
          <Chips
            value={a.tail ?? "bottom-left"}
            options={TAILS}
            onPick={(tail) => set({ tail, tailPoint: undefined })}
          />
        )}
        {a.kind === "balloon" && (
          <>
            <Chips
              value={a.layout ?? "center"}
              options={[
                ["left", "À esquerda"],
                ["center", "Centralizado"],
              ]}
              onPick={(layout) => set({ layout })}
            />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => set({})}>
              Atualizar desenho do balão
            </button>
          </>
        )}
        {(a.kind === "balloon" || a.kind === "note" || a.kind === "title") && (
          <Slider
            label="Largura"
            value={a.width ?? 420}
            min={160}
            max={1600}
            step={10}
            format={(v) => `${Math.round(v)} px`}
            onCommit={(v) => set({ width: v })}
          />
        )}
        {hasText && a.kind !== "step" && a.kind !== "lowerthird" && (
          <Slider
            label="Letra"
            value={a.fontSize ?? DEFAULT_FONT[a.kind] ?? ANNOTATION_TEXT}
            min={16}
            max={140}
            step={1}
            format={(v) => `${Math.round(v)} px`}
            onCommit={(v) => set({ fontSize: v })}
          />
        )}
      </div>

      {(a.kind === "arrow" || a.kind === "line") && (
        <div className="props-section">
          <h3>{a.kind === "line" ? "Linha" : "Seta"}</h3>
          <span className="field-label">Traço</span>
          <Chips
            value={a.arrowStyle ?? (a.kind === "line" ? "line" : "solid")}
            options={[
              ...(a.kind === "arrow" ? ([["solid", "Grossa"]] as ["solid", string][]) : []),
              ["line", "Contínuo"],
              ["dashed", "Tracejado"],
              ["dotted", "Pontilhado"],
            ]}
            onPick={(arrowStyle) => set({ arrowStyle })}
          />
          <span className="field-label">Pontas</span>
          <Chips
            value={a.heads ?? (a.kind === "line" ? 0 : 1)}
            options={[
              [0, "Nenhuma"],
              [1, "Uma"],
              [2, "Duas"],
            ]}
            onPick={(heads) => set({ heads })}
          />
          <div className="chip-row">
            {ARROW_DIRECTIONS.map(([deg, label]) => (
              <button
                type="button"
                key={deg}
                className={`chip chip-arrow ${Math.round(a.angle ?? 0) === deg ? "is-active" : ""}`}
                onClick={() => set({ angle: deg })}
              >
                {label}
              </button>
            ))}
          </div>
          <Slider
            label="Direção"
            value={a.angle ?? 0}
            min={-180}
            max={180}
            step={5}
            format={(v) => `${Math.round(v)}°`}
            onCommit={(v) => set({ angle: v })}
          />
          <Slider
            label="Comprimento"
            value={a.length ?? 200}
            min={60}
            max={900}
            step={10}
            format={(v) => `${Math.round(v)} px`}
            onCommit={(v) => set({ length: v })}
          />
          <Slider
            label="Curva"
            value={a.curve ?? 0}
            min={-1}
            max={1}
            step={0.05}
            format={(v) => (Math.abs(v) < 0.01 ? "reta" : `${Math.round(v * 100)}%`)}
            onCommit={(v) => set({ curve: v })}
          />
          <Slider
            label="Espessura"
            value={a.thickness ?? 14}
            min={3}
            max={48}
            step={1}
            format={(v) => `${Math.round(v)} px`}
            onCommit={(v) => set({ thickness: v })}
          />
          <Slider
            label="Tamanho da ponta"
            value={a.headSize ?? (a.thickness ?? 14) * 3}
            min={10}
            max={160}
            step={2}
            format={(v) => `${Math.round(v)} px`}
            onCommit={(v) => set({ headSize: v })}
          />
        </div>
      )}

      {(a.kind === "highlight" || (a.kind === "panel" && !fullFrame)) && (
        <div className="props-section">
          <h3>Forma</h3>
          <Chips
            value={a.shape ?? "rounded"}
            options={[
              ["rounded", "Arredondada"],
              ["rect", "Reta"],
              ["ellipse", "Elipse"],
              ["triangle", "Triângulo"],
            ]}
            onPick={(shape) => set({ shape })}
          />
          <Slider
            label="Largura"
            value={a.boxWidth ?? 360}
            min={40}
            max={1800}
            step={10}
            format={(v) => `${Math.round(v)} px`}
            onCommit={(v) => set({ boxWidth: v })}
          />
          <Slider
            label="Altura"
            value={a.boxHeight ?? 200}
            min={40}
            max={1000}
            step={10}
            format={(v) => `${Math.round(v)} px`}
            onCommit={(v) => set({ boxHeight: v })}
          />
          {a.kind === "highlight" && (
            <>
              <span className="field-label">Preenchimento</span>
              <Swatches value={a.fill} none="Sem preenchimento" onPick={(fill) => set({ fill })} />
              {a.fill && (
                <Slider
                  label="Opacidade"
                  value={a.fillOpacity ?? 0.25}
                  min={0.05}
                  max={1}
                  step={0.05}
                  format={(v) => `${Math.round(v * 100)}%`}
                  onCommit={(v) => set({ fillOpacity: v })}
                />
              )}
            </>
          )}
        </div>
      )}

      {!fullFrame && (
        <div className="props-section">
          <h3>Contorno</h3>
          <Chips
            value={style}
            options={[
              ["none", "Sem contorno"],
              ["solid", "Sólido"],
              ["dashed", "Tracejado"],
              ["dotted", "Pontilhado"],
            ]}
            onPick={setStyle}
          />
          {style !== "none" && (
            <>
              {!OUTLINE_IS_COLOR.has(a.kind) && (
                <Swatches value={ol.color} onPick={(c) => c && setOutline({ color: c })} />
              )}
              <Slider
                label="Espessura"
                value={ol.width}
                min={1}
                max={a.kind === "highlight" ? 30 : 20}
                step={1}
                format={(v) => `${Math.round(v)} px`}
                onCommit={(width) => setOutline({ width })}
              />
            </>
          )}
          {style === "none" && a.kind === "highlight" && !a.fill && (
            <p className="props-hint muted">
              Sem contorno e sem preenchimento o destaque fica invisível.
            </p>
          )}
        </div>
      )}

      {!fullFrame && (
        <div className="props-section">
          <h3>Sombra projetada</h3>
          <ShadowControls value={a.shadow} builtIn onChange={(shadow) => set({ shadow })} />
        </div>
      )}
    </>
  );
}
