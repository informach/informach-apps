import { withRenderKeys } from "@informach/edi-desktop/renderer";
import { COMPRESS_LEVELS, type CompressLevel, formatSize } from "@shared/compress";
import type { OpenedFile } from "@shared/types";
import { CheckCircle2, FileText, FolderOpen, Plus, X, XCircle } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { compressDoc, compressFiles, type Outcome } from "../lib/compress";
import type { CompressionPreview } from "../lib/compression-task";
import { chooseFiles } from "../lib/file-picker";
import { useActiveDoc, useApp } from "../state/store";
import { Modal } from "./Dialogs";

const close = (): void => {
  useApp.setState({ dialog: null });
};

export function LevelPicker({
  value,
  onChange,
}: {
  value: CompressLevel;
  onChange: (l: CompressLevel) => void;
}): React.ReactElement {
  const groupName = useId();
  return (
    <div className="levels" role="radiogroup" aria-label="Nível de compactação">
      {(Object.keys(COMPRESS_LEVELS) as CompressLevel[]).map((k) => (
        <label key={k} className={`level${value === k ? " on" : ""}`}>
          <input
            type="radio"
            name={groupName}
            value={k}
            checked={value === k}
            onChange={() => onChange(k)}
            aria-label={COMPRESS_LEVELS[k].label}
            style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
          />
          <span className="level-title">
            {COMPRESS_LEVELS[k].label}
            {k === "balanced" && <span className="pill">recomendado</span>}
          </span>
          <span className="level-hint">{COMPRESS_LEVELS[k].hint}</span>
        </label>
      ))}
    </div>
  );
}

export function OutcomeRow({ o }: { o: Outcome }): React.ReactElement {
  const saved = o.before > 0 ? Math.round((1 - o.after / o.before) * 100) : 0;
  return (
    <li className={`outcome${o.error ? " failed" : ""}`}>
      {o.error ? <XCircle size={15} /> : <CheckCircle2 size={15} />}
      <span className="file-name" title={o.path ?? o.name}>
        {o.path ? o.path.split(/[\\/]/).pop() : o.name}
      </span>
      {o.error ? (
        <span className="outcome-note">{o.error}</span>
      ) : (
        <span className="outcome-note">
          {formatSize(o.before)} → <strong>{formatSize(o.after)}</strong>{" "}
          {o.target !== undefined && (
            <span className="muted small">
              {" "}
              · {o.targetMet ? "meta atingida" : "acima da meta"} de {formatSize(o.target)} ·{" "}
            </span>
          )}
          {saved > 0 ? (
            <span className="saved">−{saved}%</span>
          ) : (
            <span className="muted">já estava otimizado</span>
          )}
          {o.warnings?.map((warning) => (
            <span key={warning} className="compression-warning">
              {warning}
            </span>
          ))}
        </span>
      )}
    </li>
  );
}

