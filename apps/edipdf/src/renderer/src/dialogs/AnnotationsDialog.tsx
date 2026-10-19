import type { Annot } from "@shared/model";
import { useState } from "react";
import {
  annotationAction,
  annotationBounds,
  copyAnnotations,
  pasteAnnotations,
  selectedAnnotations,
} from "../lib/annotations";
import { type DocState, patchDoc, updateAnnot, useApp } from "../state/store";
import { scrollToPage } from "../viewer/Viewer";
import { Modal } from "./Dialogs";

const labels: Record<Annot["kind"], string> = {
  paragraph: "Caixa de texto",
  text: "Texto",
  rect: "Retângulo",
  ellipse: "Elipse",
  line: "Linha",
  arrow: "Seta",
  ink: "Desenho",
  highlight: "Realce",
  underline: "Sublinhado",
  strike: "Tachado",
  image: "Imagem",
  note: "Comentário",
};
export function AnnotationsDialog({ doc }: { doc: DocState }): React.ReactElement {
  const [query, setQuery] = useState(""),
    [comments, setComments] = useState(false),
    [status, setStatus] = useState("all"),
    [author, setAuthor] = useState(""),
    [pageOnly, setPageOnly] = useState(false),
    [error, setError] = useState("");
  const selected = selectedAnnotations(doc),
    close = () => useApp.setState({ dialog: null });
  const filtered = doc.content.annots.filter(
    (annot) =>
      (!comments || annot.kind === "note") &&
      (!pageOnly || annot.page === doc.content.pages[doc.currentPage].id) &&
      (!query ||
        `${labels[annot.kind]} ${"text" in annot ? annot.text : ""}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase())) &&
      (annot.kind !== "note" ||
        ((status === "all" || !!annot.resolved === (status === "resolved")) &&
          (!author ||
            (annot.author ?? "").toLocaleLowerCase().includes(author.toLocaleLowerCase())))),
  );
  const setSelection = (ids: string[]) =>
    patchDoc(doc.id, { selectedAnnot: ids[0] ?? null, selectedAnnots: ids });
  const disabled = doc.readOnly || !selected.length;
  return (
    <Modal
      title="Anotações e comentários"
      width={900}
      onClose={close}
      footer={
        <>
          <span className="muted small">
            {selected.length} selecionadas · Shift+clique também seleciona na página
          </span>
          <div className="spacer" />
          <button type="button" className="btn ghost" onClick={close}>
            Fechar
          </button>
        </>
      }
    >
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <div className="preferences-grid">
        <label className="local-field">
          Filtrar texto
          <input
            className="input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="local-field">
          Autor do comentário
          <input
            className="input"
            value={author}
            onChange={(event) => setAuthor(event.target.value)}
          />
        </label>
        <label className="local-field">
          Estado dos comentários
          <select
            className="input"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="all">Todos</option>
            <option value="open">Abertos</option>
            <option value="resolved">Resolvidos</option>
          </select>
        </label>
      </div>
      <div className="preferences-actions">
        <label>
          <input
            type="checkbox"
            checked={comments}
            onChange={(event) => setComments(event.target.checked)}
          />{" "}
          Apenas comentários
        </label>
        <label>
          <input
            type="checkbox"
            checked={pageOnly}
            onChange={(event) => setPageOnly(event.target.checked)}
          />{" "}
          Página atual
        </label>
        <button
          type="button"
          className="btn ghost sm"
          onClick={() => setSelection(filtered.map((annot) => annot.id))}
        >
          Selecionar filtradas
        </button>
        <button type="button" className="btn ghost sm" onClick={() => setSelection([])}>
          Limpar seleção
        </button>
      </div>
      <div className="preferences-actions">
        <button
          type="button"
          className="btn ghost sm"
          disabled={!selected.length || doc.canCopy === false}
          onClick={() => void copyAnnotations(doc)}
        >
          Copiar anotações
        </button>
        <button
          type="button"
          className="btn ghost sm"
          disabled={doc.readOnly}
          onClick={() => void pasteAnnotations(doc)}
        >
          Colar na página atual
        </button>
        {(
          [
            ["duplicate", "Duplicar"],
            ["group", "Agrupar"],
            ["ungroup", "Desagrupar"],
            ["lock", "Bloquear"],
            ["unlock", "Desbloquear"],
            ["front", "Trazer à frente"],
            ["back", "Enviar para trás"],
            ["forward", "Avançar uma posição"],
            ["backward", "Recuar uma posição"],
            ["delete", "Excluir selecionadas"],
          ] as const
        ).map(([kind, label]) => (
          <button
            type="button"
            className="btn ghost sm"
            key={kind}
            disabled={disabled}
            onClick={() => annotationAction(doc.id, { kind, ids: selected })}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="preferences-actions">
        {(
          [
            ["left", "Alinhar esquerda"],
            ["center", "Centralizar horizontalmente"],
            ["right", "Alinhar direita"],
            ["top", "Alinhar topo"],
            ["middle", "Centralizar verticalmente"],
            ["bottom", "Alinhar base"],
          ] as const
        ).map(([axis, label]) => (
          <button
            type="button"
            className="btn ghost sm"
            key={axis}
            disabled={disabled || selected.length < 2}
            onClick={() =>
              annotationAction(doc.id, {
                kind: "align",
                axis,
                ids: selected,
                bounds: annotationBounds(
                  doc.content.annots.filter((annot) => selected.includes(annot.id)),
                ),
              })
            }
          >
            {label}
          </button>
        ))}
      </div>
      <ul className="annotation-manager-list">
        {filtered.map((annot) => {
          const page = doc.content.pages.findIndex((page) => page.id === annot.page);
          return (
            <li key={annot.id}>
              <label>
                <input
                  type="checkbox"
                  checked={selected.includes(annot.id)}
                  onChange={(event) =>
                    setSelection(
                      event.target.checked
                        ? [...selected, annot.id]
                        : selected.filter((id) => id !== annot.id),
                    )
                  }
                />{" "}
                {labels[annot.kind]} · p. {page + 1}
                {annot.locked ? " · bloqueada" : ""}
                {annot.group ? " · agrupada" : ""}
              </label>
              {"text" in annot && <p className="note-preview">{annot.text || "Sem texto"}</p>}
              <div className="preferences-actions">
                <button
                  type="button"
                  className="btn ghost sm"
                  onClick={() => {
                    close();
                    scrollToPage(doc.id, page);
                  }}
                >
                  Mostrar página
                </button>
                {annot.kind === "note" && (
                  <>
                    <label>
                      Autor{" "}
                      <input
                        className="input"
                        value={annot.author ?? ""}
                        disabled={doc.readOnly || annot.locked}
                        onChange={(event) =>
                          updateAnnot(
                            doc.id,
                            annot.id,
                            { author: event.target.value },
                            `author:${annot.id}`,
                          )
                        }
                        onBlur={() => patchDoc(doc.id, { historyGroup: null })}
                      />
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={!!annot.resolved}
                        disabled={doc.readOnly || annot.locked}
                        onChange={(event) =>
                          updateAnnot(doc.id, annot.id, { resolved: event.target.checked })
                        }
                      />{" "}
                      Resolvido
                    </label>
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => {
                        close();
                        patchDoc(doc.id, { openNote: annot.id });
                        scrollToPage(doc.id, page);
                      }}
                    >
                      Abrir comentário
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {!filtered.length && <p>Nenhuma anotação corresponde ao filtro.</p>}
      <button
        type="button"
        className="btn ghost sm"
        disabled={doc.canCopy === false}
        onClick={async () => {
          setError("");
          try {
            const path = await window.api.saveDataDialog(
              `${doc.name.replace(/\.pdf$/i, "")}-comentarios.json`,
            );
            if (path)
              await window.api.writeCopy(
                path,
                new TextEncoder().encode(
                  JSON.stringify(
                    {
                      version: 1,
                      document: doc.name,
                      comments: filtered
                        .filter((annot) => annot.kind === "note")
                        .map((annot) => ({
                          ...annot,
                          page: doc.content.pages.findIndex((page) => page.id === annot.page) + 1,
                        })),
                    },
                    null,
                    2,
                  ),
                ),
              );
          } catch (failure) {
            setError(failure instanceof Error ? failure.message : "Falha ao exportar comentários.");
          }
        }}
      >
        Exportar comentários filtrados (JSON)
      </button>
    </Modal>
  );
}
