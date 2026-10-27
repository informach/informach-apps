import {
  defaultLayoutContainer,
  type LayoutContainer,
  type LayoutDocument,
} from "@informach/edi-motion/layout";
import { useState } from "react";
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

const defaultDocument = (): LayoutDocument => ({
  version: 1,
  root: defaultLayoutContainer(),
  containers: [],
  items: [],
});
let linkedSizePreference = false;
let paddingExpandedPreference = false;

function ArtboardInspector({ board, view, updateView, execute }: Props) {
  const [error, setError] = useState("");
  const [linkedSize, setLinkedSize] = useState(linkedSizePreference);
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
    options: { min?: number; max?: number; shortLabel?: string } = {},
  ) => (
    <label className="artboard-value" key={label}>
      <span title={label}>{options.shortLabel ?? label}</span>
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
    </label>
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
    if (value !== view[key]) updateView({ [key]: value });
  };
  const viewField = (
    label: string,
    shortLabel: string,
    key: keyof ArtboardView,
    min: number,
    max: number,
  ) =>
    numberField(label, view[key], (input) => commitView(key, input, min, max), {
      min,
      max,
      shortLabel,
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
            {viewField("Origem X (%)", "X %", "originX", 0, 100)}
            {viewField("Origem Y (%)", "Y %", "originY", 0, 100)}
          </div>
        </div>
        <div className="artboard-transform-row">
          <span>Escala</span>
          <div className="artboard-value-row">
            {viewField("Escala X (%)", "X %", "scaleX", 1, 1000)}
            {viewField("Escala Y (%)", "Y %", "scaleY", 1, 1000)}
          </div>
        </div>
        <div className="artboard-transform-row">
          <span>Rotação</span>
          {viewField("Rotação (°)", "°", "rotation", -3600, 3600)}
        </div>
        <div className="artboard-transform-row">
          <span>Opacidade</span>
          {viewField("Opacidade (%)", "%", "opacity", 0, 100)}
        </div>
      </section>

      <section className="artboard-inspector-section">
        <div className="artboard-inspector-title">
          <h3>Tamanho</h3>
          <button
            type="button"
            aria-label={linkedSize ? "Desvincular proporção" : "Vincular proporção"}
            aria-pressed={linkedSize}
            title={linkedSize ? "Desvincular proporção" : "Vincular proporção"}
            onClick={() => {
              linkedSizePreference = !linkedSize;
              setLinkedSize(linkedSizePreference);
            }}
          >
            {linkedSize ? "↔" : "⛓"}
          </button>
        </div>
        <div className="artboard-value-row">
          {numberField("Largura", width, (input) => commitSize("width", input), {
            min: 0.001,
            shortLabel: "W",
          })}
          {numberField("Altura", height, (input) => commitSize("height", input), {
            min: 0.001,
            shortLabel: "H",
          })}
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
                { shortLabel: "Horizontal" },
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
                { shortLabel: "Vertical" },
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
                    shortLabel: ["Topo", "Direita", "Base", "Esquerda"][index],
                  }),
                )}
              </div>
            )}
          </>
        )}
      </section>
      {root && (
        <section className="artboard-inspector-section artboard-clip-section">
          <label className="artboard-check">
            <span>Recortar conteúdo</span>
            <input
              type="checkbox"
              checked={root.clip}
              onChange={(event) => updateLayout({ clip: event.target.checked })}
            />
          </label>
        </section>
      )}
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
