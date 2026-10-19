import { documentBuildPayloadSize } from "@shared/document-build-format";
import {
  DEFAULT_PRINT_SETTINGS,
  type PrintSettings,
  printSettingsSchema,
} from "@shared/print-format";
import type { TaskResult } from "@shared/task-format";
import { useCallback, useEffect, useRef, useState } from "react";
import { buildDocumentInWorker } from "../lib/document-build";
import { captureDocumentBuild } from "../lib/document-output";
import { finishDraft } from "../lib/editing";
import { loadSource, releaseSource, renderReviewPage } from "../lib/pdf";
import { prepareRestrictedPrint } from "../lib/prepare-raster-print";
import { preparePrintLayout } from "../lib/printing";
import { documentOriginPaths } from "../lib/recovery";
import { beginLocalTask, type LocalTask } from "../lib/tasks";
import { type DocState, toast, useApp } from "../state/store";
import { ReviewImage } from "../ui/ReviewImage";
import { Modal } from "./Dialogs";

async function resumePrintPipeline(
  job: LocalTask,
  input: TaskResult,
  setStatus: (message: string) => void,
): Promise<TaskResult> {
  const report = (message: string) => {
    job.describe(message);
    setStatus(message);
  };
  if (input.detail?.kind !== "printing") throw new Error("Entrada de impressão incompatível.");
  let flat = input;
  if (input.detail.stage === "output") {
    await job.ready(input);
    return input;
  }
  await job.checkpointResult(input);
  if (input.detail.stage === "input") {
    report("Preparando texto, vetores e aparências…");
    flat = await job.flattenPrint();
  }
  if (flat.detail?.kind !== "printing" || flat.detail.stage !== "flattened")
    throw new Error("A cópia vetorial não foi preparada.");
  report("Compondo páginas e folhas…");
  const composed = await preparePrintLayout(flat.pdf, flat.detail.settings, job.signal);
  const result: TaskResult = {
    bytes: composed.bytes,
    pdf: composed.bytes,
    pages: composed.pages,
    warnings: [...flat.warnings, ...composed.warnings],
    extension: "pdf",
    detail: { ...flat.detail, stage: "output" },
  };
  await job.ready(result);
  return result;
}

