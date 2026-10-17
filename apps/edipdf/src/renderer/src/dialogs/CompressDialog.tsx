import { withRenderKeys } from "@informach/edi-desktop/renderer";
import { COMPRESS_LEVELS, type CompressLevel, formatSize } from "@shared/compress";
import type { OpenedFile } from "@shared/types";
import { CheckCircle2, FileText, FolderOpen, Plus, X, XCircle } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { compressDoc, compressFiles, type Outcome } from "../lib/compress";
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
          {saved > 0 ? (
            <span className="saved">−{saved}%</span>
          ) : (
            <span className="muted">já estava otimizado</span>
          )}
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
  const add = useCallback(async (): Promise<void> => {
    const picked = await window.api.openDialog({ title: "Escolher PDFs para compactar" });
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
    setRunning(true);
    try {
      if (mode === "doc") {
        if (!doc) return;
        const o = await compressDoc(doc.id, level);
        if (o) setResults([o]);
      } else {
        const acc: Outcome[] = [];
        await compressFiles(files, level, (o) => {
          acc.push(o);
          setResults([...acc]);
        });
      }
    } finally {
      setRunning(false);
    }
  };

  const firstPath = results?.find((r) => r.path)?.path;
  if (results) {
    const ok = results.filter((r) => !r.error);
    const before = ok.reduce((n, r) => n + r.before, 0);
    const after = ok.reduce((n, r) => n + r.after, 0);
    return (
      <Modal
        title="Compactação concluída"
        width={560}
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
            <button type="button" className="btn primary" onClick={close}>
              Concluir
            </button>
          </>
        }
      >
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
            As cópias foram salvas ao lado dos originais, com “(compactado)” no nome. Os originais
            não foram alterados.
          </p>
        )}
      </Modal>
    );
  }

  return (
    <Modal
      title="Compactar PDF"
      width={560}
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
          <button type="button" className="btn ghost" onClick={close}>
            Cancelar
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
