import { type BatchSettings, batchSettingsSchema } from "@shared/batch-format";
import { documentBuildPayloadSize } from "@shared/document-build-format";
import { parsePageGroups } from "@shared/page-ranges";
import type { LocalTaskRequest, TaskResult } from "@shared/task-format";
import { useCallback, useEffect, useRef, useState } from "react";
import { bytesToDataUrl } from "../lib/actions";
import { runBatch } from "../lib/batch";
import { batchPreviewFile } from "../lib/batch-preview";
import { buildDocumentInWorker } from "../lib/document-build";
import { captureDocumentBuild } from "../lib/document-output";
import { finishDraft } from "../lib/editing";
import { loadSource, releaseSource, renderReviewPage } from "../lib/pdf";
import { documentOriginPaths } from "../lib/recovery";
import { beginLocalTask, type LocalTask } from "../lib/tasks";
import { type DocState, toast, useApp } from "../state/store";
import { ReviewImage } from "../ui/ReviewImage";
import { Modal } from "./Dialogs";

const message = (failure: unknown) =>
  failure instanceof Error ? failure.message : "Falha no lote local.";
export function BatchDialog({
  doc,
  operation = "split",
  resumeId,
}: {
  doc?: DocState;
  operation?: BatchSettings["operation"];
  resumeId?: string;
}): React.ReactElement {
  const [size, setSize] = useState(Math.max(1, Math.ceil((doc?.content.pages.length ?? 1) / 2))),
    [which, setWhich] = useState<"sel" | "current" | "all">(
      doc?.selection.length ? "sel" : "current",
    ),
    [format, setFormat] = useState<"png" | "jpg">("png"),
    [dpi, setDpi] = useState<72 | 150 | 300>(150);
  const [splitMode, setSplitMode] = useState<"count" | "ranges" | "bookmarks" | "size">("count"),
    [bookmarkLevel, setBookmarkLevel] = useState(1),
    [maxMB, setMaxMB] = useState(10),
    [ranges, setRanges] = useState((doc?.content.pages.length ?? 1) > 1 ? "1; 2-ultima" : "1");
  const [prepared, setPrepared] = useState<TaskResult | null>(null),
    [name, setName] = useState(doc?.name ?? "Lote"),
    [running, setRunning] = useState(false),
    [processing, setProcessing] = useState(false),
    [committing, setCommitting] = useState(false),
    [progress, setProgress] = useState(""),
    [error, setError] = useState(""),
    [fileIndex, setFileIndex] = useState(0),
    [page, setPage] = useState(0),
    [preview, setPreview] = useState(""),
    [limited, setLimited] = useState(false),
    [reviewed, setReviewed] = useState(false);
  const mounted = useRef(true),
    detached = useRef(false),
    controller = useRef<AbortController | null>(null),
    task = useRef<LocalTask | null>(null);
  const request = useRef<LocalTaskRequest | null>(null);
  const detail = prepared?.detail?.kind === "batch" ? prepared.detail : undefined,
    file = detail?.files[fileIndex];
  const selectedPages =
    doc?.content.pages.flatMap((ref, index) =>
      which === "all" ||
      (which === "sel" ? doc.selection.includes(ref.id) : index === doc.currentPage)
        ? [index]
        : [],
    ) ?? [];
  const report = useCallback((value: string) => {
    if (mounted.current) setError(value);
    else if (detached.current) toast(value, { tone: "error", ms: 10000 });
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (!detached.current) {
        controller.current?.abort();
        task.current?.disconnect();
      }
    };
  }, []);
  useEffect(() => {
    if (!resumeId) return;
    const abort = new AbortController();
    controller.current = abort;
    setRunning(true);
    void (async () => {
      const pending = await window.api.tasks.load(resumeId);
      if (pending.request.kind !== "batch" || pending.result.detail?.kind !== "batch")
        throw new Error("O resultado escolhido não contém um lote válido.");
      request.current = pending.request;
      const active = await beginLocalTask(pending.request, abort.signal, report);
      task.current = active;
      await active.ready(pending.result);
      if (mounted.current && !abort.signal.aborted) {
        setPrepared(pending.result);
        setName(pending.request.label);
      }
    })()
      .catch((failure: unknown) => {
        if (!abort.signal.aborted) report(message(failure));
        task.current?.disconnect();
      })
      .finally(() => {
        if (mounted.current) setRunning(false);
      });
    return () => abort.abort();
  }, [resumeId, report]);
  useEffect(() => {
    setPreview("");
    setLimited(false);
    if (!prepared || !file) return;
    const abort = new AbortController();
    let sourceId: string | undefined;
    void (async () => {
      const bytes = await batchPreviewFile(prepared, file.name, abort.signal);
      abort.signal.throwIfAborted();
      if (!file.name.endsWith(".pdf")) {
        setPreview(bytesToDataUrl(bytes));
        return;
      }
      const source = await loadSource(bytes, file.name, () => Promise.resolve(null), {
        output: true,
      });
      sourceId = source.id;
      const image = await renderReviewPage(
        { id: "batch-review", src: source.id, index: page, rotation: 0 },
        1200,
        abort.signal,
      );
      if (!abort.signal.aborted) {
        setPreview(image.url);
        setLimited(image.limited);
      }
    })()
      .catch((failure: unknown) => {
        if (!abort.signal.aborted) report(message(failure));
      })
      .finally(() => {
        if (sourceId) releaseSource(sourceId);
      });
    return () => abort.abort();
  }, [prepared, file, page, report]);
  const close = () => {
    if (committing) return;
    controller.current?.abort();
    task.current?.disconnect();
    useApp.setState({ dialog: null });
  };
  const progressUpdate = (value: string) => {
    if (mounted.current) setProgress(value);
  };
  const acceptPrepared = (result: TaskResult, active: LocalTask) => {
    if (detached.current) {
      active.disconnect();
      toast("Lote pronto para revisar em Tarefas.", { ms: 10000 });
    } else if (mounted.current) {
      setPrepared(result);
      setFileIndex(0);
      setPage(0);
      setReviewed(false);
    }
  };
  const start = async () => {
    if (!doc || running || !finishDraft(doc.id)) return;
    const current = useApp.getState().docs.find((item) => item.id === doc.id);
    if (!current) return;
    task.current?.disconnect();
    task.current = null;
    const abort = new AbortController();
    controller.current = abort;
    setRunning(true);
    setProcessing(true);
    setError("");
    setProgress("Capturando revisão atual…");
    try {
      if (current.canCopy === false)
        throw new Error("O documento não permite exportação de conteúdo.");
      if (current.content.pages.length > 1000)
        throw new Error("Lotes com retomada aceitam até mil páginas de origem.");
      if (operation === "split" && splitMode === "ranges" && ranges.split(";").length > 100)
        throw new Error("Escolha até cem partes por lote.");
      const settings = batchSettingsSchema.parse(
          operation === "split"
            ? {
                operation,
                pagesPerFile: size,
                ...(splitMode === "ranges"
                  ? { groups: parsePageGroups(ranges, current.content.pages.length) }
                  : splitMode === "bookmarks"
                    ? { strategy: { kind: "bookmarks", level: bookmarkLevel } }
                    : splitMode === "size"
                      ? { strategy: { kind: "size", maxBytes: Math.floor(maxMB * 1024 * 1024) } }
                      : {}),
              }
            : { operation, pages: selectedPages, format, dpi },
        ),
        input = await captureDocumentBuild(current, current.content, abort.signal);
      const selected: LocalTaskRequest = {
        id: crypto.randomUUID(),
        kind: "batch",
        label: current.name,
        defaultName: `${current.name.replace(/\.pdf$/i, "")} — ${operation === "split" ? "partes" : "imagens"}.zip`,
        extension: "zip",
        inputBytes: documentBuildPayloadSize(input),
        originPaths: documentOriginPaths(current),
      };
      request.current = selected;
      const active = await beginLocalTask(selected, abort.signal, report);
      task.current = active;
      active.describe("Compondo revisão capturada…");
      progressUpdate("Compondo revisão capturada…");
      const pdf = await buildDocumentInWorker(input, active.signal);
      if (pdf.length > 64 * 1024 * 1024)
        throw new Error(
          "A revisão excede 64 MB. Extraia um intervalo menor antes de gerar o lote.",
        );
      acceptPrepared(
        await runBatch(active, { kind: "start", pdf, settings }, progressUpdate),
        active,
      );
    } catch (failure) {
      if (
        !(failure instanceof DOMException && failure.name === "AbortError") &&
        !abort.signal.aborted &&
        !task.current?.signal.aborted
      )
        report(message(failure));
      task.current?.disconnect();
    } finally {
      if (mounted.current) {
        setRunning(false);
        setProcessing(false);
      }
    }
  };
  const continueBatch = async () => {
    if (!prepared || !detail || running || !request.current) return;
    setRunning(true);
    setProcessing(true);
    setError("");
    let active: LocalTask | null = null;
    try {
      let previous = prepared;
      if (task.current && !task.current.signal.aborted) {
        active = task.current;
        await active.stage();
      } else {
        if (task.current) await task.current.outcome;
        const pending = await window.api.tasks.load(request.current.id);
        if (pending.request.kind !== "batch" || pending.result.detail?.kind !== "batch")
          throw new Error("O checkpoint não contém um lote válido.");
        const abort = new AbortController();
        controller.current = abort;
        active = await beginLocalTask(pending.request, abort.signal, report);
        task.current = active;
        await active.checkpointResult(pending.result);
        previous = pending.result;
      }
      if (previous.detail?.kind !== "batch")
        throw new Error("A revisão não contém os ajustes do lote.");
      acceptPrepared(
        await runBatch(
          active,
          {
            kind: "start",
            pdf: previous.pdf,
            settings: previous.detail.settings,
            previous: { bytes: previous.bytes, detail: previous.detail },
          },
          progressUpdate,
        ),
        active,
      );
    } catch (failure) {
      if (!active?.signal.aborted) report(message(failure));
      task.current?.disconnect();
    } finally {
      if (mounted.current) {
        setRunning(false);
        setProcessing(false);
      }
    }
  };
  const save = async () => {
    if (!task.current || !reviewed || detail?.stage !== "review") return;
    setCommitting(true);
    setRunning(true);
    setError("");
    try {
      const destination = await task.current.save();
      if (!destination) return;
      const outcome = await task.current.outcome;
      if (outcome.status === "saved" && outcome.warning)
        toast(outcome.warning, { tone: "error", ms: 10000 });
      toast("Lote salvo em uma nova pasta. Os arquivos anteriores foram preservados.", {
        action: { label: "Mostrar na pasta", run: () => void window.api.showInFolder(destination) },
      });
      controller.current?.abort();
      useApp.setState({ dialog: null });
    } catch (failure) {
      report(message(failure));
    } finally {
      if (mounted.current) {
        setCommitting(false);
        setRunning(false);
      }
    }
  };
  return (
    <Modal
      title={
        resumeId
          ? "Retomar lote preparado"
          : operation === "split"
            ? "Dividir documento"
            : "Exportar como imagens"
      }
      width={860}
      onClose={close}
      allowCancelWhileBusy
      footer={
        <>
          <button type="button" className="btn ghost" disabled={committing} onClick={close}>
            {running ? "Interromper lote" : "Fechar"}
          </button>
          {processing && running && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                detached.current = true;
                useApp.setState({ dialog: { kind: "tasks" } });
              }}
            >
              Continuar em segundo plano
            </button>
          )}
          {!prepared && !resumeId && (
            <button
              type="button"
              className="btn primary"
              disabled={
                running ||
                !doc ||
                doc.readOnly ||
                (operation === "split"
                  ? Math.ceil(doc.content.pages.length / size) < 2
                  : !selectedPages.length)
              }
              onClick={() => void start()}
            >
              Preparar lote
            </button>
          )}
          {prepared && (
            <button
              type="button"
              className="btn ghost"
              disabled={running || committing}
              onClick={() => {
                if (!task.current) return;
                setCommitting(true);
                void task.current
                  .discard()
                  .then(() => {
                    controller.current?.abort();
                    useApp.setState({ dialog: null });
                  })
                  .catch((failure: unknown) => report(message(failure)))
                  .finally(() => {
                    if (mounted.current) setCommitting(false);
                  });
              }}
            >
              Descartar lote
            </button>
          )}
          {detail?.stage === "processing" && (
            <button
              type="button"
              className="btn primary"
              disabled={running || committing}
              onClick={() => void continueBatch()}
            >
              Continuar arquivos pendentes
            </button>
          )}
          {detail?.stage === "review" && (
            <label
              className="muted small"
              style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: "auto" }}
            >
              <input
                type="checkbox"
                checked={reviewed}
                disabled={running}
                onChange={(event) => setReviewed(event.target.checked)}
              />
              Conferi os arquivos e quero salvar o lote.
            </label>
          )}
          {detail?.stage === "review" && (
            <button
              type="button"
              className="btn primary"
              disabled={running || committing || !reviewed || !preview}
              onClick={() => void save()}
            >
              Escolher pasta e salvar lote
            </button>
          )}
        </>
      }
    >
      <p className="muted">
        Processamento local com proteção dos arquivos completos. Confira os resultados; o lote será
        salvo em uma nova subpasta, sem substituir arquivos existentes.
      </p>
      {!prepared && !resumeId && (
        <fieldset disabled={running} style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="sr-only">Ajustes do lote</legend>
          {operation === "split" ? (
            <>
              <label className="form-row">
                Dividir por
                <select
                  className="select"
                  aria-label="Dividir por"
                  value={splitMode}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (
                      value === "ranges" ||
                      value === "count" ||
                      value === "bookmarks" ||
                      value === "size"
                    )
                      setSplitMode(value);
                  }}
                >
                  <option value="count">Quantidade de páginas por arquivo</option>
                  <option value="ranges">Intervalos escolhidos</option>
                  <option value="bookmarks">Marcadores do documento</option>
                  <option value="size">Tamanho máximo por arquivo</option>
                </select>
              </label>
              {splitMode === "ranges" ? (
                <>
                  <label className="form-row">
                    Partes e páginas
                    <input
                      className="input"
                      aria-label="Partes e páginas"
                      maxLength={10000}
                      value={ranges}
                      onChange={(event) => setRanges(event.target.value)}
                      placeholder="1-3; 4, 7; 10-8"
                    />
                  </label>
                  <p className="muted small">
                    Separe arquivos com ponto e vírgula. Dentro de cada parte, use intervalos ou
                    vírgulas. A ordem informada será conservada; páginas fora dos intervalos não
                    entram. “ultima” representa a última página.
                  </p>
                </>
              ) : splitMode === "bookmarks" ? (
                <>
                  <label className="form-row">
                    Nível dos marcadores
                    <input
                      className="input"
                      type="number"
                      min={1}
                      max={100}
                      value={bookmarkLevel}
                      onChange={(event) => setBookmarkLevel(event.target.valueAsNumber)}
                    />
                  </label>
                  <p className="muted small">
                    Nível 1 usa os marcadores principais. Cada destino inicia uma parte; páginas
                    antes do primeiro marcador também são conservadas. Destinos repetidos iniciam
                    uma única parte.
                  </p>
                </>
              ) : splitMode === "size" ? (
                <>
                  <label className="form-row">
                    Máximo por arquivo (MB)
                    <input
                      className="input"
                      type="number"
                      min={0.001}
                      max={32}
                      step={0.001}
                      value={maxMB}
                      onChange={(event) => setMaxMB(event.target.valueAsNumber)}
                    />
                  </label>
                  <p className="muted small">
                    O limite é conferido no PDF gerado, conservando todas as páginas. Uma página
                    isolada pode exigir um limite maior. Metadados e anexos globais continuam em
                    cada parte. MB = 1.048.576 bytes.
                  </p>
                </>
              ) : (
                <label className="form-row">
                  Páginas por arquivo
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={doc?.content.pages.length ?? 1}
                    value={size}
                    onChange={(event) =>
                      setSize(
                        Math.max(
                          1,
                          Math.min(doc?.content.pages.length ?? 1, Number(event.target.value) || 1),
                        ),
                      )
                    }
                  />
                </label>
              )}
            </>
          ) : (
            <>
              <label className="form-row">
                Páginas
                <select
                  className="select"
                  aria-label="Páginas"
                  value={which}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (value === "sel" || value === "all" || value === "current") setWhich(value);
                  }}
                >
                  {!!doc?.selection.length && (
                    <option value="sel">Selecionadas ({doc.selection.length})</option>
                  )}
                  <option value="current">Página atual</option>
                  <option value="all">Todas</option>
                </select>
              </label>
              <label className="form-row">
                Formato
                <select
                  className="select"
                  aria-label="Formato"
                  value={format}
                  onChange={(event) => setFormat(event.target.value === "jpg" ? "jpg" : "png")}
                >
                  <option value="png">PNG (sem perdas)</option>
                  <option value="jpg">JPG (menor)</option>
                </select>
              </label>
              <label className="form-row">
                Resolução
                <select
                  className="select"
                  aria-label="Resolução"
                  value={dpi}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    if (value === 72 || value === 150 || value === 300) setDpi(value);
                  }}
                >
                  <option value={72}>72 dpi</option>
                  <option value={150}>150 dpi</option>
                  <option value={300}>300 dpi</option>
                </select>
              </label>
            </>
          )}
          <p className="muted small">
            Até cem arquivos, 64 MB na revisão de origem e 32 MB por arquivo gerado. Imagens: até 24
            megapixels por página e 512 megapixels no lote.
          </p>
        </fieldset>
      )}
      {running && <p role="status">{progress || "Preparando lote local…"}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {detail && (
        <>
          <p>
            {name} · {detail.files.length} de {detail.total} arquivos completos
          </p>
          {prepared?.warnings.map((warning) => (
            <p className="muted" key={warning}>
              {warning}
            </p>
          ))}
          {!!detail.files.length && (
            <label className="form-row">
              Arquivo da prévia
              <select
                className="select"
                aria-label="Arquivo da prévia"
                value={fileIndex}
                disabled={committing}
                onChange={(event) => {
                  setFileIndex(Number(event.target.value));
                  setPage(0);
                }}
              >
                {detail.files.map((entry, index) => (
                  <option key={entry.name} value={index}>
                    {entry.name} · páginas {entry.pages.join(", ")}
                  </option>
                ))}
              </select>
            </label>
          )}
          {file && detail.settings.operation === "split" && file.pages.length > 1 && (
            <label className="form-row">
              Página da parte
              <input
                className="input"
                type="number"
                min={1}
                max={file.pages.length}
                value={page + 1}
                onChange={(event) =>
                  setPage(
                    Math.max(
                      0,
                      Math.min(file.pages.length - 1, Number(event.target.value) - 1 || 0),
                    ),
                  )
                }
              />
            </label>
          )}
          {file &&
            (preview ? (
              <ReviewImage
                src={preview}
                alt={`Prévia do arquivo ${file.name}, página ${page + 1}`}
                limited={limited}
              />
            ) : (
              <p role="status">Carregando arquivo completo…</p>
            ))}
        </>
      )}
    </Modal>
  );
}
