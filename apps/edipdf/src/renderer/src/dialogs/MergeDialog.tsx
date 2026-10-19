import { COMPRESS_LEVELS, type CompressLevel, formatSize } from "@shared/compress";
import { compressionSettingsSchema } from "@shared/compression-task-format";
import { mergeRequestSchema } from "@shared/merge-format";
import type { TaskResult } from "@shared/task-format";
import type { OpenedFile } from "@shared/types";
import { ArrowDown, ArrowUp, FileText, Image as ImageIcon, Plus, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { combineFiles, openConvertedPdf } from "../lib/actions";
import { runCompression } from "../lib/compression";
import { chooseFiles } from "../lib/file-picker";
import { mergeLocal } from "../lib/merge";
import { loadSource, releaseSource, renderReviewPage } from "../lib/pdf";
import { beginLocalTask, type LocalTask } from "../lib/tasks";
import { toast, useApp } from "../state/store";
import { ReviewImage } from "../ui/ReviewImage";
import { Modal } from "./Dialogs";

const message = (failure: unknown) =>
  failure instanceof Error ? failure.message : "Falha ao juntar arquivos.";
export function MergeDialog(): React.ReactElement {
  const [selection, setSelection] = useState<{
      files: (OpenedFile & { id: string })[];
      error: string;
    }>({ files: [], error: "" }),
    [level, setLevel] = useState<CompressLevel | "none">("none"),
    [prepared, setPrepared] = useState<TaskResult | null>(null),
    [running, setRunning] = useState(false),
    [saving, setSaving] = useState(false),
    [progress, setProgress] = useState(""),
    [error, setError] = useState(""),
    [preview, setPreview] = useState(""),
    [page, setPage] = useState(0),
    [limited, setLimited] = useState(false);
  const controller = useRef<AbortController | null>(null),
    task = useRef<LocalTask | null>(null),
    mounted = useRef(true),
    detached = useRef(false),
    started = useRef(false),
    origins = useRef<string[]>([]);
  const files = selection.files;
  const report = useCallback((value: string) => {
    if (mounted.current) setError(value);
    else if (detached.current) toast(value, { tone: "error", ms: 10000 });
  }, []);
  const add = useCallback(async () => {
    try {
      const selected = await chooseFiles({ images: true, title: "Escolher arquivos para juntar" });
      if (mounted.current) {
        const added = selected.map((file) => ({ ...file, id: crypto.randomUUID() }));
        setSelection((previous) => {
          const files = [...previous.files, ...added];
          return files.length > 100 ||
            files.reduce((sum, file) => sum + file.bytes.length, 0) > 512 * 1024 * 1024
            ? {
                ...previous,
                error:
                  "A seleção completa aceita até cem arquivos/512 MB. Reduza a próxima seleção; nenhum arquivo novo foi acrescentado.",
              }
            : { files, error: "" };
        });
      }
    } catch (failure) {
      report(message(failure));
    }
  }, [report]);
  useEffect(() => {
    mounted.current = true;
    if (!started.current) {
      started.current = true;
      void add();
    }
    return () => {
      mounted.current = false;
      if (!detached.current) {
        controller.current?.abort();
        task.current?.disconnect();
      }
    };
  }, [add]);
  useEffect(() => {
    setPreview("");
    if (!prepared) return;
    const abort = new AbortController();
    let sourceId: string | undefined;
    void (async () => {
      const source = await loadSource(prepared.pdf, "Combinado.pdf", () => Promise.resolve(null), {
        output: true,
      });
      sourceId = source.id;
      const image = await renderReviewPage(
        { id: "merge-preview", src: source.id, index: page, rotation: 0 },
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
  }, [prepared, page, report]);
  const close = () => {
    if (saving) return;
    controller.current?.abort();
    task.current?.disconnect();
    useApp.setState({ dialog: null });
  };
  const move = (index: number, delta: number) =>
    setSelection((previous) => {
      const items = [...previous.files],
        target = index + delta,
        current = items[index];
      if (!current || target < 0 || target >= items.length) return previous;
      items.splice(index, 1);
      items.splice(target, 0, current);
      return { files: items, error: "" };
    });
  const prepare = async () => {
    if (running || !files.length) return;
    task.current?.disconnect();
    task.current = null;
    const abort = new AbortController();
    controller.current = abort;
    setRunning(true);
    setError("");
    setSelection((previous) => ({ ...previous, error: "" }));
    setProgress("Aguardando a fila local…");
    try {
      const input = mergeRequestSchema.parse({
        files: files.map(({ name, bytes }) => ({ name, bytes })),
      });
      origins.current = files.map((file) => file.path);
      const active = await beginLocalTask(
        {
          id: crypto.randomUUID(),
          kind: "conversion",
          extension: "pdf",
          label: "Junção de PDFs",
          defaultName: "Combinado.pdf",
          inputBytes: input.files.reduce((sum, file) => sum + file.bytes.length, 0),
          originPaths: origins.current,
        },
        abort.signal,
        report,
      );
      task.current = active;
      const update = (value: string) => {
        active.describe(value);
        if (mounted.current) setProgress(value);
      };
      const merged = await mergeLocal(input, active.signal, update);
      const output =
        level === "none"
          ? { ...merged, warnings: [] }
          : await runCompression(merged.bytes, level, {
              signal: active.signal,
              progress: (value) =>
                update(`Compactando PDF combinado · ${value.done}/${value.images} imagens`),
            });
      const result: TaskResult = {
        bytes: output.bytes,
        pdf: output.bytes,
        pages: output.pages,
        extension: "pdf",
        warnings: output.warnings,
      };
      await active.ready(result);
      if (detached.current) {
        active.disconnect();
        toast("PDF combinado pronto para revisar em Tarefas.", { ms: 10000 });
      } else if (mounted.current) {
        setPrepared(result);
        setSelection({ files: [], error: "" });
        setPage(0);
      }
    } catch (failure) {
      if (
        !(failure instanceof DOMException && failure.name === "AbortError") &&
        !abort.signal.aborted &&
        !task.current?.signal.aborted
      )
        report(message(failure));
      task.current?.disconnect();
    } finally {
      if (mounted.current) setRunning(false);
    }
  };
  const accept = async (open: boolean) => {
    const active = task.current;
    if (!active || !prepared) return;
    setRunning(true);
    setSaving(true);
    setError("");
    try {
      if (open) {
        await openConvertedPdf(prepared.bytes, "Combinado.pdf", origins.current, {
          signal: active.signal,
          beforeCommit: () => active.check(),
        });
        active.disconnect();
        toast("PDF combinado aberto. A cópia preparada continua disponível em Tarefas.");
      } else {
        const destination = await active.save();
        if (!destination) return;
        const outcome = await active.outcome;
        if (outcome.status === "saved" && outcome.warning)
          toast(outcome.warning, { tone: "error", ms: 10000 });
        toast("PDF combinado salvo como cópia.", {
          action: {
            label: "Mostrar na pasta",
            run: () => void window.api.showInFolder(destination),
          },
        });
      }
      controller.current?.abort();
      useApp.setState({ dialog: null });
    } catch (failure) {
      report(message(failure));
    } finally {
      if (mounted.current) {
        setRunning(false);
        setSaving(false);
      }
    }
  };
  return (
    <Modal
      title="Juntar PDFs"
      width={prepared ? 860 : 640}
      onClose={close}
      allowCancelWhileBusy
      footer={
        <>
          <button type="button" className="btn ghost" disabled={saving} onClick={close}>
            {running ? "Interromper junção" : "Fechar"}
          </button>
          {running && !saving && (
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
          {!prepared ? (
            <>
              <button
                type="button"
                className="btn ghost"
                disabled={running}
                onClick={() => void add()}
              >
                <Plus size={14} />
                Adicionar arquivos
              </button>
              <button
                type="button"
                className="btn ghost"
                disabled={!files.length || running}
                onClick={() => {
                  useApp.setState({ dialog: null });
                  void combineFiles(
                    files,
                    files.every((file) => /\.(?:png|jpe?g)$/i.test(file.name))
                      ? "Imagens.pdf"
                      : "Combinado.pdf",
                  );
                }}
              >
                Abrir origens para editar
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={!files.length || running}
                onClick={() => void prepare()}
              >
                Preparar PDF combinado
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn"
                disabled={running || !preview}
                onClick={() => void accept(true)}
              >
                Abrir PDF para revisar
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={running || !preview}
                onClick={() => void accept(false)}
              >
                Salvar cópia combinada
              </button>
            </>
          )}
        </>
      }
    >
      {!prepared ? (
        <>
          <p className="muted">
            Arquivos de disco entram na ordem abaixo. Alterações ainda não salvas de documentos
            abertos não entram nesta junção. Até cem arquivos/512 MB de entrada e mil páginas/64 MB
            de resultado.
          </p>
          <ol className="file-list">
            {files.map((file, index) => (
              <li key={file.id}>
                <span className="file-index">{index + 1}</span>
                {/\.(?:png|jpe?g)$/i.test(file.name) ? (
                  <ImageIcon size={15} />
                ) : (
                  <FileText size={15} />
                )}
                <span className="file-name" title={file.path}>
                  {file.name}
                </span>
                <span className="muted small">{formatSize(file.bytes.length)}</span>
                <button
                  type="button"
                  className="icon-btn sm"
                  title="Subir"
                  disabled={running || index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp size={13} />
                </button>
                <button
                  type="button"
                  className="icon-btn sm"
                  title="Descer"
                  disabled={running || index === files.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown size={13} />
                </button>
                <button
                  type="button"
                  className="icon-btn sm"
                  title="Remover arquivo"
                  disabled={running}
                  onClick={() =>
                    setSelection((previous) => ({
                      files: previous.files.filter((item) => item.id !== file.id),
                      error: "",
                    }))
                  }
                >
                  <X size={13} />
                </button>
              </li>
            ))}
          </ol>
          <label className="form-row">
            Compactação
            <select
              className="select"
              aria-label="Compactação"
              disabled={running}
              value={level}
              onChange={(event) => {
                const value = event.target.value;
                if (value === "none") setLevel(value);
                else {
                  const parsed = compressionSettingsSchema.shape.level.safeParse(value);
                  if (parsed.success) setLevel(parsed.data);
                }
              }}
            >
              <option value="none">Sem compactação</option>
              {compressionSettingsSchema.shape.level.options.map((value) => (
                <option key={value} value={value}>
                  {COMPRESS_LEVELS[value].label}
                </option>
              ))}
            </select>
          </label>
          <p className="muted small">
            Interromper antes do resultado completo preserva as origens e exige reiniciar a junção.
            Resultados prontos ficam protegidos em Tarefas para revisão.
          </p>
        </>
      ) : (
        <>
          <p>
            Combinado.pdf · {prepared.pages} páginas · {formatSize(prepared.bytes.length)}
          </p>
          {prepared.warnings.map((warning) => (
            <p className="muted" key={warning}>
              {warning}
            </p>
          ))}
          <label className="form-row">
            Página da prévia
            <input
              className="input"
              type="number"
              min={1}
              max={prepared.pages}
              value={page + 1}
              onChange={(event) =>
                setPage(
                  Math.max(0, Math.min(prepared.pages - 1, Number(event.target.value) - 1 || 0)),
                )
              }
            />
          </label>
          {preview ? (
            <ReviewImage
              src={preview}
              alt={`Prévia do PDF combinado, página ${page + 1}`}
              limited={limited}
            />
          ) : (
            <p role="status">Carregando prévia do PDF combinado…</p>
          )}
        </>
      )}
      {running && <p role="status">{progress}</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {selection.error && (
        <p role="alert" className="error">
          {selection.error}
        </p>
      )}
    </Modal>
  );
}
