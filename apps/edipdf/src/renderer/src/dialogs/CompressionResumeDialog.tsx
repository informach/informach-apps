import { formatSize } from "@shared/compress";
import type { TaskResult } from "@shared/task-format";
import { useEffect, useRef, useState } from "react";
import {
  type CompressionPreview,
  compressionResultPreview,
  prepareCompression,
} from "../lib/compression-task";
import { beginLocalTask, type LocalTask } from "../lib/tasks";
import { toast, useApp } from "../state/store";
import { Modal } from "./Dialogs";

export function CompressionResumeDialog({
  id,
  processing,
}: {
  id: string;
  processing: boolean;
}): React.ReactElement {
  const [result, setResult] = useState<TaskResult | null>(null),
    [images, setImages] = useState<CompressionPreview>(),
    [error, setError] = useState(""),
    [status, setStatus] = useState("Retomando tarefa protegida…"),
    [saving, setSaving] = useState(false);
  const [acceptLarger, setAcceptLarger] = useState(false),
    [qualityAccepted, setQualityAccepted] = useState(false);
  const task = useRef<LocalTask | null>(null),
    controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    let ownTask: LocalTask | undefined;
    const report = (message: string) => {
      if (!abort.signal.aborted) setError(message);
    };
    void (async () => {
      if (processing) {
        const pending = await window.api.tasks.input(id);
        abort.signal.throwIfAborted();
        const bytes = pending.input.bytes ?? pending.fileBytes;
        if (!bytes) throw new Error("A entrada da tarefa não está disponível.");
        ownTask = await beginLocalTask(
          { ...pending.request, destination: undefined },
          abort.signal,
          report,
        );
        task.current = ownTask;
        const prepared = await prepareCompression(
          ownTask,
          bytes,
          pending.input,
          pending.request.defaultName,
          (progress) => {
            if (!abort.signal.aborted)
              setStatus(
                `Compactando: tentativa ${progress.attempt}/${progress.total}, imagem ${progress.done}/${progress.images}`,
              );
          },
        );
        abort.signal.throwIfAborted();
        setResult(prepared.result);
        setImages(prepared.preview);
      } else {
        const pending = await window.api.tasks.load(id);
        abort.signal.throwIfAborted();
        if (pending.request.kind !== "compression" || pending.result.detail?.kind !== "compression")
          throw new Error("Resultado de compactação inválido.");
        ownTask = await beginLocalTask(
          { ...pending.request, destination: undefined },
          abort.signal,
          report,
        );
        task.current = ownTask;
        await ownTask.ready(pending.result);
        const preparedImages = await compressionResultPreview(
          pending.result,
          pending.request.defaultName,
        );
        abort.signal.throwIfAborted();
        setResult(pending.result);
        setImages(preparedImages);
      }
    })().catch((failure: unknown) => {
      if (!abort.signal.aborted)
        report(failure instanceof Error ? failure.message : "Falha ao retomar compactação.");
      ownTask?.disconnect();
    });
    return () => {
      abort.abort();
      ownTask?.disconnect();
    };
  }, [id, processing]);
  const close = () => {
    if (!saving) {
      controller.current?.abort();
      task.current?.disconnect();
      useApp.setState({ dialog: null });
    }
  };
  const detail = result?.detail?.kind === "compression" ? result.detail : null;
  const save = async () => {
    if (!task.current || !detail || !qualityAccepted || (!detail.targetMet && !acceptLarger))
      return;
    setSaving(true);
    setError("");
    try {
      const path = await task.current.save();
      if (!path) return;
      const outcome = await task.current.outcome;
      toast(
        outcome.status === "saved" && outcome.warning ? outcome.warning : "Cópia compactada salva.",
      );
      useApp.setState({ dialog: null });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Falha ao salvar cópia.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal
      title="Revisar compactação retomada"
      width={960}
      onClose={close}
      footer={
        <>
          <button type="button" className="btn ghost" disabled={saving} onClick={close}>
            Continuar depois
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={
              saving ||
              !detail ||
              !qualityAccepted ||
              (!detail.targetMet && !acceptLarger) ||
              !!error
            }
            onClick={() => void save()}
          >
            Salvar cópia revisada
          </button>
        </>
      }
    >
      <p className="muted">
        O documento aberto permanece independente desta cópia. Uma tarefa interrompida retoma o
        arquivo atual somente se os bytes corresponderem à origem escolhida; a compactação desse
        arquivo recomeça do início.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!result ? (
        <p role="status">{status}</p>
      ) : (
        <>
          <p>
            {formatSize(detail?.before ?? 0)} → <strong>{formatSize(result.bytes.length)}</strong>
            {detail?.target !== undefined && (
              <>
                {" "}
                · Meta {formatSize(detail.target)}: {detail.targetMet ? "atingida" : "não atingida"}
              </>
            )}
          </p>
          {result.warnings.map((warning) => (
            <p key={warning} className="muted">
              {warning}
            </p>
          ))}
          {images && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <figure>
                <figcaption>Original · página {images.page + 1}</figcaption>
                <img
                  src={images.original}
                  alt="Página antes da compactação"
                  style={{ width: "100%", maxHeight: 440, objectFit: "contain" }}
                />
              </figure>
              <figure>
                <figcaption>Compactado</figcaption>
                <img
                  src={images.compressed}
                  alt="Página depois da compactação"
                  style={{ width: "100%", maxHeight: 440, objectFit: "contain" }}
                />
              </figure>
            </div>
          )}
          {!images && (
            <p>
              A tarefa foi preparada sem prévia visual. Confira o arquivo salvo antes de descartar a
              origem.
            </p>
          )}
          {detail && !detail.targetMet && (
            <label className="form-row">
              <input
                type="checkbox"
                checked={acceptLarger}
                onChange={(event) => setAcceptLarger(event.target.checked)}
              />{" "}
              Aceito salvar o melhor resultado acima da meta.
            </label>
          )}
          <label className="form-row">
            <input
              type="checkbox"
              checked={qualityAccepted}
              onChange={(event) => setQualityAccepted(event.target.checked)}
            />{" "}
            Revisei o resultado e quero salvar uma cópia.
          </label>
        </>
      )}
    </Modal>
  );
}
