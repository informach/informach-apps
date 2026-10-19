import type { OcrLanguage } from "@informach/edi-ocr";
import { parsePageRange } from "@shared/page-ranges";
import type { LocalTaskRequest } from "@shared/task-format";
import { useCallback, useEffect, useRef, useState } from "react";
import { buildDoc, openConvertedPdf } from "../lib/actions";
import { finishDraft } from "../lib/editing";
import { localFonts } from "../lib/fonts";
import { runEngine } from "../lib/local-engine";
import {
  type OcrTaskReview,
  ocrTaskDetail,
  ocrTaskResult,
  recognizeOcrPages,
  resumedOcrReview,
} from "../lib/ocr-task";
import { documentOriginPaths, recoverySnapshot } from "../lib/recovery";
import { replaceDocumentBytes } from "../lib/structural-edit";
import { beginLocalTask, type LocalTask } from "../lib/tasks";
import { type DocState, toast, useApp } from "../state/store";
import { Modal } from "./Dialogs";

const message = (error: unknown) =>
  error instanceof Error ? error.message : "Falha no OCR local.";
export function OcrDialog({
  doc,
  resumeId,
}: {
  doc?: DocState;
  resumeId?: string;
}): React.ReactElement {
  const [range, setRange] = useState(`1-${doc?.content.pages.length ?? 1}`);
  const [language, setLanguage] = useState<OcrLanguage>("por");
  const [turn, setTurn] = useState<0 | 90 | 180 | 270>(0),
    [skew, setSkew] = useState(0);
  const [autoOrientation, setAutoOrientation] = useState(true),
    [autoSkew, setAutoSkew] = useState(true);
  const [dpi, setDpi] = useState<150 | 200 | 300>(200),
    [force, setForce] = useState(false);
  const [running, setRunning] = useState(false),
    [committing, setCommitting] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const detached = useRef(false);
  const [progress, setProgress] = useState(""),
    [error, setError] = useState("");
  const [review, setReview] = useState<OcrTaskReview | null>(null);
  const [pageIndex, setPageIndex] = useState(0),
    [wordIndex, setWordIndex] = useState(0);
  const [uncertain, setUncertain] = useState(true),
    [wordOffset, setWordOffset] = useState(0);
  const controller = useRef<AbortController | null>(null),
    task = useRef<LocalTask | null>(null);
  const request = useRef<LocalTaskRequest | null>(null),
    mounted = useRef(true);
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
  const report = useCallback((value: string) => {
    if (mounted.current) setError(value);
    else if (detached.current) toast(value, { tone: "error", ms: 10000 });
  }, []);
  useEffect(() => {
    if (!resumeId) return;
    const abort = new AbortController();
    controller.current = abort;
    setRunning(true);
    setProgress("Retomando OCR protegido…");
    void (async () => {
      const pending = await window.api.tasks.load(resumeId);
      abort.signal.throwIfAborted();
      const previous = resumedOcrReview(pending);
      request.current = pending.request;
      const active = await beginLocalTask(pending.request, abort.signal, report);
      task.current = active;
      await active.ready(pending.result);
      if (abort.signal.aborted || !mounted.current) return;
      setReview(previous);
      setLanguage(previous.options.language);
      setDpi(previous.options.dpi);
      setForce(previous.options.force);
      setTurn(previous.options.turn);
      setSkew(previous.options.skew);
      setAutoOrientation(previous.options.autoOrientation);
      setAutoSkew(previous.options.autoSkew);
      setRange(
        [
          ...previous.pages.map((page) => page.page + 1),
          ...previous.remaining.map((page) => page + 1),
        ].join(";"),
      );
      setProgress(
        previous.remaining.length
          ? `${previous.pages.length} páginas concluídas e ${previous.remaining.length} pendentes. Continue o reconhecimento ou revise as palavras já prontas.`
          : "Resultado retomado. Revise as palavras e abra uma nova cópia com o OCR.",
      );
    })()
      .catch((failure) => {
        if (!abort.signal.aborted) report(message(failure));
      })
      .finally(() => {
        if (mounted.current && !abort.signal.aborted) setRunning(false);
      });
    return () => {
      if (!detached.current) abort.abort();
    };
  }, [resumeId, report]);
  useEffect(() => {
    if (!review || running || !task.current || task.current.signal.aborted) return;
    const timer = setTimeout(() => {
      void task.current
        ?.update(ocrTaskDetail(review))
        .catch((failure: unknown) => report(message(failure)));
    }, 750);
    return () => clearTimeout(timer);
  }, [review, running, report]);
  const close = async () => {
    if (committing) return;
    if (!running && review && task.current && !task.current.signal.aborted)
      try {
        await task.current.update(ocrTaskDetail(review));
      } catch (failure) {
        toast(
          `A última atualização da revisão não foi gravada: ${message(failure)}. Confira Tarefas.`,
          { tone: "error" },
        );
      }
    controller.current?.abort();
    task.current?.disconnect();
    useApp.setState({ dialog: null });
  };
  const page = review?.pages[pageIndex],
    word = page?.result.words[wordIndex];
  const visibleWords =
    page?.result.words
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => !uncertain || item.confidence < 80) ?? [];
  const acquire = async (before: OcrTaskReview): Promise<LocalTask> => {
    if (task.current && !task.current.signal.aborted) {
      await task.current.stage();
      return task.current;
    }
    if (task.current) await task.current.outcome;
    if (!request.current)
      throw new Error("A tarefa OCR não está disponível. Retome pela janela Tarefas.");
    const abort = new AbortController();
    controller.current = abort;
    const active = await beginLocalTask(request.current, abort.signal, report);
    task.current = active;
    await active.checkpointResult(ocrTaskResult(before));
    return active;
  };
  const continueRecognition = async () => {
    if (!review || running) return;
    setRunning(true);
    setRecognizing(true);
    setError("");
    try {
      const before: OcrTaskReview = { ...review, stage: "recognizing", output: undefined };
      const active = await acquire(before);
      await recognizeOcrPages(
        before,
        active,
        (value) => {
          if (mounted.current) setProgress(value);
        },
        (value) => {
          if (mounted.current) setReview(value);
        },
      );
      if (detached.current) {
        active.disconnect();
        toast("OCR pronto para revisar em Tarefas. O documento ainda não foi alterado.", {
          ms: 10000,
        });
      }
      if (mounted.current)
        setProgress("Reconhecimento pronto para revisão. O documento ainda não foi alterado.");
    } catch (failure) {
      if (controller.current?.signal.aborted || task.current?.signal.aborted)
        setProgress("OCR interrompido. O progresso já concluído está protegido em Tarefas.");
      else report(message(failure));
      task.current?.disconnect();
    } finally {
      if (mounted.current) {
        setRunning(false);
        setRecognizing(false);
      }
    }
  };
  const start = async () => {
    if (running || !doc || doc.readOnly) return;
    setRunning(true);
    setRecognizing(true);
    setError("");
    setProgress("Preparando páginas…");
    try {
      if (review && task.current && !task.current.signal.aborted)
        await task.current.update(ocrTaskDetail(review));
      task.current?.disconnect();
      task.current = null;
      setReview(null);
      const abort = new AbortController();
      controller.current = abort;
      if (!finishDraft(doc.id)) throw new Error("Finalize o rascunho antes de reconhecer o texto.");
      const current = useApp.getState().docs.find((item) => item.id === doc.id);
      if (!current) throw new Error("Documento fechado.");
      const indexes = parsePageRange(range, current.content.pages.length);
      if (!indexes.length || indexes.length > 100)
        throw new Error("Selecione de 1 a 100 páginas por lote OCR.");
      const bytes = await buildDoc(current, current.content, abort.signal);
      abort.signal.throwIfAborted();
      if (bytes.length > 64 * 1024 * 1024 || current.content.pages.length > 1000)
        throw new Error(
          "O OCR com retomada aceita PDFs de até 64 MB e mil páginas. Compacte uma cópia ou extraia um intervalo antes de reconhecer.",
        );
      const initial: OcrTaskReview = {
        kind: "ocr",
        stage: "recognizing",
        bytes,
        total: current.content.pages.length,
        name: `${current.name.replace(/\.pdf$/i, "")} (OCR).pdf`,
        originPaths: documentOriginPaths(current),
        content: current.content,
        pages: [],
        skipped: 0,
        remaining: indexes,
        options: { language, dpi, force, turn, skew, autoOrientation, autoSkew },
      };
      const selected: LocalTaskRequest = {
        id: crypto.randomUUID(),
        kind: "ocr",
        label: current.name,
        defaultName: initial.name,
        extension: "pdf",
        inputBytes: bytes.length,
        originPaths: initial.originPaths,
      };
      request.current = selected;
      const active = await beginLocalTask(selected, abort.signal, report);
      task.current = active;
      await active.checkpointResult(ocrTaskResult(initial));
      setReview(initial);
      await recognizeOcrPages(
        initial,
        active,
        (value) => {
          if (mounted.current) setProgress(value);
        },
        (value) => {
          if (mounted.current) setReview(value);
        },
      );
      if (detached.current) {
        active.disconnect();
        toast("OCR pronto para revisar em Tarefas. O documento ainda não foi alterado.", {
          ms: 10000,
        });
        return;
      }
      setPageIndex(0);
      setWordIndex(0);
      setWordOffset(0);
      setProgress("Reconhecimento pronto para revisão. O documento ainda não foi alterado.");
    } catch (failure) {
      if (controller.current?.signal.aborted)
        setProgress("OCR interrompido. O progresso já concluído está protegido em Tarefas.");
      else if (!task.current?.signal.aborted) report(message(failure));
      task.current?.disconnect();
    } finally {
      if (mounted.current) {
        setRunning(false);
        setRecognizing(false);
      }
    }
  };
  const apply = async () => {
    if (
      !review ||
      running ||
      review.remaining.length ||
      !review.pages.some((item) => item.result.words.some((word) => word.text.trim()))
    )
      return;
    setRunning(true);
    setError("");
    let cpuHeld = false;
    try {
      const active = await acquire(review);
      cpuHeld = true;
      const fonts = await localFonts();
      active.signal.throwIfAborted();
      const bytes = await runEngine(
        {
          kind: "ocr",
          bytes: review.bytes,
          pages: review.pages.map(({ page, turn, skew, result }) => ({ page, turn, skew, result })),
          font: fonts.regular,
        },
        active.signal,
      );
      const output: OcrTaskReview = { ...review, output: bytes, stage: "output" };
      await active.ready(ocrTaskResult(output));
      cpuHeld = false;
      setReview(output);
      setCommitting(true);
      setProgress("Aplicando revisão e protegendo a recuperação…");
      let applied: DocState;
      if (doc && review.content && !resumeId) {
        await replaceDocumentBytes(doc.id, review.content, bytes, {
          requireCopy: true,
          signal: active.signal,
          beforeCommit: () => active.check(),
        });
        const current = useApp.getState().docs.find((item) => item.id === doc.id);
        if (!current) throw new Error("Documento fechado após aplicar OCR.");
        applied = current;
      } else
        applied = await openConvertedPdf(bytes, review.name, review.originPaths, {
          signal: active.signal,
          beforeCommit: () => active.check(),
        });
      let secured = false;
      try {
        await window.api.recovery.save(recoverySnapshot(applied));
        secured = true;
      } catch (failure) {
        toast(
          `O OCR foi aplicado, mas a recuperação não foi atualizada: ${message(failure)}. O resultado permanece protegido em Tarefas.`,
          { tone: "error", ms: 10000 },
        );
      }
      if (secured)
        try {
          await active.discard();
        } catch (failure) {
          toast(`OCR aplicado; confira a cópia preparada em Tarefas: ${message(failure)}`, {
            tone: "error",
            ms: 10000,
          });
        }
      toast("Camada OCR aplicada. Revise a busca e salve uma cópia.", { tone: "ok" });
      controller.current?.abort();
      task.current?.disconnect();
      useApp.setState({ dialog: null });
    } catch (failure) {
      if (cpuHeld && task.current && !task.current.signal.aborted)
        try {
          await task.current.ready(
            ocrTaskResult({ ...review, stage: "review", output: undefined }),
          );
        } catch (cleanup) {
          report(`A etapa foi interrompida: ${message(cleanup)}. Confira Tarefas.`);
        }
      if (!task.current?.signal.aborted) report(message(failure));
    } finally {
      if (mounted.current) {
        setRunning(false);
        setCommitting(false);
      }
    }
  };
  return (
    <Modal
      title="Reconhecer texto — OCR local"
      width={1000}
      onClose={close}
      footer={
        <>
          <span className="muted small">Sem envio de documentos</span>
          <div className="spacer" />
          <button
            type="button"
            className="btn ghost"
            disabled={committing}
            onClick={() => (running ? controller.current?.abort() : close())}
          >
            {running ? "Cancelar operação" : "Fechar"}
          </button>
          {recognizing && running && !committing && (
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
          {review && !running && (
            <button
              type="button"
              className="btn ghost"
              disabled={committing}
              onClick={() => {
                setCommitting(true);
                setRunning(true);
                void (async () => {
                  if (!task.current) throw new Error("Retome a revisão antes de descartá-la.");
                  await task.current.discard();
                  controller.current?.abort();
                  useApp.setState({ dialog: null });
                })()
                  .catch((failure: unknown) => report(message(failure)))
                  .finally(() => {
                    if (mounted.current) {
                      setCommitting(false);
                      setRunning(false);
                    }
                  });
              }}
            >
              Descartar revisão OCR
            </button>
          )}
          <button
            type="button"
            className="btn"
            disabled={running || !doc || doc.readOnly || !!resumeId}
            onClick={() => void start()}
          >
            Reconhecer
          </button>
          {review && (review.remaining.length > 0 || review.stage === "recognizing") && (
            <button
              type="button"
              className="btn"
              disabled={running}
              onClick={() => void continueRecognition()}
            >
              Continuar páginas pendentes
            </button>
          )}
          <button
            type="button"
            className="btn primary"
            disabled={
              running ||
              !!review?.remaining.length ||
              !review?.pages.some((item) => item.result.words.some((word) => word.text.trim()))
            }
            onClick={() => void apply()}
          >
            {resumeId ? "Abrir cópia com OCR revisado" : "Aplicar texto revisado"}
          </button>
        </>
      }
    >
      <p>
        Transforme páginas digitalizadas em texto pesquisável e selecionável. A aparência original
        permanece; rotação e inclinação ajustam apenas a imagem usada no reconhecimento.
      </p>
      {resumeId && (
        <p className="muted">
          A retomada usa a cópia protegida da tarefa. O resultado revisado abre em uma nova aba,
          preservando os documentos atuais.
        </p>
      )}
      <fieldset disabled={running || !!resumeId} style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="sr-only">Ajustes do reconhecimento</legend>
        <div className="ocr-settings">
          <label>
            Páginas
            <input
              className="input"
              disabled={running}
              value={range}
              onChange={(event) => setRange(event.target.value)}
            />
          </label>
          <label>
            Idioma
            <select
              className="input"
              disabled={running}
              value={language}
              onChange={(event) => {
                if (
                  event.target.value === "por" ||
                  event.target.value === "eng" ||
                  event.target.value === "spa"
                )
                  setLanguage(event.target.value);
              }}
            >
              <option value="por">Português</option>
              <option value="eng">Inglês</option>
              <option value="spa">Espanhol</option>
            </select>
          </label>
          <label>
            Resolução
            <select
              className="input"
              disabled={running}
              value={dpi}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (value === 150 || value === 200 || value === 300) setDpi(value);
              }}
            >
              <option value={150}>150 dpi</option>
              <option value={200}>200 dpi</option>
              <option value={300}>300 dpi</option>
            </select>
          </label>
          <label>
            Rotação
            <select
              className="input"
              disabled={running || autoOrientation}
              value={turn}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (value === 0 || value === 90 || value === 180 || value === 270) setTurn(value);
              }}
            >
              {[0, 90, 180, 270].map((value) => (
                <option key={value} value={value}>
                  {value}°
                </option>
              ))}
            </select>
          </label>
          <label>
            Inclinação (−10° a 10°)
            <input
              className="input"
              disabled={running}
              type="number"
              min={-10}
              max={10}
              step={0.1}
              value={skew}
              onChange={(event) => setSkew(event.target.valueAsNumber)}
            />
          </label>
        </div>
        <div className="ocr-settings">
          <label className="check-row">
            <input
              type="checkbox"
              disabled={running}
              checked={autoOrientation}
              onChange={(event) => setAutoOrientation(event.target.checked)}
            />
            Comparar as quatro orientações automaticamente
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              disabled={running}
              checked={autoSkew}
              onChange={(event) => setAutoSkew(event.target.checked)}
            />
            Ajustar inclinação estimada pelas linhas de texto
          </label>
        </div>
        <label className="check-row">
          <input
            type="checkbox"
            disabled={running}
            checked={force}
            onChange={(event) => setForce(event.target.checked)}
          />
          Reconhecer também páginas com texto existente (pode duplicar texto de outros programas)
        </label>
      </fieldset>
      <p role="status">{progress}</p>
      {running && <progress aria-label="OCR em andamento" />}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {review && (
        <p className="muted small">
          {review.pages.length} páginas reconhecidas; {review.skipped} ignoradas por já conterem
          texto. Palavras com confiança abaixo de 80% merecem revisão. Páginas sem palavras não
          recebem texto.
        </p>
      )}
      {page && (
        <>
          <div className="ocr-settings">
            <label>
              Revisar página
              <select
                className="input"
                value={pageIndex}
                disabled={running}
                onChange={(event) => {
                  setPageIndex(Number(event.target.value));
                  setWordIndex(0);
                  setWordOffset(0);
                }}
              >
                {review.pages.map((item, index) => (
                  <option key={item.page} value={index}>
                    {item.page + 1} · confiança {Math.round(item.result.confidence)}%
                  </option>
                ))}
              </select>
            </label>
            <label className="check-row">
              <input
                type="checkbox"
                checked={uncertain}
                onChange={(event) => {
                  setUncertain(event.target.checked);
                  setWordOffset(0);
                }}
              />
              Somente palavras incertas
            </label>
          </div>
          <div className="ocr-review">
            <svg
              viewBox={`0 0 ${page.result.width} ${page.result.height}`}
              role="img"
              aria-label={`Imagem reconhecida da página ${page.page + 1}`}
            >
              <image href={page.preview} width={page.result.width} height={page.result.height} />
              {word && (
                <rect
                  x={word.x0}
                  y={word.y0}
                  width={word.x1 - word.x0}
                  height={word.y1 - word.y0}
                  fill="#f59e0b44"
                  stroke="#d97706"
                  strokeWidth={3}
                />
              )}
            </svg>
            <div>
              {word && (
                <label>
                  Corrigir palavra · {Math.round(word.confidence)}%
                  <input
                    className="input"
                    maxLength={2000}
                    disabled={running}
                    value={word.text}
                    onChange={(event) => {
                      const value = event.target.value;
                      setReview(
                        (current) =>
                          current && {
                            ...current,
                            stage: current.remaining.length ? "recognizing" : "review",
                            output: undefined,
                            pages: current.pages.map((item, index) =>
                              index === pageIndex
                                ? {
                                    ...item,
                                    result: {
                                      ...item.result,
                                      words: item.result.words.map((candidate, index) =>
                                        index === wordIndex
                                          ? { ...candidate, text: value }
                                          : candidate,
                                      ),
                                    },
                                  }
                                : item,
                            ),
                          },
                      );
                    }}
                  />
                </label>
              )}
              <fieldset className="ocr-words" aria-label="Palavras reconhecidas">
                {visibleWords.slice(wordOffset, wordOffset + 100).map(({ item, index }) => (
                  <button
                    type="button"
                    className={`btn ghost${index === wordIndex ? " active" : ""}`}
                    key={index}
                    onClick={() => setWordIndex(index)}
                  >
                    {item.text || "(removida)"} · {Math.round(item.confidence)}%
                  </button>
                ))}
              </fieldset>
              <div className="ocr-settings">
                <button
                  type="button"
                  className="btn ghost"
                  disabled={wordOffset === 0}
                  onClick={() => setWordOffset(Math.max(0, wordOffset - 100))}
                >
                  Palavras anteriores
                </button>
                <span>
                  {visibleWords.length ? wordOffset + 1 : 0}–
                  {Math.min(wordOffset + 100, visibleWords.length)} de {visibleWords.length}
                </span>
                <button
                  type="button"
                  className="btn ghost"
                  disabled={wordOffset + 100 >= visibleWords.length}
                  onClick={() => setWordOffset(wordOffset + 100)}
                >
                  Próximas palavras
                </button>
              </div>
              <p className="muted small">
                Orientação {page.turn}°; inclinação {page.skew.toFixed(1)}°. Correções mantêm a
                posição da palavra original. Revise a imagem antes de aplicar.
              </p>
            </div>
          </div>
        </>
      )}
    </Modal>
  );
}
