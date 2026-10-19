import {
  DEFAULT_SEARCH_OPTIONS,
  findTextMatches,
  type SearchOptions,
} from "@informach/edi-ocr/search";
import type { DocContent } from "@shared/model";
import { ChevronDown, ChevronUp, Loader2, Search, Settings2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { documentText } from "../lib/document-text";
import { finishDraft } from "../lib/editing";
import { isDocumentShortcut } from "../lib/keyboard";
import { type DocState, patchDoc, type SearchState, useApp } from "../state/store";
import { scrollToPage } from "./Viewer";

const runs = new Map<string, AbortController>();
const cancel = (id: string) => {
  runs.get(id)?.abort();
  runs.delete(id);
};
export async function runSearch(
  docId: string,
  query: string,
  options: SearchOptions = DEFAULT_SEARCH_OPTIONS,
  expectedContent?: DocContent,
  navigate = true,
): Promise<void> {
  cancel(docId);
  if (!finishDraft(docId)) {
    patchDoc(docId, {
      search: {
        query,
        options,
        results: [],
        index: 0,
        running: false,
        errors: [
          { page: 0, message: "Corrija o rascunho pendente para pesquisar a revisão completa." },
        ],
      },
    });
    return;
  }
  const doc = useApp.getState().docs.find((d) => d.id === docId);
  if (!doc) return;
  if (expectedContent && doc.content !== expectedContent) return;
  const controller = new AbortController();
  runs.set(docId, controller);
  patchDoc(docId, {
    search: { query, options, results: [], index: 0, running: !!query.trim(), errors: [] },
  });
  if (!query.trim()) {
    runs.delete(docId);
    return;
  }
  const current = () =>
    runs.get(docId) === controller &&
    useApp.getState().docs.find((d) => d.id === docId)?.content === doc.content;
  try {
    const index = await documentText(doc, controller.signal, (page, total) => {
      if (current())
        patchDoc(docId, (d) => ({
          search: d.search && { ...d.search, progress: { page, total } },
        }));
    });
    if (!current()) return;
    const results: SearchState["results"] = [],
      errors: NonNullable<SearchState["errors"]> = [];
    for (const page of index.pages) {
      const reference = doc.content.pages[page.index];
      if (!reference) throw new Error("Página do índice indisponível.");
      if (page.error) {
        errors.push({ page: page.index + 1, message: page.error });
        continue;
      }
      if (page.missingUnicode)
        errors.push({
          page: page.index + 1,
          message: `${page.missingUnicode} caractere(s) sem mapeamento Unicode.`,
        });
      try {
        for (const match of findTextMatches(page.glyphs, query, options))
          results.push({
            id: `${reference.id}:body:${match.start}:${match.end}`,
            page: reference.id,
            rects: match.rects,
            excerpt: match.excerpt,
          });
        if (options.comments)
          for (const note of doc.content.annots)
            if (note.page === reference.id && note.kind === "note") {
              const glyphs = [...note.text].map((text) => ({
                text,
                box: { x: note.x, y: note.y, w: 22, h: 22 },
              }));
              for (const match of findTextMatches(glyphs, query, options))
                results.push({
                  id: `${note.id}:${match.start}:${match.end}`,
                  page: reference.id,
                  rects: match.rects.slice(0, 1),
                  excerpt: match.excerpt,
                  note: note.id,
                });
            }
      } catch (error) {
        errors.push({
          page: page.index + 1,
          message: error instanceof Error ? error.message : "Falha na busca desta página.",
        });
      }
    }
    if (!current()) return;
    patchDoc(docId, (d) => ({
      search: d.search && { ...d.search, results, errors, running: false, progress: undefined },
    }));
    if (results.length && navigate) goTo(docId, 0, false);
  } catch (error) {
    if (!controller.signal.aborted && current())
      patchDoc(docId, (d) => ({
        search: d.search && {
          ...d.search,
          running: false,
          progress: undefined,
          errors: [
            {
              page: 0,
              message: error instanceof Error ? error.message : "Falha ao indexar o documento.",
            },
          ],
        },
      }));
  } finally {
    if (runs.get(docId) === controller) runs.delete(docId);
  }
}

function goTo(docId: string, index: number, openComment = true): void {
  const doc = useApp.getState().docs.find((d) => d.id === docId),
    search = doc?.search;
  if (!doc || !search?.results.length) return;
  const i = ((index % search.results.length) + search.results.length) % search.results.length;
  const result = search.results[i];
  patchDoc(docId, {
    search: { ...search, index: i },
    ...(openComment ? { openNote: result.note ?? null } : {}),
  });
  const page = doc.content.pages.findIndex((p) => p.id === result.page);
  if (page >= 0) scrollToPage(docId, page, result.rects[0]?.y);
}

export function SearchBar({ doc }: { doc: DocState }): React.ReactElement | null {
  const search = doc.search;
  const input = useRef<HTMLInputElement>(null);
  const [expanded, setExpanded] = useState(false);
  const options = search?.options ?? DEFAULT_SEARCH_OPTIONS;
  const query = search?.query ?? "";
  const enabled = !!search;
  const previousQuery = useRef<{ query: string; options: SearchOptions } | null>(null);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
    return () => cancel(doc.id);
  }, [doc.id]);
  useEffect(() => {
    if (!enabled) return;
    const navigate =
      previousQuery.current?.query !== query || previousQuery.current?.options !== options;
    previousQuery.current = { query, options };
    const timer = setTimeout(
      () => void runSearch(doc.id, query, options, doc.content, navigate),
      220,
    );
    return () => clearTimeout(timer);
  }, [doc.id, query, options, doc.content, enabled]);
  if (!search) return null;
  const close = () => {
    cancel(doc.id);
    patchDoc(doc.id, { search: null });
  };
  const setOptions = (next: SearchOptions) => {
    cancel(doc.id);
    patchDoc(doc.id, {
      search: { ...search, options: next, results: [], running: !!query.trim(), errors: [] },
    });
  };
  const count = search.results.length;
  return (
    <div className="document-search" onPointerDown={(event) => event.stopPropagation()}>
      <div className="search-bar">
        <Search size={14} className="muted" aria-hidden="true" />
        <input
          ref={input}
          aria-label="Buscar no documento"
          placeholder="Buscar no documento…"
          autoComplete="off"
          value={query}
          onChange={(event) => {
            cancel(doc.id);
            patchDoc(doc.id, {
              search: {
                ...search,
                query: event.target.value,
                results: [],
                errors: [],
                running: !!event.target.value.trim(),
              },
            });
          }}
          onKeyDown={(event) => {
            if (!isDocumentShortcut(event)) event.stopPropagation();
            if (event.key === "Enter") {
              event.preventDefault();
              goTo(doc.id, search.index + (event.shiftKey ? -1 : 1));
            }
            if (event.key === "Escape") close();
          }}
        />
        <span className="search-count" role="status" aria-live="polite">
          {search.running ? (
            <>
              <Loader2 size={12} className="spin" aria-hidden="true" />{" "}
              {search.progress ? `${search.progress.page}/${search.progress.total}` : "Buscando…"}
            </>
          ) : query.trim() ? (
            count ? (
              `${search.index + 1} de ${count}`
            ) : search.errors?.length ? (
              "Busca incompleta"
            ) : (
              "Nada encontrado"
            )
          ) : (
            ""
          )}
        </span>
        <button
          type="button"
          className="icon-btn sm"
          aria-label="Resultado anterior"
          title="Anterior (Shift+Enter)"
          disabled={!count}
          onClick={() => goTo(doc.id, search.index - 1)}
        >
          <ChevronUp size={15} />
        </button>
        <button
          type="button"
          className="icon-btn sm"
          aria-label="Próximo resultado"
          title="Próximo (Enter)"
          disabled={!count}
          onClick={() => goTo(doc.id, search.index + 1)}
        >
          <ChevronDown size={15} />
        </button>
        <button
          type="button"
          className="icon-btn sm"
          aria-label="Opções e resultados da busca"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          <Settings2 size={15} />
        </button>
        <button
          type="button"
          className="icon-btn sm"
          aria-label="Fechar busca"
          title="Fechar (Esc)"
          onClick={close}
        >
          <X size={15} />
        </button>
      </div>
      {expanded && (
        <div className="search-details">
          <div className="search-options">
            {(["caseSensitive", "accents", "wholeWord", "acrossLines", "comments"] as const).map(
              (key) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={options[key]}
                    onChange={(event) => setOptions({ ...options, [key]: event.target.checked })}
                  />{" "}
                  {
                    {
                      caseSensitive: "Diferenciar maiúsculas",
                      accents: "Diferenciar acentos",
                      wholeWord: "Palavra inteira",
                      acrossLines: "Frases entre linhas",
                      comments: "Incluir comentários",
                    }[key]
                  }
                </label>
              ),
            )}
          </div>
          <ol className="search-results">
            {search.results.map((result, index) => (
              <li key={result.id}>
                <button
                  type="button"
                  className={index === search.index ? "active" : ""}
                  onClick={() => goTo(doc.id, index)}
                >
                  <strong>
                    Página {doc.content.pages.findIndex((page) => page.id === result.page) + 1}
                    {result.note ? " · comentário" : ""}
                  </strong>
                  <span>{result.excerpt}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
      {!!search.errors?.length && (
        <details className="search-errors">
          <summary>Busca incompleta: {search.errors.length} aviso(s)</summary>
          <ul>
            {search.errors.map((error) => (
              <li key={`${error.page}:${error.message}`}>
                {error.page ? `Página ${error.page}: ` : ""}
                {error.message}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
