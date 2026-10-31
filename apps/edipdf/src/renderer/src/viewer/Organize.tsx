import { parsePageRange } from "@shared/page-ranges";
import {
  Copy,
  FilePlus2,
  FileUp,
  ImageDown,
  Minus,
  Plus,
  RotateCcw,
  RotateCw,
  Scissors,
  SplitSquareHorizontal,
  Trash2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  deletePages,
  duplicatePages,
  extractPages,
  insertBlank,
  insertFromFiles,
  rotatePages,
} from "../lib/actions";
import { commit, type DocState, patchDoc, useApp } from "../state/store";
import { pageSizeAt, ThumbGrid } from "./ThumbGrid";

const MIN_SIZE = 80,
  MAX_SIZE = 1600,
  SIZE_STEP = 1.25;

/** Widest thumbnail that still fits one per row: the grid's side padding plus the thumb's own. */
const widest = (grid: HTMLElement) => Math.max(MIN_SIZE, Math.min(MAX_SIZE, grid.clientWidth - 76));
const clampSize = (value: number, max: number) =>
  Math.round(Math.max(MIN_SIZE, Math.min(max, value)));

/** Full-window page grid: the "Organizar páginas" tool. */
export function Organize({ doc }: { doc: DocState }): React.ReactElement {
  const [size, setSize] = useState(170);
  const [fits, setFits] = useState(MAX_SIZE);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rootRef.current,
      grid = el?.querySelector<HTMLElement>(".thumbs");
    if (!el || !grid) return;
    const observer = new ResizeObserver(() => setFits(widest(grid)));
    observer.observe(grid);
    // The page under the cursor when a Ctrl+wheel gesture starts. Reflowing moves it to another
    // column, so it stays the anchor for the whole gesture and only its height is kept in place.
    let gesture: { thumb: HTMLElement; ratio: number; last: number } | null = null;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      if (!gesture?.thumb.isConnected || event.timeStamp - gesture.last > 400) {
        const thumb =
          event.target instanceof Element ? event.target.closest<HTMLElement>(".thumb") : null;
        const bounds = thumb?.getBoundingClientRect();
        gesture =
          thumb && bounds
            ? { thumb, ratio: (event.clientY - bounds.top) / bounds.height, last: 0 }
            : null;
      }
      // Rendered synchronously so the anchored page can be put back under the cursor.
      flushSync(() =>
        setSize((current) =>
          clampSize(Math.min(current, widest(grid)) * 1.0015 ** -event.deltaY, widest(grid)),
        ),
      );
      if (!gesture) return;
      gesture.last = event.timeStamp;
      const bounds = gesture.thumb.getBoundingClientRect();
      grid.scrollTop += bounds.top + gesture.ratio * bounds.height - event.clientY;
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => {
      observer.disconnect();
      el.removeEventListener("wheel", wheel);
    };
  }, []);
  // A narrower window shrinks the thumbnails instead of scrolling sideways.
  const width = Math.min(size, fits);
  const [range, setRange] = useState("");
  const [error, setError] = useState("");
  const ids = doc.selection;
  const n = ids.length;
  const lastSel = n
    ? Math.max(...ids.map((id) => doc.content.pages.findIndex((p) => p.id === id)))
    : doc.content.pages.length - 1;
  const allSelected = n === doc.content.pages.length;
  return (
    <div className="organize" ref={rootRef}>
      <div className="organize-bar">
        <span className="organize-count">
          {n
            ? `${n} de ${doc.content.pages.length} ${doc.content.pages.length === 1 ? "página selecionada" : "páginas selecionadas"}`
            : `${doc.content.pages.length} ${doc.content.pages.length === 1 ? "página" : "páginas"}`}
        </span>
        <button
          type="button"
          className="btn ghost sm"
          onClick={() =>
            patchDoc(doc.id, { selection: allSelected ? [] : doc.content.pages.map((p) => p.id) })
          }
        >
          {allSelected ? "Limpar seleção" : "Selecionar tudo"}
        </button>
        <div className="bar-sep" />
        <button
          type="button"
          className="btn ghost sm"
          disabled={!n}
          onClick={() => rotatePages(doc.id, ids, -90)}
          title="Girar à esquerda"
        >
          <RotateCcw size={15} />
        </button>
        <button
          type="button"
          className="btn ghost sm"
          disabled={!n}
          onClick={() => rotatePages(doc.id, ids, 90)}
          title="Girar à direita"
        >
          <RotateCw size={15} />
        </button>
        <button
          type="button"
          className="btn ghost sm"
          disabled={!n}
          onClick={() => deletePages(doc.id, ids)}
          title="Excluir"
        >
          <Trash2 size={15} />
        </button>
        <div className="bar-sep" />
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => insertBlank(doc.id, lastSel + 1, pageSizeAt(doc, lastSel))}
        >
          <FilePlus2 size={15} /> Página em branco
        </button>
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => void insertFromFiles(doc.id, lastSel + 1)}
        >
          <FileUp size={15} /> Inserir de arquivo
        </button>
        <button
          type="button"
          className="btn ghost sm"
          disabled={!n}
          onClick={() => duplicatePages(doc.id, ids)}
        >
          <Copy size={15} /> Duplicar
        </button>
        <button
          type="button"
          className="btn ghost sm"
          disabled={!n}
          onClick={() => extractPages(doc.id, ids)}
        >
          <Scissors size={15} /> Extrair
        </button>
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => useApp.setState({ dialog: { kind: "split" } })}
        >
          <SplitSquareHorizontal size={15} /> Dividir
        </button>
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => useApp.setState({ dialog: { kind: "exportImages" } })}
        >
          <ImageDown size={15} /> Exportar imagens
        </button>
        <div className="spacer" />
        <button
          type="button"
          className="icon-btn"
          title="Miniaturas menores (Ctrl+roda do mouse)"
          disabled={width <= MIN_SIZE}
          onClick={() => setSize(clampSize(width / SIZE_STEP, fits))}
        >
          <Minus size={15} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Miniaturas maiores (Ctrl+roda do mouse)"
          disabled={width >= fits}
          onClick={() => setSize(clampSize(width * SIZE_STEP, fits))}
        >
          <Plus size={15} />
        </button>
        <button
          type="button"
          className="btn primary sm"
          onClick={() => patchDoc(doc.id, { view: "pages" })}
        >
          Concluir
        </button>
      </div>
      <form
        className="page-range-bar"
        onSubmit={(event) => {
          event.preventDefault();
          try {
            patchDoc(doc.id, {
              selection: parsePageRange(range, doc.content.pages.length).map(
                (index) => doc.content.pages[index].id,
              ),
            });
            setError("");
          } catch (failure) {
            setError(failure instanceof Error ? failure.message : "Intervalo inválido.");
          }
        }}
      >
        <label htmlFor="page-selection-range">Selecionar páginas</label>
        <input
          id="page-selection-range"
          className="input"
          autoComplete="off"
          placeholder="1-3, 7, 10-12; pares; ímpares…"
          value={range}
          onChange={(event) => setRange(event.target.value)}
        />
        <button type="submit" className="btn ghost sm">
          Selecionar intervalo
        </button>
        <button
          type="button"
          className="btn ghost sm"
          onClick={() =>
            patchDoc(doc.id, {
              selection: doc.content.pages
                .filter((page) => !ids.includes(page.id))
                .map((page) => page.id),
            })
          }
        >
          Inverter seleção
        </button>
        <button
          type="button"
          className="btn ghost sm"
          disabled={doc.content.pages.length < 2}
          onClick={() =>
            commit(doc.id, (content) => ({ ...content, pages: [...content.pages].reverse() }))
          }
        >
          Inverter ordem
        </button>
        {error && (
          <span className="error-text" role="alert">
            {error}
          </span>
        )}
      </form>
      <p className="organize-hint">
        Arraste para reordenar · Ctrl/Shift+clique para selecionar várias · Ctrl+roda do mouse para
        ampliar · solte PDFs ou imagens aqui para inserir · botão direito para mais opções
      </p>
      <ThumbGrid doc={doc} layout="grid" width={width} />
    </div>
  );
}
