import { withRenderKeys } from "@informach/edi-desktop/renderer";
import type { PdfInspection } from "@shared/engine-contracts";
import type { DocContent } from "@shared/model";
import {
  findRedactions,
  type RedactionMatch,
  type RedactionQuery,
  selectedRedactionOperations,
} from "@shared/search-redaction";
import { useEffect, useRef, useState } from "react";
import { buildDoc } from "../lib/document-output";
import { finishDraft } from "../lib/editing";
import { runEngine } from "../lib/local-engine";
import { loadSource, releaseSource, renderToDataUrl } from "../lib/pdf";
import { replaceDocumentBytes } from "../lib/structural-edit";
import { type DocState, toast, useApp } from "../state/store";
import { Modal } from "./Dialogs";

interface Prepared {
  bytes: Uint8Array;
  content: DocContent;
  inspection: PdfInspection;
  matches: RedactionMatch[];
  source: string;
}
export function SearchRedactionDialog({ doc }: { doc: DocState }): React.ReactElement {
  const [query, setQuery] = useState<RedactionQuery>({
      text: "",
      caseSensitive: false,
      accents: false,
      wholeWord: true,
    }),
    [prepared, setPrepared] = useState<Prepared | null>(null),
    [selected, setSelected] = useState<string[]>([]),
    [active, setActive] = useState<string | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [running, setRunning] = useState(false),
    [error, setError] = useState(""),
    [preview, setPreview] = useState<{ page: number; url: string } | null>(null);
  const abort = useRef<AbortController | null>(null),
    source = useRef<string | null>(null);
  useEffect(
    () => () => {
      abort.current?.abort();
      if (source.current) releaseSource(source.current);
    },
    [],
  );
  const match = prepared?.matches.find((item) => item.id === active),
    page = match ? prepared?.inspection.pages.find((item) => item.index === match.page) : undefined;
  useEffect(() => {
    setPreview(null);
    if (!prepared || !match) return;
    const controller = new AbortController();
    void renderToDataUrl(
      { id: "redaction-preview", src: prepared.source, index: match.page, rotation: 0 },
      700,
      "image/png",
      1,
      controller.signal,
    )
      .then((url) => {
        if (!controller.signal.aborted) setPreview({ page: match.page, url });
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setError(failure instanceof Error ? failure.message : "Falha na prévia.");
      });
    return () => controller.abort();
  }, [prepared, match]);
  const invalidate = (patch: Partial<RedactionQuery>) => {
    setQuery((previous) => ({ ...previous, ...patch }));
    setPrepared(null);
    setSelected([]);
    setConfirmed(false);
    setError("");
  };
  const close = () => {
    abort.current?.abort();
    useApp.setState({ dialog: null });
  };
  const search = async () => {
    const controller = new AbortController();
    abort.current = controller;
    setRunning(true);
    setError("");
    setPrepared(null);
    setSelected([]);
    setConfirmed(false);
    let created: string | undefined;
    try {
      if (!finishDraft(doc.id))
        throw new Error("Corrija ou descarte o rascunho antes de pesquisar.");
      const current = useApp.getState().docs.find((item) => item.id === doc.id);
      if (!current || current.readOnly) throw new Error("Documento indisponível para remoção.");
      if (current.content.pages.length > 100)
        throw new Error("Este perfil aceita até cem páginas por documento.");
      const bytes = await buildDoc(current, current.content, controller.signal);
      if (bytes.length > 64 * 1024 * 1024)
        throw new Error("Este perfil aceita até 64 MB por revisão.");
      const inspection = await runEngine({ kind: "inspect", bytes }, controller.signal),
        text = await runEngine(
          { kind: "text", bytes, includeAnnotations: true },
          controller.signal,
        ),
        matches = findRedactions(inspection, text, query),
        previewSource = await loadSource(bytes, "Revisão de remoção", () => Promise.resolve(null), {
          output: true,
        });
      created = previewSource.id;
      controller.signal.throwIfAborted();
      if (useApp.getState().docs.find((item) => item.id === doc.id)?.content !== current.content)
        throw new Error("O documento mudou. Pesquise novamente antes de remover.");
      if (source.current) releaseSource(source.current);
      source.current = created;
      created = undefined;
      setPrepared({
        bytes,
        content: current.content,
        inspection,
        matches,
        source: previewSource.id,
      });
      setActive(matches[0]?.id ?? null);
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(failure instanceof Error ? failure.message : "Falha na busca.");
    } finally {
      if (created) releaseSource(created);
      if (!controller.signal.aborted) setRunning(false);
    }
  };
  const apply = async () => {
    if (!prepared || !confirmed || !selected.length || running) return;
    const controller = new AbortController();
    abort.current = controller;
    setRunning(true);
    setError("");
    try {
      const current = useApp.getState().docs.find((item) => item.id === doc.id);
      if (!current || current.readOnly || current.content !== prepared.content)
        throw new Error("O documento mudou. Pesquise novamente.");
      if (prepared.inspection.signatures > 0) {
        const answer = await window.api.message({
          type: "warning",
          title: "Documento com assinatura existente",
          message: "A remoção pode invalidar assinaturas. O EdiPDF não verifica certificados.",
          buttons: ["Continuar na cópia", "Cancelar"],
        });
        controller.signal.throwIfAborted();
        if (answer !== 0) return;
      }
      const result = await runEngine(
        {
          kind: "transform",
          bytes: prepared.bytes,
          operations: selectedRedactionOperations(prepared.inspection, prepared.matches, selected),
        },
        controller.signal,
      );
      await replaceDocumentBytes(doc.id, prepared.content, result, {
        requireCopy: true,
        signal: controller.signal,
      });
      toast(
        "Conteúdo removido da revisão. Revise e salve uma cópia; desfazer conserva a revisão anterior.",
      );
      close();
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(failure instanceof Error ? failure.message : "Remoção não aplicada.");
    } finally {
      if (!controller.signal.aborted) setRunning(false);
    }
  };
  const width = page
      ? page.rotation % 180
        ? page.crop.top - page.crop.bottom
        : page.crop.right - page.crop.left
      : 1,
    height = page
      ? page.rotation % 180
        ? page.crop.right - page.crop.left
        : page.crop.top - page.crop.bottom
      : 1;
  return (
    <Modal
      title="Remover conteúdo por busca"
      width={1000}
      onClose={close}
      allowCancelWhileBusy
      footer={
        <>
          <button type="button" className="btn ghost" onClick={close}>
            {running ? "Cancelar operação" : "Fechar"}
          </button>
          <div className="spacer" />
          <button
            type="button"
            className="btn primary"
            disabled={running || !prepared || !selected.length || !confirmed}
            onClick={() => void apply()}
          >
            Remover ocorrências selecionadas
          </button>
        </>
      }
    >
      <p>
        Pesquise texto, confira as áreas e escolha as ocorrências. A remoção também atinge
        imagens/desenhos sobrepostos, sanitiza dados ocultos e torna os formulários estáticos.
        Anotações sobrepostas são removidas por inteiro. Originais, histórico e cópias anteriores
        continuam existindo. O salvamento exigirá uma cópia.
      </p>
      <fieldset disabled={running} style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="sr-only">Pesquisar para remover</legend>
        <label className="form-row">
          Texto a remover
          <input
            className="input"
            aria-label="Texto a remover"
            maxLength={500}
            value={query.text}
            spellCheck={false}
            onChange={(event) => invalidate({ text: event.target.value })}
          />
        </label>
        <div className="preferences-actions">
          {(
            [
              ["caseSensitive", "Diferenciar maiúsculas"],
              ["accents", "Diferenciar acentos"],
              ["wholeWord", "Palavras inteiras"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={query[key]}
                onChange={(event) => invalidate({ [key]: event.target.checked })}
              />{" "}
              {label}
            </label>
          ))}
          <button
            type="button"
            className="btn"
            disabled={!query.text.trim()}
            onClick={() => void search()}
          >
            Pesquisar ocorrências
          </button>
        </div>
      </fieldset>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {running && <p role="status">Processando no dispositivo…</p>}
      {prepared && (
        <>
          <p role="status">
            {prepared.matches.length} ocorrência(s) encontrada(s); {selected.length} selecionada(s).
          </p>
          <label>
            <input
              type="checkbox"
              disabled={running || !prepared.matches.length}
              checked={!!prepared.matches.length && selected.length === prepared.matches.length}
              onChange={(event) => {
                setSelected(event.target.checked ? prepared.matches.map((item) => item.id) : []);
                setConfirmed(false);
              }}
            />{" "}
            Selecionar todas as ocorrências
          </label>
          <div className="local-tools-layout">
            <div style={{ maxHeight: 400, overflow: "auto" }}>
              {prepared.matches.map((item, index) => (
                <div key={item.id} className="form-row">
                  <label>
                    <input
                      type="checkbox"
                      aria-label={`Remover ocorrência ${index + 1}`}
                      checked={selected.includes(item.id)}
                      disabled={running}
                      onChange={(event) => {
                        setSelected((previous) =>
                          event.target.checked
                            ? [...previous, item.id]
                            : previous.filter((id) => id !== item.id),
                        );
                        setConfirmed(false);
                      }}
                    />{" "}
                    Página {item.page + 1}: {item.excerpt}
                  </label>
                  <button
                    type="button"
                    className="btn ghost sm"
                    disabled={running}
                    aria-pressed={active === item.id}
                    onClick={() => setActive(item.id)}
                  >
                    Ver ocorrência {index + 1}
                  </button>
                </div>
              ))}
            </div>
            {match && page && (
              <div className="local-preview" style={{ aspectRatio: `${width} / ${height}` }}>
                {preview?.page === match.page ? (
                  <img src={preview.url} alt={`Prévia da ocorrência na página ${match.page + 1}`} />
                ) : (
                  <p role="status">Preparando prévia…</p>
                )}
                <svg
                  viewBox={`0 0 ${width} ${height}`}
                  role="img"
                  aria-label="Áreas da ocorrência para remoção"
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    pointerEvents: "none",
                  }}
                >
                  <title>Áreas para remoção</title>
                  {withRenderKeys(match.rects, (rect) => JSON.stringify(rect)).map(
                    ({ key, value: rect }) => (
                      <rect
                        key={key}
                        x={rect.x}
                        y={rect.y}
                        width={rect.w}
                        height={rect.h}
                        fill="#dc262655"
                        stroke="#dc2626"
                        strokeWidth={0.5}
                        vectorEffect="non-scaling-stroke"
                      />
                    ),
                  )}
                </svg>
              </div>
            )}
          </div>
          <label>
            <input
              type="checkbox"
              checked={confirmed}
              disabled={running || !selected.length || !preview}
              onChange={(event) => setConfirmed(event.target.checked)}
            />{" "}
            Conferi as ocorrências selecionadas e os efeitos da remoção
          </label>
        </>
      )}
    </Modal>
  );
}