/** "Compactar PDF": the open document (saved as a copy) or a batch of files from disk. */
export function CompressDialog({ mode }: { mode: "doc" | "files" }): React.ReactElement {
  const doc = useActiveDoc();
  const [level, setLevel] = useState<CompressLevel>("balanced");
  const [files, setFiles] = useState<OpenedFile[]>([]);
  const [results, setResults] = useState<Outcome[] | null>(null);
  const [running, setRunning] = useState(false);
  const [targetEnabled, setTargetEnabled] = useState(false);
  const [targetMb, setTargetMb] = useState(5);
  const [acceptLarger, setAcceptLarger] = useState(false);
  const [error, setError] = useState("");
  const [cancelled, setCancelled] = useState(false);
  const [reviewQuality, setReviewQuality] = useState(true);
  const [previewPage, setPreviewPage] = useState(mode === "doc" ? (doc?.currentPage ?? 0) : 0);
  const [preview, setPreview] = useState<{
    name: string;
    original: string;
    compressed: string;
    before: number;
    after: number;
    warnings: string[];
    page: number;
    resolve: (accepted: boolean) => void;
  } | null>(null);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const closeJob = () => {
    controller.current?.abort();
    close();
  };
  const add = useCallback(async (): Promise<void> => {
    const picked = await chooseFiles({ title: "Escolher PDFs para compactar" });
    setFiles((f) => [...f, ...picked.filter((p) => !f.some((x) => x.path === p.path))]);
  }, []);
  // Opens the picker right away in batch mode; the ref keeps StrictMode from opening two.
  const started = useRef(false);
  useEffect(() => {
    if (mode !== "files" || started.current) return;
    started.current = true;
    void add();
  }, [mode, add]);

  const run = async (): Promise<void> => {
    if (running) return;
    const target = targetEnabled ? Math.round(targetMb * 1024 * 1024) : undefined;
    if (
      target !== undefined &&
      (!Number.isInteger(target) || target < 1024 || target > 512 * 1024 * 1024)
    ) {
      setError("Informe uma meta entre 0,001 e 512 MB.");
      return;
    }
    const abort = new AbortController();
    controller.current = abort;
    const review = async (
      name: string,
      original: Uint8Array,
      result: Uint8Array,
      warnings: string[],
      prepared?: CompressionPreview,
      taskSignal?: AbortSignal,
    ): Promise<boolean> => {
      if (!reviewQuality) return true;
      const reviewSignal = taskSignal ? AbortSignal.any([abort.signal, taskSignal]) : abort.signal;
      reviewSignal.throwIfAborted();
      if (!prepared) throw new Error("A tarefa não preparou a prévia de qualidade.");
      /* Preview bytes are protected before the review waits for the user. */
      const first = prepared.original,
        second = prepared.compressed,
        sample = prepared.page;
      reviewSignal.throwIfAborted();
      return new Promise<boolean>((resolve) => {
        const accept = (accepted: boolean) => {
          reviewSignal.removeEventListener("abort", cancel);
          setPreview(null);
          resolve(accepted);
        };
        const cancel = () => accept(false);
        reviewSignal.addEventListener("abort", cancel, { once: true });
        setPreview({
          name,
          original: first,
          compressed: second,
          before: original.length,
          after: result.length,
          warnings,
          page: sample + 1,
          resolve: accept,
        });
      });
    };
    const options = {
      target,
      signal: abort.signal,
      acceptLarger,
      previewPage,
      review: reviewQuality ? review : undefined,
    };
    setError("");
    setCancelled(false);
    setRunning(true);
    try {
      if (mode === "doc") {
        if (!doc) return;
        const o = await compressDoc(doc.id, level, options);
        if (o) setResults([o]);
      } else {
        const acc: Outcome[] = [];
        await compressFiles(
          files,
          level,
          (o) => {
            acc.push(o);
            setResults([...acc]);
          },
          options,
        );
      }
    } catch (failure) {
      if (!abort.signal.aborted)
        setError(failure instanceof Error ? failure.message : "Falha na compactação.");
    } finally {
      setRunning(false);
      setCancelled(abort.signal.aborted);
    }
  };

  const firstPath = results?.find((r) => r.path)?.path;
  if (preview)
    return (
      <Modal
        title="Revisar compactação"
        allowCancelWhileBusy
        width={1000}
        onClose={closeJob}
        footer={
          <>
            <span>
              {formatSize(preview.before)} → {formatSize(preview.after)}
            </span>
            <div className="spacer" />
            <button type="button" className="btn ghost" onClick={closeJob}>
              Continuar depois
            </button>
            <button type="button" className="btn ghost" onClick={() => preview.resolve(false)}>
              Descartar esta cópia
            </button>
            <button type="button" className="btn primary" onClick={() => preview.resolve(true)}>
              Salvar cópia revisada
            </button>
          </>
        }
      >
        <p>
          {preview.name} · comparação da página {preview.page}. Examine o resultado completo antes
          de compartilhar.
        </p>
        <div className="compression-preview">
          <figure>
            <figcaption>Original</figcaption>
            <img src={preview.original} alt="Página original" />
          </figure>
          <figure>
            <figcaption>Compactado</figcaption>
            <img src={preview.compressed} alt="Página compactada" />
          </figure>
        </div>
        {preview.warnings.map((warning) => (
          <p className="muted small" key={warning}>
            {warning}
          </p>
        ))}
      </Modal>
    );
  if (results) {
    const ok = results.filter((r) => !r.error);
    const before = ok.reduce((n, r) => n + r.before, 0);
    const after = ok.reduce((n, r) => n + r.after, 0);
    return (
      <Modal
        title={
          running
            ? "Compactando PDFs"
            : cancelled
              ? "Compactação cancelada"
              : "Resultado da compactação"
        }
        width={560}
        allowCancelWhileBusy
        onClose={closeJob}
        footer={
          <>
            {firstPath && (
              <button
                type="button"
                className="btn ghost"
                onClick={() => void window.api.showInFolder(firstPath)}
              >
                <FolderOpen size={14} /> Mostrar na pasta
              </button>
            )}
            <div className="spacer" />
            {!running && (
              <button type="button" className="btn ghost" onClick={() => setResults(null)}>
                Ajustar e tentar novamente
              </button>
            )}
            <button
              type="button"
              className="btn primary"
              onClick={() => (running ? controller.current?.abort() : closeJob())}
            >
              {running ? "Cancelar restantes" : "Concluir"}
            </button>
          </>
        }
      >
        {running && (
          <p role="status">
            {results.length} de {files.length} arquivos processados…
          </p>
        )}
        {cancelled && (
          <p role="status">
            Processamento interrompido. Cópias já salvas foram preservadas; arquivos restantes não
            foram processados.
          </p>
        )}
        {ok.length > 1 && (
          <p className="outcome-total">
            Total: {formatSize(before)} → <strong>{formatSize(after)}</strong>
            {before > after && (
              <span className="saved"> −{Math.round((1 - after / before) * 100)}%</span>
            )}
          </p>
        )}
        <ul className="file-list">
          {withRenderKeys(results, (outcome) => outcome.path ?? outcome.name).map(
            ({ key, value: o }) => (
              <OutcomeRow key={key} o={o} />
            ),
          )}
        </ul>
        {mode === "files" && ok.length > 0 && (
          <p className="muted small">
            As cópias foram salvas na pasta escolhida, com “(compactado)” no nome. Os originais não
            foram alterados.
          </p>
        )}
      </Modal>
    );
  }

  return (
    <Modal
      title="Compactar PDF"
      allowCancelWhileBusy
      width={560}
      onClose={closeJob}
      footer={
        <>
          {mode === "files" && (
            <button
              type="button"
              className="btn ghost"
              disabled={running}
              onClick={() => void add()}
            >
              <Plus size={14} /> Adicionar PDFs
            </button>
          )}
          <div className="spacer" />
          <button
            type="button"
            className="btn ghost"
            onClick={() => (running ? controller.current?.abort() : closeJob())}
          >
            {running ? "Cancelar operação" : "Cancelar"}
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={running || (mode === "files" ? !files.length : !doc)}
            onClick={() => void run()}
          >
            {mode === "doc"
              ? "Compactar e salvar cópia…"
              : `Compactar ${files.length > 1 ? `${files.length} arquivos` : ""}`}
          </button>
        </>
      }
    >
      <p className="muted small">
        Reduz o tamanho diminuindo a resolução e a qualidade das imagens e removendo dados que não
        são usados. Texto, links e formulários continuam iguais.
      </p>
      <LevelPicker value={level} onChange={setLevel} />
      {mode === "doc" && doc && (
        <label className="local-field">
          Página da prévia
          <input
            className="input"
            type="number"
            min={1}
            max={doc.content.pages.length}
            disabled={running}
            value={previewPage + 1}
            onChange={(event) => {
              const index = event.target.valueAsNumber - 1;
              if (Number.isInteger(index) && index >= 0 && index < doc.content.pages.length)
                setPreviewPage(index);
            }}
          />
        </label>
      )}
      <label className="check-row">
        <input
          type="checkbox"
          disabled={running}
          checked={reviewQuality}
          onChange={(event) => setReviewQuality(event.target.checked)}
        />
        Revisar uma prévia de qualidade antes de salvar cada cópia
      </label>
      <label className="check-row">
        <input
          type="checkbox"
          disabled={running}
          checked={targetEnabled}
          onChange={(event) => setTargetEnabled(event.target.checked)}
        />
        Buscar um tamanho máximo por arquivo
      </label>
      {targetEnabled && (
        <div className="ocr-settings">
          <label>
            Meta (MB)
            <input
              className="input"
              type="number"
              min={0.001}
              max={512}
              step={0.1}
              disabled={running}
              value={targetMb}
              onChange={(event) => setTargetMb(event.target.valueAsNumber)}
            />
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              disabled={running}
              checked={acceptLarger}
              onChange={(event) => setAcceptLarger(event.target.checked)}
            />
            Salvar o melhor resultado mesmo acima da meta
          </label>
          <p className="muted small">
            O nível escolhido define a qualidade mínima. A meta pode ser impossível sem reduzir mais
            a qualidade ou remover conteúdo. Imagens com transparência/perfis não suportados são
            preservadas.
          </p>
        </div>
      )}
      {running && <p role="status">Compactando no dispositivo…</p>}
      {cancelled && (
        <p role="status">Compactação cancelada; nenhum arquivo em andamento foi salvo.</p>
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {mode === "doc" && doc && (
        <div className="compress-target">
          <FileText size={15} />
          <span className="file-name">{doc.name}</span>
          <span className="muted small">uma cópia é salva; o documento aberto não muda</span>
        </div>
      )}
      {mode === "files" &&
        (files.length === 0 ? (
          <div className="empty sm">Nenhum PDF escolhido.</div>
        ) : (
          <ul className="file-list">
            {files.map((f, i) => (
              <li key={f.path}>
                <FileText size={15} />
                <span className="file-name" title={f.path}>
                  {f.name}
                </span>
                <span className="muted small">{formatSize(f.bytes.length)}</span>
                <button
                  type="button"
                  className="icon-btn sm"
                  title="Remover"
                  disabled={running}
                  onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}
                >
                  <X size={13} />
                </button>
              </li>
            ))}
          </ul>
        ))}
    </Modal>
  );
}