export function PrintDialog({
  doc,
  resumeId,
}: {
  doc?: DocState;
  resumeId?: string;
}): React.ReactElement {
  const [settings, setSettings] = useState<PrintSettings>(DEFAULT_PRINT_SETTINGS),
    [prepared, setPrepared] = useState<TaskResult | null>(null),
    [preview, setPreview] = useState(""),
    [previewLimited, setPreviewLimited] = useState(false),
    [page, setPage] = useState(0),
    [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [running, setRunning] = useState(false),
    [sending, setSending] = useState(false),
    [reviewed, setReviewed] = useState(false);
  const task = useRef<LocalTask | null>(null),
    controller = useRef<AbortController | null>(null),
    revision = useRef<DocState["content"] | null>(null),
    mounted = useRef(true),
    detached = useRef(false);
  const report = useCallback((message: string) => {
    if (mounted.current) setError(message);
    else if (detached.current) toast(message, { tone: "error", ms: 10000 });
  }, []);
  const progress = useCallback((message: string) => {
    if (mounted.current) setStatus(message);
  }, []);
  const acceptPrepared = useCallback((result: TaskResult, job: LocalTask) => {
    if (detached.current) {
      job.disconnect();
      toast("Impressão preparada. Confira o resultado em Tarefas.", { ms: 10000 });
    } else if (mounted.current) {
      setPrepared(result);
      setPage(0);
      setReviewed(false);
    }
  }, []);
  const [devices, setDevices] = useState<{ name: string; label: string }[]>([]),
    [deviceError, setDeviceError] = useState("");
  useEffect(() => {
    let live = true;
    void window.api
      .printers()
      .then((printers) => {
        if (live) setDevices(printers);
      })
      .catch((failure: unknown) => {
        if (live)
          setDeviceError(
            failure instanceof Error
              ? failure.message
              : "Não foi possível listar impressoras. O diálogo do sistema continua disponível.",
          );
      });
    return () => {
      live = false;
    };
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
    let own: LocalTask | undefined;
    setRunning(true);
    setStatus("Retomando impressão protegida…");
    void (async () => {
      const pending = await window.api.tasks.load(resumeId);
      abort.signal.throwIfAborted();
      if (pending.request.kind !== "printing" || pending.result.detail?.kind !== "printing")
        throw new Error("A tarefa não corresponde à impressão.");
      setSettings(pending.result.detail.settings);
      own = await beginLocalTask(pending.request, abort.signal, (message) => {
        if (!abort.signal.aborted) report(message);
      });
      task.current = own;
      const result = await resumePrintPipeline(own, pending.result, progress);
      abort.signal.throwIfAborted();
      acceptPrepared(result, own);
    })()
      .catch((failure: unknown) => {
        if (!abort.signal.aborted)
          report(failure instanceof Error ? failure.message : "Falha ao retomar impressão.");
        own?.disconnect();
      })
      .finally(() => {
        if (mounted.current && !abort.signal.aborted) setRunning(false);
      });
    return () => {
      if (!detached.current) {
        abort.abort();
        own?.disconnect();
      }
    };
  }, [resumeId, acceptPrepared, progress, report]);
  useEffect(() => {
    if (!prepared) {
      setPreview("");
      return;
    }
    let live = true;
    const abort = new AbortController();
    setPreview("");
    void (async () => {
      const source = await loadSource(
        prepared.pdf,
        "Prévia de impressão.pdf",
        () => Promise.resolve(null),
        { output: true },
      );
      try {
        const image = await renderReviewPage(
          { id: "print-preview", src: source.id, index: page, rotation: 0 },
          1200,
          abort.signal,
        );
        if (live) {
          setPreview(image.url);
          setPreviewLimited(image.limited);
        }
      } finally {
        releaseSource(source.id);
      }
    })().catch((failure: unknown) => {
      if (live)
        setError(failure instanceof Error ? failure.message : "Falha na prévia de impressão.");
    });
    return () => {
      live = false;
      abort.abort();
    };
  }, [prepared, page]);
  const close = () => {
    if (!sending) {
      controller.current?.abort();
      task.current?.disconnect();
      useApp.setState({ dialog: null });
    }
  };
  const prepare = async () => {
    if (!doc || running || prepared || !finishDraft(doc.id)) return;
    const current = useApp.getState().docs.find((value) => value.id === doc.id);
    if (!current) return;
    const abort = new AbortController();
    controller.current = abort;
    setError("");
    setRunning(true);
    setStatus("Preparando revisão atual…");
    revision.current = current.content;
    try {
      if (current.readOnly) {
        const result = await prepareRestrictedPrint(
          current,
          settings.range,
          abort.signal,
          (job) => {
            task.current = job;
          },
          progress,
          report,
        );
        abort.signal.throwIfAborted();
        const active = task.current;
        if (!active) throw new Error("A tarefa de impressão foi encerrada.");
        acceptPrepared(result, active);
        return;
      }
      const selected = printSettingsSchema.parse(settings),
        input = await captureDocumentBuild(current, current.content, abort.signal);
      abort.signal.throwIfAborted();
      const job = await beginLocalTask(
        {
          id: crypto.randomUUID(),
          kind: "printing",
          label: `Imprimir ${current.name}`,
          defaultName: `${current.name.replace(/\.pdf$/i, "")} (impressão).pdf`,
          extension: "pdf",
          inputBytes: documentBuildPayloadSize(input),
          originPaths: documentOriginPaths(current),
        },
        abort.signal,
        report,
      );
      task.current = job;
      job.describe("Compondo a revisão atual para impressão…");
      const bytes = await buildDocumentInWorker(input, job.signal);
      const result = await resumePrintPipeline(
        job,
        {
          bytes,
          pdf: bytes,
          pages: current.content.pages.length,
          warnings: [],
          extension: "pdf",
          detail: { kind: "printing", stage: "input", settings: selected },
        },
        progress,
      );
      abort.signal.throwIfAborted();
      acceptPrepared(result, job);
    } catch (failure) {
      if (!abort.signal.aborted)
        report(failure instanceof Error ? failure.message : "Falha ao preparar impressão.");
      task.current?.disconnect();
    } finally {
      if (mounted.current && !abort.signal.aborted) setRunning(false);
    }
  };
  const submit = async (savePdf: boolean) => {
    const job = task.current;
    if (!job || !prepared || !reviewed || sending) return;
    setSending(true);
    setError("");
    try {
      await job.check();
      if (
        doc &&
        revision.current &&
        useApp.getState().docs.find((value) => value.id === doc.id)?.content !== revision.current
      )
        throw new Error("O documento mudou. Descarte esta preparação e gere uma nova prévia.");
      const done = savePdf ? !!(await job.save()) : await job.print();
      if (!done) return;
      const outcome = await job.outcome;
      toast(
        (outcome.status === "printed" || outcome.status === "saved") && outcome.warning
          ? outcome.warning
          : savePdf
            ? "PDF de impressão salvo."
            : "Impressão enviada ao sistema. Acompanhe a fila da impressora.",
      );
      useApp.setState({ dialog: null });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Falha ao enviar impressão.");
    } finally {
      setSending(false);
    }
  };
  const change = <K extends keyof PrintSettings>(key: K, value: PrintSettings[K]) =>
    setSettings((current) => ({ ...current, [key]: value }));
  return (
    <Modal
      title="Preparar impressão"
      width={1050}
      onClose={close}
      allowCancelWhileBusy={!sending}
      footer={
        <div className="print-actions">
          {prepared && (
            <label className="print-review-confirmation">
              <input
                type="checkbox"
                checked={reviewed}
                disabled={sending || !preview}
                onChange={(event) => setReviewed(event.target.checked)}
              />
              Revisei a ordem, a escala e as folhas preparadas.
            </label>
          )}
          <div className="print-action-buttons">
            <button type="button" className="btn ghost" disabled={sending} onClick={close}>
              {running ? "Interromper e continuar depois" : "Continuar depois"}
            </button>
            {running && !sending && (
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
            <div className="spacer" />
            {prepared ? (
              <>
                {!resumeId && (
                  <button
                    type="button"
                    className="btn ghost"
                    disabled={sending}
                    onClick={() => {
                      setSending(true);
                      void task.current
                        ?.discard()
                        .then(() => {
                          setPrepared(null);
                          setReviewed(false);
                          setError("");
                          task.current = null;
                        })
                        .catch((failure: unknown) =>
                          setError(
                            failure instanceof Error
                              ? failure.message
                              : "Falha ao descartar preparação.",
                          ),
                        )
                        .finally(() => setSending(false));
                    }}
                  >
                    Descartar e ajustar
                  </button>
                )}
                {!(prepared.detail?.kind === "printing" && prepared.detail.printOnly) && (
                  <button
                    type="button"
                    className="btn"
                    disabled={!reviewed || sending || !!error}
                    onClick={() => void submit(true)}
                  >
                    Salvar PDF preparado
                  </button>
                )}
                <button
                  type="button"
                  className="btn primary"
                  disabled={!reviewed || sending || !!error}
                  onClick={() => void submit(false)}
                >
                  Imprimir pelo sistema…
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn primary"
                disabled={running || !doc}
                onClick={() => void prepare()}
              >
                Gerar prévia de impressão
              </button>
            )}
          </div>
        </div>
      }
    >
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {doc?.readOnly && !prepared ? (
        <>
          <p>
            Este documento está em modo de leitura. A impressão autorizada usa imagens a 200 dpi; a
            composição vetorial exige uma cópia editável. A preparação permite cancelamento e
            revisão antes de enviar ao sistema; não autoriza salvar ou exportar esta cópia.
          </p>
          <label className="form-row">
            Páginas de impressão restrita
            <input
              className="input"
              aria-label="Páginas de impressão restrita"
              value={settings.range}
              maxLength={10000}
              disabled={running}
              onChange={(event) => change("range", event.target.value)}
              placeholder="todas, 1-3, 7, pares"
            />
          </label>
          <button type="button" className="btn" disabled={running} onClick={() => void prepare()}>
            Preparar documento como imagens…
          </button>
          {running && <p role="status">{status}</p>}
        </>
      ) : (
        <>
          {!prepared && !running && !resumeId ? (
            <fieldset className="print-settings">
              <legend>Configurar folhas</legend>
              <label className="form-row">
                Impressora
                <select
                  className="input"
                  aria-label="Impressora"
                  value={settings.printer ?? ""}
                  onChange={(event) => change("printer", event.target.value || undefined)}
                >
                  <option value="">Padrão do sistema</option>
                  {devices.map((device) => (
                    <option key={device.name} value={device.name}>
                      {device.label}
                    </option>
                  ))}
                </select>
              </label>
              {deviceError && (
                <p role="status" className="muted">
                  {deviceError}
                </p>
              )}
              <div className="form-row">
                <label>
                  Páginas
                  <input
                    className="input"
                    value={settings.range}
                    onChange={(event) => change("range", event.target.value)}
                    placeholder="todas, 1-3, 7, pares"
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={settings.reverse}
                    onChange={(event) => change("reverse", event.target.checked)}
                  />{" "}
                  Ordem inversa
                </label>
              </div>
              <div className="form-row">
                <label>
                  Composição
                  <select
                    className="input"
                    value={settings.layout}
                    aria-label="Composição"
                    onChange={(event) => {
                      const layout = event.target.value;
                      if (layout === "single" || layout === "multiple" || layout === "booklet")
                        setSettings((current) => ({
                          ...current,
                          layout,
                          duplex: layout === "booklet" ? "shortEdge" : current.duplex,
                          landscape: layout === "booklet" ? true : current.landscape,
                          paper:
                            layout === "single"
                              ? current.paper
                              : current.paper === "original"
                                ? "a4"
                                : current.paper,
                        }));
                    }}
                  >
                    <option value="single">Uma página por folha</option>
                    <option value="multiple">Várias páginas por folha</option>
                    <option value="booklet">Livreto para dobrar ao meio</option>
                  </select>
                </label>
                {settings.layout === "multiple" && (
                  <label>
                    Páginas por folha
                    <select
                      className="input"
                      value={settings.perSheet}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        if (
                          value === 2 ||
                          value === 4 ||
                          value === 6 ||
                          value === 9 ||
                          value === 16
                        )
                          change("perSheet", value);
                      }}
                    >
                      {[2, 4, 6, 9, 16].map((count) => (
                        <option key={count} value={count}>
                          {count}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  Papel
                  <select
                    className="input"
                    value={settings.paper}
                    aria-label="Papel"
                    onChange={(event) => {
                      const value = event.target.value;
                      if (
                        value === "original" ||
                        value === "a4" ||
                        value === "letter" ||
                        value === "a3"
                      )
                        change("paper", value);
                    }}
                  >
                    {settings.layout === "single" && (
                      <option value="original">Tamanho original de cada página</option>
                    )}
                    <option value="a4">A4</option>
                    <option value="letter">Carta</option>
                    <option value="a3">A3</option>
                  </select>
                </label>
              </div>
              <div className="form-row">
                <label>
                  <input
                    type="checkbox"
                    checked={settings.landscape}
                    disabled={settings.layout === "booklet" || settings.paper === "original"}
                    onChange={(event) => change("landscape", event.target.checked)}
                  />{" "}
                  Papel em paisagem
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={settings.fit}
                    onChange={(event) => change("fit", event.target.checked)}
                  />{" "}
                  Ajustar à área
                </label>
                <label>
                  Escala (%)
                  <input
                    type="number"
                    className="input"
                    min={10}
                    max={400}
                    value={settings.scale}
                    onChange={(event) => change("scale", Number(event.target.value))}
                  />
                </label>
                <label>
                  Margens (pt)
                  <input
                    type="number"
                    className="input"
                    min={0}
                    max={144}
                    value={settings.margin}
                    onChange={(event) => change("margin", Number(event.target.value))}
                  />
                </label>
              </div>
              <div className="form-row">
                <label>
                  Cópias
                  <input
                    type="number"
                    className="input"
                    min={1}
                    max={999}
                    value={settings.copies}
                    onChange={(event) => change("copies", Number(event.target.value))}
                  />
                </label>
                <label>
                  Frente e verso
                  <select
                    className="input"
                    value={settings.duplex}
                    disabled={settings.layout === "booklet"}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value === "simplex" || value === "longEdge" || value === "shortEdge")
                        change("duplex", value);
                    }}
                  >
                    <option value="simplex">Uma face</option>
                    <option value="longEdge">Duas faces · borda longa</option>
                    <option value="shortEdge">Duas faces · borda curta</option>
                  </select>
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={settings.color}
                    onChange={(event) => change("color", event.target.checked)}
                  />{" "}
                  Cores
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={settings.collate}
                    onChange={(event) => change("collate", event.target.checked)}
                  />{" "}
                  Agrupar cópias
                </label>
              </div>
            </fieldset>
          ) : (
            <p className="print-summary">
              <strong>
                {settings.layout === "booklet"
                  ? "Livreto"
                  : settings.layout === "multiple"
                    ? `${settings.perSheet} páginas por face`
                    : "Uma página por face"}
              </strong>{" "}
              · {settings.paper === "original" ? "Tamanho original" : settings.paper.toUpperCase()}{" "}
              · escala {settings.scale}% · {settings.copies}{" "}
              {settings.copies === 1 ? "cópia" : "cópias"} ·{" "}
              {settings.printer ?? "Impressora padrão do sistema"}
            </p>
          )}
          {!prepared && (
            <p className="muted small">
              Texto e desenhos permanecem vetoriais. Tamanho original com escala 100% conserva a
              geometria da página; margens e orientação da composição valem ao escolher papel.
              Duplex, cores e cópias dependem do driver e podem ser ajustados no diálogo do sistema.
              Salvar PDF conserva as cores do documento.
            </p>
          )}
          {running && <p role="status">{status}</p>}
          {prepared && (
            <>
              <div className="form-row print-navigation">
                <button
                  type="button"
                  className="btn"
                  disabled={page === 0 || sending}
                  onClick={() => setPage((value) => value - 1)}
                >
                  Anterior
                </button>
                <span>
                  Face {page + 1} de {prepared.pages}
                </span>
                <button
                  type="button"
                  className="btn"
                  disabled={page >= prepared.pages - 1 || sending}
                  onClick={() => setPage((value) => value + 1)}
                >
                  Próxima
                </button>
              </div>
              {preview && (
                <ReviewImage
                  src={preview}
                  alt={`Prévia da face ${page + 1} preparada para impressão`}
                  limited={previewLimited}
                  grayscale={!settings.color}
                />
              )}
              {prepared.warnings.map((warning) => (
                <p key={warning} className="muted">
                  {warning}
                </p>
              ))}
            </>
          )}
        </>
      )}
    </Modal>
  );
}
