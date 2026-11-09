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
import {
  BOARD_COLORS,
  BOARD_KINDS,
  boardAt,
  type Drawing,
  type DrawingTool,
  strokesIn,
  withBoardColor,
  withoutStroke,
} from "@shared/drawing";
import { plural } from "@shared/plural";
import { clipEnd } from "@shared/timeline";
import type { Clip } from "@shared/types";
import { MessageSquareText, PenLine, Type, X } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { updateAnnotation } from "@/lib/annotations";
import { changeDrawing } from "@/lib/drawing";
import { annotationStyle } from "@/lib/sharedLibrary";
import { useApp } from "@/state/app";
import { playback, usePlayback } from "@/state/playback";
import { useProject } from "@/state/project";
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
 * A drawing made on the screen during the take: its strokes appear as they were drawn. It is a
 * clip like any other (cut, move, hide its track); its colors are the ones it was drawn with.
 */
export function DrawingSection({ clip }: { clip: Clip }): ReactNode {
  const toast = useApp((x) => x.toast);
  const [busy, setBusy] = useState(false);
  const a = clip.annotation;
  // The drawing is kept once, on the media of its video.
  const drawing = useProject((s) => s.project?.assets.find((x) => x.id === clip.assetId)?.drawing);
  if (!a || !drawing) return null;
  const board = a.kind === "board";
  // The strokes this clip shows (its stretch of the drawing's video), in the order they were
  // made: the ones a wipe, a new page or the board's edges took away before it are not here.
  const from = clip.in;
  const to = clip.in + clip.duration * (clip.speed ?? 1);
  const shown = strokesIn(drawing, from, to).map((index) => ({ s: drawing.strokes[index], index }));
  const change = (fn: (d: Drawing) => Drawing): void => {
    setBusy(true);
    void changeDrawing(clip.assetId, fn)
      .catch((error: unknown) =>
        toast(
          `O desenho não mudou: ${error instanceof Error ? error.message : String(error)}`,
          "error",
        ),
      )
      .finally(() => setBusy(false));
  };
  const at = from + 1e-3;
  const current = boardAt(drawing, at)?.color ?? a.color;
  return (
    <div className="props-section">
      <h3>
        <PenLine size={13} /> {KIND_LABEL[a.kind]}
      </h3>
      <p className="props-hint muted">
        {board
          ? "O quadro posto sobre a tela durante a gravação, com os traços feitos nele. Corte, apare ou apague o clipe como qualquer outro."
          : `${plural(drawing.strokes.length, "traço feito", "traços feitos")} na tela durante a gravação. Cada traço aparece do jeito que foi desenhado, no mesmo ponto da tela. Corte, mova ou apague o clipe como qualquer outro.`}
      </p>
      {board && (
        <>
          <span className="field-label">Cor do quadro</span>
          <div className="chip-row">
            {BOARD_KINDS.map((kind) => (
              <button
                type="button"
                key={kind}
                disabled={busy}
                className={`chip ${current.toUpperCase() === BOARD_COLORS[kind].toUpperCase() ? "is-active" : ""}`}
                onClick={() => change((d) => withBoardColor(d, at, BOARD_COLORS[kind]))}
              >
                {kind === "white" ? "Branco" : "Negro"}
              </button>
            ))}
          </div>
          <Swatches
            value={current}
            onPick={(hex) => hex && change((d) => withBoardColor(d, at, hex.slice(0, 7)))}
          />
        </>
      )}
      {shown.length > 0 && (
        <>
          <span className="field-label">
            {plural(shown.length, "traço neste clipe", "traços neste clipe")}
          </span>
          <ul className="drawing-strokes">
            {shown.map(({ s, index }, n) => (
              <li key={`${index}-${s.t}`}>
                <span className="drawing-stroke-dot" style={{ background: s.color }} />
                <span>
                  {STROKE_LABEL[s.tool ?? "pen"]} {n + 1}
                </span>
                <span className="muted mono">{(s.t - from).toFixed(1)} s</span>
                <button
                  type="button"
                  className="icon-btn"
                  title="Apagar este traço"
                  disabled={busy}
                  onClick={() => change((d) => withoutStroke(d, index))}
                >
                  <X size={12} />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

const STROKE_LABEL: Record<DrawingTool, string> = {
  pen: "Traço",
  marker: "Marca-texto",
  arrow: "Seta",
};

/** The texts of each kind, as the buttons that open them on the preview name them. */
const TYPED_TEXTS: Partial<Record<Annotation["kind"], [TextKey, string][]>> = {
  lowerthird: [
    ["text", "Nome"],
    ["subtitle", "Linha de baixo"],
  ],
  card: [
    ["kicker", "Linha de cima"],
    ["text", "Título"],
    ["subtitle", "Linha de baixo"],
  ],
};
type TextKey = "text" | "kicker" | "subtitle";

/**
 * The text is typed on the preview, over the annotation (editor/AnnotationTextEditor.tsx), not
 * here: these buttons open it there, bringing the playhead into the clip when it is elsewhere.
 */
function TypedTexts({ clip }: { clip: Clip }): ReactNode {
  const a = clip.annotation!;
  const track = useProject((s) => s.project?.tracks.find((t) => t.id === clip.trackId));
  const blocked = track?.locked
    ? "A faixa está travada."
    : track?.hidden
      ? "A faixa está oculta."
      : "";
  const open = (key: TextKey): void => {
    // The playhead where the annotation is all there: past its entrance, before its exit.
    const t = usePlayback.getState().time;
    const from = clip.start + (clip.fadeIn ?? 0) + 0.05;
    const to = clipEnd(clip) - (clip.fadeOut ?? 0) - 0.05;
    const shown = from <= to ? Math.max(from, Math.min(to, t)) : clip.start + clip.duration / 2;
    if (Math.abs(shown - t) > 1e-3) playback.seek(shown);
    useApp.getState().set({ textEdit: { id: clip.id, at: null, key } });
  };
  const texts = TYPED_TEXTS[a.kind] ?? [["text", "Editar texto"] as [TextKey, string]];
  return (
    <>
      <p className="props-hint muted">
        {blocked ||
          "Clique duas vezes no texto, na prévia, para escrever direto nele (Esc cancela)."}
      </p>
      <div className="chip-row">
        {texts.map(([key, label]) => (
          <button
            type="button"
            key={key}
            className="chip"
            disabled={!!blocked}
            title={(key === "text" ? a.text : a[key]) || "Ainda vazio"}
            onClick={() => open(key)}
          >
            <Type size={12} /> {label}
          </button>
        ))}
      </div>
    </>
  );
}

/** Editing an annotation redraws its picture; each change is one undo step. */
export function AnnotationSection({ clip }: { clip: Clip }): ReactNode {
  const a = clip.annotation!;
  const set = (c: Partial<Annotation>): void => {
    void updateAnnotation(clip.id, c);
  };
  const hasText = TEXT_KINDS.has(a.kind);
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
        {hasText && <TypedTexts clip={clip} />}
        {a.kind === "card" && (
          <Chips
            value={a.layout ?? "left"}
            options={[
              ["left", "À esquerda"],
              ["center", "Centralizado"],
            ]}
            onPick={(layout) => set({ layout })}
          />
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
