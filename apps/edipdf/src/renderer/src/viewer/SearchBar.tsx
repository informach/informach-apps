import { ChevronDown, ChevronUp, Loader2, Search, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { findInPage } from "../lib/pdf";
import { type DocState, patchDoc, type SearchState, useApp } from "../state/store";
import { scrollToPage } from "./Viewer";

const runs = new Map<string, symbol>();

/** Searches every page in order, publishing results as they come in. */
export async function runSearch(docId: string, query: string): Promise<void> {
  const id = Symbol();
  runs.set(docId, id);
  const doc = useApp.getState().docs.find((d) => d.id === docId);
  if (!doc) return;
  const base: SearchState = { query, results: [], index: 0, running: !!query.trim() };
  patchDoc(docId, { search: base });
  if (!query.trim()) return;
  const results: SearchState["results"] = [];
  for (let i = 0; i < doc.content.pages.length; i++) {
    const page = doc.content.pages[i];
    const found = await findInPage(page, query).catch(() => []);
    if (id !== runs.get(docId) || !useApp.getState().docs.find((d) => d.id === docId)?.search)
      return;
    for (const rects of found) results.push({ page: page.id, rects });
    if (found.length) {
      patchDoc(docId, (d) => ({ search: d.search && { ...d.search, results: [...results] } }));
      if (results.length === found.length) goTo(docId, 0);
    }
  }
  patchDoc(docId, (d) => ({ search: d.search && { ...d.search, results, running: false } }));
  runs.delete(docId);
}

function goTo(docId: string, index: number): void {
  const doc = useApp.getState().docs.find((d) => d.id === docId);
  const s = doc?.search;
  if (!doc || !s || !s.results.length) return;
  const i = ((index % s.results.length) + s.results.length) % s.results.length;
  const r = s.results[i];
  patchDoc(docId, { search: { ...s, index: i } });
  const pageIndex = doc.content.pages.findIndex((p) => p.id === r.page);
  if (pageIndex >= 0) scrollToPage(docId, pageIndex, r.rects[0]?.y);
}

export function SearchBar({ doc }: { doc: DocState }): React.ReactElement {
  const s = doc.search!;
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
    return () => clearTimeout(timer.current);
  }, []);
  const close = (): void => {
    clearTimeout(timer.current);
    runs.delete(doc.id);
    patchDoc(doc.id, { search: null });
  };
  const count = s.results.length;
  return (
    <div className="search-bar" onPointerDown={(e) => e.stopPropagation()}>
      <Search size={14} className="muted" />
      <input
        ref={input}
        defaultValue={s.query}
        placeholder="Buscar no documento"
        onChange={(e) => {
          const q = e.target.value;
          clearTimeout(timer.current);
          timer.current = setTimeout(() => void runSearch(doc.id, q), 220);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") goTo(doc.id, s.index + (e.shiftKey ? -1 : 1));
          if (e.key === "Escape") close();
        }}
      />
      <span className="search-count">
        {s.running && <Loader2 size={12} className="spin" />}
        {s.query.trim()
          ? count
            ? `${s.index + 1} de ${count}`
            : s.running
              ? ""
              : "Nada encontrado"
          : ""}
      </span>
      <button
        type="button"
        className="icon-btn sm"
        title="Anterior (Shift+Enter)"
        disabled={!count}
        onClick={() => goTo(doc.id, s.index - 1)}
      >
        <ChevronUp size={15} />
      </button>
      <button
        type="button"
        className="icon-btn sm"
        title="Próximo (Enter)"
        disabled={!count}
        onClick={() => goTo(doc.id, s.index + 1)}
      >
        <ChevronDown size={15} />
      </button>
      <button type="button" className="icon-btn sm" title="Fechar (Esc)" onClick={close}>
        <X size={15} />
      </button>
    </div>
  );
}
