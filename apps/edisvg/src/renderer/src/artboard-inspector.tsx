import {
  defaultLayoutContainer,
  type LayoutContainer,
  type LayoutDocument,
  type LayoutRootSize,
} from "@informach/edi-motion/layout";
import { type PointerEvent as ReactPointerEvent, useState } from "react";
import { createRoot } from "react-dom/client";
import type { ArtboardCommand } from "../../shared/artboards";
import type { Artboard } from "../../shared/project";
import type { ArtboardView } from "./workspace";

interface Props {
  board: Artboard;
  view: ArtboardView;
  updateView(patch: Partial<ArtboardView>): void;
  execute(
    command:
      | ArtboardCommand
      | { type: "layout"; operation: "replace" | "disable"; value?: LayoutDocument },
  ): void;
}

type SizeMode = LayoutRootSize["width"];

const defaultDocument = (): LayoutDocument => ({
  version: 1,
  root: defaultLayoutContainer(),
  containers: [],
  items: [],
});
let linkedSizePreference = false;
let linkedOriginPreference = false;
let linkedScalePreference = false;
let paddingExpandedPreference = false;

const roundValue = (value: number) => Math.round(value * 100) / 100;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function LinkIcon({ linked }: { linked: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d={
          linked
            ? "M6.5 9.5l3-3M7 4.5l1-1a2.5 2.5 0 013.5 3.5l-1 1M9 11.5l-1 1a2.5 2.5 0 01-3.5-3.5l1-1"
            : "M7 4.5l1-1a2.5 2.5 0 013.5 3.5l-1 1M9 11.5l-1 1a2.5 2.5 0 01-3.5-3.5l1-1M3 3l1.5 1.5M13 13l-1.5-1.5"
        }
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

// Dragging the short label changes the value by 1 per pixel (Shift ×10, Alt ×0.1).
// Window listeners survive the remount that a live preview triggers, and the
// final value goes through the same commit as typing, exactly once.
function startScrub(
  event: ReactPointerEvent<HTMLLabelElement>,
  options: {
    min: number;
    max: number;
    onCommit(input: HTMLInputElement): void;
    preview?(value: number): void;
  },
) {
  const input = event.currentTarget.querySelector("input");
  if (event.button !== 0 || !input || input.disabled) return;
  event.preventDefault();
  const startX = event.clientX,
    start = Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : 0;
  let moved = false,
    latest = start,
    frame = 0;
  const move = (pointer: PointerEvent) => {
    const delta = pointer.clientX - startX;
    if (!moved && Math.abs(delta) < 3) return;
    moved = true;
    document.body.classList.add("artboard-scrubbing");
    const factor = pointer.shiftKey ? 10 : pointer.altKey ? 0.1 : 1;
    latest = clamp(roundValue(start + delta * factor), options.min, options.max);
    input.value = String(latest);
    if (options.preview && !frame)
      frame = requestAnimationFrame(() => {
        frame = 0;
        options.preview?.(latest);
      });
  };
  const end = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    cancelAnimationFrame(frame);
    document.body.classList.remove("artboard-scrubbing");
    if (!moved) return;
    input.value = String(latest);
    options.onCommit(input);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
}

function ArtboardInspector({ board, view, updateView, execute }: Props) {
  const [error, setError] = useState("");
  const [linkedSize, setLinkedSize] = useState(linkedSizePreference);
  const [linkedOrigin, setLinkedOrigin] = useState(linkedOriginPreference);
  const [linkedScale, setLinkedScale] = useState(linkedScalePreference);
  const [paddingExpanded, setPaddingExpanded] = useState(paddingExpandedPreference);
  const [name, setName] = useState(board.name);
  const width = board.scene.viewBox[2];
  const height = board.scene.viewBox[3];
  const root = board.layout?.root;

  const run = (command: Parameters<Props["execute"]>[0]) => {
    try {
      setError("");
      execute(command);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível alterar a prancheta.");
    }
  };
  const updateBoard = (patch: { name?: string; width?: number; height?: number }) => {
    run({
      type: "artboard",
      operation: "update",
      id: board.id,
      name: patch.name ?? board.name,
      width: patch.width ?? width,
      height: patch.height ?? height,
    });
  };
  const updateLayout = (patch: Partial<LayoutContainer>) => {
    const next = structuredClone(board.layout ?? defaultDocument());
    next.root = { ...next.root, ...patch };
    run({ type: "layout", operation: "replace", value: next });
  };
  const updateRootSize = (axis: "width" | "height", mode: SizeMode) => {
    const next = structuredClone(board.layout ?? defaultDocument());
    next.rootSize = { ...(next.rootSize ?? { width: "fill", height: "fill" }), [axis]: mode };
    run({ type: "layout", operation: "replace", value: next });
  };
  const commitSize = (axis: "width" | "height", input: HTMLInputElement) => {
    const value = input.valueAsNumber;
    if (!Number.isFinite(value) || value <= 0 || value > 100000) {
      input.value = String(axis === "width" ? width : height);
      setError("A dimensão deve ser maior que zero e até 100.000 px.");
      return;
    }
    if (value === (axis === "width" ? width : height)) return;
    const ratio = axis === "width" ? height / width : width / height;
    updateBoard(
      axis === "width"
        ? { width: value, ...(linkedSize ? { height: value * ratio } : {}) }
        : { height: value, ...(linkedSize ? { width: value * ratio } : {}) },
    );
  };
  const numberField = (
    label: string,
    value: number,
    onCommit: (input: HTMLInputElement) => void,
    options: {
      min?: number;
      max?: number;
      shortLabel?: string;
      unit?: string;
      derived?: boolean;
      preview?(value: number): void;
    } = {},
  ) => (
    <label
      className={options.derived ? "artboard-value is-derived" : "artboard-value"}
      key={label}
      onPointerDown={(event) => {
        if ((event.target as Element).closest(".artboard-scrub"))
          startScrub(event, {
            min: options.min ?? 0,
            max: options.max ?? 100000,
            onCommit,
            preview: options.preview,
          });
      }}
    >
      <span className="artboard-scrub" title={`${label}: arraste para ajustar`}>
        {options.shortLabel ?? label}
      </span>
      <span className="artboard-value-input">
        <input
          aria-label={label}
          type="number"
          step="any"
          min={options.min ?? 0}
          max={options.max ?? 100000}
          defaultValue={value}
          onBlur={(event) => onCommit(event.currentTarget)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              event.currentTarget.value = String(value);
              event.currentTarget.blur();
            }
          }}
        />
        {options.unit && (
          <span className="artboard-unit" aria-hidden="true">
            {options.unit}
          </span>
        )}
      </span>
    </label>
  );
  const linkButton = (
    subject: string,
    linked: boolean,
    toggle: (next: boolean) => void,
    className = "artboard-link",
  ) => (
    <button
      type="button"
      className={className}
      aria-label={`${linked ? "Desvincular" : "Vincular"} ${subject}`}
      aria-pressed={linked}
      title={`${linked ? "Desvincular" : "Vincular"} ${subject}`}
      onClick={() => toggle(!linked)}
    >
      <LinkIcon linked={linked} />
    </button>
  );
  const padding = root?.padding ?? [0, 0, 0, 0];
  const updatePadding = (index: number, input: HTMLInputElement) => {
    const value = input.valueAsNumber;
    if (!Number.isFinite(value) || value < 0 || value > 100000) {
      input.value = String(padding[index]);
      setError("O espaçamento deve estar entre 0 e 100.000 px.");
      return;
    }
    if (value === padding[index]) return;
    const next: [number, number, number, number] = [...padding] as [number, number, number, number];
    next[index] = value;
    updateLayout({ padding: next });
  };
  const partners: Partial<Record<keyof ArtboardView, keyof ArtboardView>> = {
    ...(linkedOrigin ? { originX: "originY", originY: "originX" } : {}),
    ...(linkedScale ? { scaleX: "scaleY", scaleY: "scaleX" } : {}),
  };
  // `view` is the value at render time; during a scrub it stays the starting
  // point, so the linked axis keeps the proportion it had when the drag began.
  const viewPatch = (key: keyof ArtboardView, value: number, min: number, max: number) => {
    const partner = partners[key];
    if (!partner) return { [key]: value };
    const other =
      view[key] === 0 ? value : clamp(roundValue((value * view[partner]) / view[key]), min, max);
    return { [key]: value, [partner]: other };
  };
  const commitView = (
    key: keyof ArtboardView,
    input: HTMLInputElement,
    minimum: number,
    maximum: number,
  ) => {
    const value = input.valueAsNumber;
    if (!Number.isFinite(value) || value < minimum || value > maximum) {
      input.value = String(view[key]);
      setError(`Valor de ${input.getAttribute("aria-label") ?? key} fora do intervalo permitido.`);
      return;
    }
    if (value !== view[key]) updateView(viewPatch(key, value, minimum, maximum));
  };
  const viewField = (
    label: string,
    shortLabel: string,
    key: keyof ArtboardView,
    min: number,
    max: number,
    unit?: string,
  ) =>
    numberField(label, view[key], (input) => commitView(key, input, min, max), {
      min,
      max,
      shortLabel,
      unit,
      preview: (value) => updateView(viewPatch(key, value, min, max)),
    });

  return (
    <div className="artboard-inspector">
      <div className="panel-heading artboard-inspector-heading">
        <span>Prancheta</span>
        <input
          aria-label="Nome da prancheta"
          maxLength={120}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => {
            const next = name.trim();
            if (!next) {
              setName(board.name);
              return;
            }
            if (next !== board.name) updateBoard({ name: next });
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setName(board.name);
              event.currentTarget.blur();
            }
          }}
        />
      </div>

      <section className="artboard-inspector-section artboard-transform">
        <div className="artboard-transform-row">
          <span>Posição</span>
          <div className="artboard-value-row">
            {viewField("Posição X", "X", "x", -100000, 100000)}
            {viewField("Posição Y", "Y", "y", -100000, 100000)}
          </div>
        </div>
        <div className="artboard-transform-row">
          <span>Origem</span>
          <div className="artboard-value-row">
            {viewField("Origem X (%)", "X", "originX", 0, 100, "%")}
            {viewField("Origem Y (%)", "Y", "originY", 0, 100, "%")}
          </div>
          {linkButton("origem", linkedOrigin, (next) => {
            linkedOriginPreference = next;
            setLinkedOrigin(next);
          })}
        </div>
        <div className="artboard-transform-row">
          <span>Escala</span>
          <div className="artboard-value-row">
            {viewField("Escala X (%)", "X", "scaleX", 1, 1000, "%")}
            {viewField("Escala Y (%)", "Y", "scaleY", 1, 1000, "%")}
          </div>
          {linkButton("escala", linkedScale, (next) => {
            linkedScalePreference = next;
            setLinkedScale(next);
          })}
        </div>
        <div className="artboard-transform-row">
          <span>Rotação</span>
          {viewField("Rotação (°)", "∠", "rotation", -3600, 3600, "°")}
        </div>
        <div className="artboard-transform-row">
          <span>Opacidade</span>
          {viewField("Opacidade (%)", "◐", "opacity", 0, 100, "%")}
        </div>
        <div className="artboard-transform-row">
          <span>Recorte</span>
          <label
            className="artboard-check artboard-clip"
            title={
              root
                ? "Recortar o conteúdo nos limites da prancheta"
                : "Ative o layout dos filhos para recortar o conteúdo"
            }
          >
            <input
              type="checkbox"
              aria-label="Recortar conteúdo"
              disabled={!root}
              checked={root?.clip ?? false}
              onChange={(event) => updateLayout({ clip: event.target.checked })}
            />
          </label>
        </div>
      </section>

      <section className="artboard-inspector-section">
        <div className="artboard-inspector-title">
          <h3>Tamanho</h3>
          {linkButton("proporção", linkedSize, (next) => {
            linkedSizePreference = next;
            setLinkedSize(next);
          })}
        </div>
        <div className="artboard-value-row">
          {numberField("Largura", width, (input) => commitSize("width", input), {
            min: 0.001,
            shortLabel: "W",
            unit: "px",
            derived: board.layout?.rootSize?.width === "hug",
          })}
          {numberField("Altura", height, (input) => commitSize("height", input), {
            min: 0.001,
            shortLabel: "H",
            unit: "px",
            derived: board.layout?.rootSize?.height === "hug",
          })}
        </div>
        <div className="artboard-value-row">
          {(["width", "height"] as const).map((axis) => (
            <label
              className="artboard-size-mode"
              key={axis}
              title={
                root
                  ? undefined
                  : "Ative o layout dos filhos para ajustar ao conteúdo ou preencher o contêiner"
              }
            >
              <span aria-hidden="true">{axis === "width" ? "↔" : "↕"}</span>
              <select
                aria-label={axis === "width" ? "Modo da largura" : "Modo da altura"}
                disabled={!root}
                value={root ? (board.layout?.rootSize?.[axis] ?? "fill") : "fixed"}
                onChange={(event) => updateRootSize(axis, event.target.value as SizeMode)}
              >
                <option value="fixed">Fixo</option>
                <option value="hug">Conteúdo</option>
                <option value="fill">Preencher</option>
              </select>
            </label>
          ))}
        </div>
      </section>

      <section className="artboard-inspector-section">
        <div className="artboard-inspector-title">
          <h3>Layout dos filhos</h3>
          <button
            type="button"
            aria-label={root ? "Desativar layout" : "Ativar layout"}
            title={root ? "Desativar layout" : "Ativar layout"}
            onClick={() =>
              root
                ? run({ type: "layout", operation: "disable" })
                : run({ type: "layout", operation: "replace", value: defaultDocument() })
            }
          >
            {root ? "−" : "+"}
          </button>
        </div>
        {root && (
          <>
            <fieldset className="artboard-segmented" aria-label="Fluxo dos filhos">
              {(["row", "column", "grid"] as const).map((flow) => (
                <button
                  type="button"
                  key={flow}
                  aria-label={
                    { row: "Fluxo horizontal", column: "Fluxo vertical", grid: "Grade" }[flow]
                  }
                  aria-pressed={root.flow === flow}
                  title={{ row: "Horizontal", column: "Vertical", grid: "Grade" }[flow]}
                  onClick={() => updateLayout({ flow })}
                >
                  {{ row: "▥", column: "▤", grid: "▦" }[flow]}
                </button>
              ))}
            </fieldset>
            <div className="artboard-value-row">
              <label className="artboard-select">
                <span>Alinhamento</span>
                <select
                  aria-label="Alinhamento dos filhos"
                  value={root.align}
                  onChange={(event) =>
                    updateLayout({ align: event.target.value as LayoutContainer["align"] })
                  }
                >
                  <option value="start">Início</option>
                  <option value="center">Centro</option>
                  <option value="end">Fim</option>
                  <option value="stretch">Esticar</option>
                </select>
              </label>
              <label className="artboard-select">
                <span>Distribuição</span>
                <select
                  aria-label="Distribuição dos filhos"
                  value={root.justify}
                  onChange={(event) =>
                    updateLayout({ justify: event.target.value as LayoutContainer["justify"] })
                  }
                >
                  <option value="start">Início</option>
                  <option value="center">Centro</option>
                  <option value="end">Fim</option>
                  <option value="space-between">Entre</option>
                  <option value="space-around">Ao redor</option>
                  <option value="space-evenly">Uniforme</option>
                </select>
              </label>
            </div>
            <div className="artboard-value-row">
              {numberField(
                "Espaço horizontal",
                root.gap[0],
                (input) => {
                  const value = input.valueAsNumber;
                  if (Number.isFinite(value) && value >= 0 && value <= 100000)
                    updateLayout({ gap: [value, root.gap[1]] });
                  else {
                    input.value = String(root.gap[0]);
                    setError("Espaço horizontal inválido.");
                  }
                },
                { shortLabel: "↔", unit: "px" },
              )}
              {numberField(
                "Espaço vertical",
                root.gap[1],
                (input) => {
                  const value = input.valueAsNumber;
                  if (Number.isFinite(value) && value >= 0 && value <= 100000)
                    updateLayout({ gap: [root.gap[0], value] });
                  else {
                    input.value = String(root.gap[1]);
                    setError("Espaço vertical inválido.");
                  }
                },
                { shortLabel: "↕", unit: "px" },
              )}
            </div>
            <div className="artboard-value-row">
              <label className="artboard-select">
                <span>Direção</span>
                <select
                  aria-label="Direção dos filhos"
                  value={root.direction}
                  onChange={(event) =>
                    updateLayout({ direction: event.target.value as LayoutContainer["direction"] })
                  }
                >
                  <option value="ltr">Esquerda → direita</option>
                  <option value="rtl">Direita → esquerda</option>
                </select>
              </label>
              {root.flow !== "grid" && (
                <label className="artboard-check">
                  <input
                    type="checkbox"
                    checked={root.wrap}
                    onChange={(event) => updateLayout({ wrap: event.target.checked })}
                  />
                  Quebrar linha
                </label>
              )}
            </div>
            <button
              type="button"
              className="artboard-padding-toggle"
              aria-expanded={paddingExpanded}
              onClick={() => {
                paddingExpandedPreference = !paddingExpanded;
                setPaddingExpanded(paddingExpandedPreference);
              }}
            >
              <span>Padding</span>
              <span>{padding.join(" / ")}</span>
              <span aria-hidden="true">{paddingExpanded ? "⌃" : "⌄"}</span>
            </button>
            {paddingExpanded && (
              <div className="artboard-padding-grid">
                {(["Superior", "Direita", "Inferior", "Esquerda"] as const).map((label, index) =>
                  numberField(label, padding[index] ?? 0, (input) => updatePadding(index, input), {
                    shortLabel: ["↑", "→", "↓", "←"][index],
                    unit: "px",
                  }),
                )}
              </div>
            )}
          </>
        )}
      </section>
      {error && (
        <p className="artboard-inspector-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function mountArtboardInspector(host: Element, props: Props) {
  const root = createRoot(host);
  root.render(<ArtboardInspector {...props} />);
  return () => root.unmount();
}
