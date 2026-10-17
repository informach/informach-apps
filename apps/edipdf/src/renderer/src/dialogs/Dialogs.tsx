import { showModalOnMount } from "@informach/edi-desktop/renderer";
import { COMPRESS_LEVELS, formatSize } from "@shared/compress";
import { type NumberPosition, type PageNumbers, pageLabel, type Watermark } from "@shared/model";
import type { OpenedFile } from "@shared/types";
import {
  ArrowDown,
  ArrowUp,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Lock,
  Plus,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  A4,
  combineFiles,
  exportImages,
  insertBlank,
  LETTER,
  openPaths,
  splitDoc,
} from "../lib/actions";
import { type Level, mergeAndSave, type Outcome } from "../lib/compress";
import { getSource } from "../lib/pdf";
import { activeDoc, commit, type DocState, useActiveDoc, useApp } from "../state/store";
import { pageSizeAt } from "../viewer/ThumbGrid";
import { CompressDialog, LevelPicker, OutcomeRow } from "./CompressDialog";
import { SignatureDialog } from "./SignatureDialog";

const close = (): void => {
  useApp.setState({ dialog: null });
};

export function Modal({
  title,
  children,
  footer,
  width = 460,
  onClose = close,
}: {
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
  onClose?: () => void;
}): React.ReactElement {
  return (
    <dialog
      ref={showModalOnMount}
      aria-label={title}
      className="modal-backdrop"
      onKeyDown={(event) => event.stopPropagation()}
      style={{
        margin: 0,
        padding: 0,
        border: 0,
        maxWidth: "none",
        maxHeight: "none",
        width: "100vw",
        height: "100vh",
      }}
      onCancel={(event) => {
        event.preventDefault();
        if (!useApp.getState().busy || useApp.getState().dialog?.kind === "password") onClose();
      }}
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="modal" style={{ width }}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" title="Fechar" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </dialog>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <fieldset className="form-row" style={{ border: 0, padding: 0, margin: 0 }}>
      <legend>{label}</legend>
      {children}
    </fieldset>
  );
}

function CombineDialog(): React.ReactElement {
  const [files, setFiles] = useState<(OpenedFile & { id: string })[]>([]);
  const [level, setLevel] = useState<Level>("none");
  const [result, setResult] = useState<Outcome | null>(null);
  const [running, setRunning] = useState(false);
  const add = useCallback(async (): Promise<void> => {
    const picked = await window.api.openDialog({
      images: true,
      title: "Escolher arquivos para juntar",
    });
    setFiles((f) => [...f, ...picked.map((file) => ({ ...file, id: crypto.randomUUID() }))]);
  }, []);
  // Opens the file picker right away; the ref keeps StrictMode's double effect from opening two.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void add();
  }, [add]);
  const move = (i: number, d: number): void => {
    setFiles((f) => {
      const next = [...f];
      const [x] = next.splice(i, 1);
      next.splice(Math.max(0, Math.min(next.length, i + d)), 0, x);
      return next;
    });
  };
  const isImage = (f: OpenedFile): boolean => /\.(png|jpe?g)$/i.test(f.name);

  if (result) {
    return (
      <Modal
        title="PDFs juntados"
        width={540}
        footer={
          <>
            <button
              type="button"
              className="btn ghost"
              onClick={() => void window.api.showInFolder(result.path!)}
            >
              <FolderOpen size={14} /> Mostrar na pasta
            </button>
            <button
              type="button"
              className="btn ghost"
              onClick={() => {
                close();
                void openPaths([result.path!]);
              }}
            >
              Abrir no EdiPDF
            </button>
            <div className="spacer" />
            <button type="button" className="btn primary" onClick={close}>
              Concluir
            </button>
          </>
        }
      >
        <ul className="file-list">
          <OutcomeRow o={result} />
        </ul>
        <p className="muted small">
          {files.length} {files.length === 1 ? "arquivo" : "arquivos"} juntados
          {level !== "none" ? `, compactação ${COMPRESS_LEVELS[level].label.toLowerCase()}` : ""}. O
          tamanho de antes é a soma dos originais.
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      title="Juntar PDFs"
      width={560}
      footer={
        <>
          <button type="button" className="btn ghost" disabled={running} onClick={() => void add()}>
            <Plus size={14} /> Adicionar arquivos
          </button>
          <div className="spacer" />
          <button
            type="button"
            className="btn ghost"
            disabled={!files.length || running}
            title="Abre o resultado como um documento novo para revisar, organizar ou editar antes de salvar"
            onClick={() => {
              close();
              void combineFiles(files, files.every(isImage) ? "Imagens.pdf" : "Combinado.pdf");
            }}
          >
            Abrir para revisar
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!files.length || running}
            onClick={async () => {
              setRunning(true);
              const o = await mergeAndSave(files, level);
              setRunning(false);
              if (o) setResult(o);
            }}
          >
            Juntar e salvar…
          </button>
        </>
      }
    >
      <p className="muted small">
        PDFs e imagens (PNG, JPG) entram na ordem abaixo. Use as setas para mudar a ordem.
      </p>
      {files.length === 0 ? (
        <div className="empty sm">Nenhum arquivo escolhido.</div>
      ) : (
        <ol className="file-list">
          {files.map((f, i) => (
            <li key={f.id}>
              <span className="file-index">{i + 1}</span>
              {isImage(f) ? <ImageIcon size={15} /> : <FileText size={15} />}
              <span className="file-name" title={f.path}>
                {f.name}
              </span>
              <span className="muted small">{formatSize(f.bytes.length)}</span>
              <button
                type="button"
                className="icon-btn sm"
                disabled={i === 0}
                title="Subir"
                onClick={() => move(i, -1)}
              >
                <ArrowUp size={13} />
              </button>
              <button
                type="button"
                className="icon-btn sm"
                disabled={i === files.length - 1}
                title="Descer"
                onClick={() => move(i, 1)}
              >
                <ArrowDown size={13} />
              </button>
              <button
                type="button"
                className="icon-btn sm"
                title="Remover"
                onClick={() => setFiles((x) => x.filter((_, j) => j !== i))}
              >
                <X size={13} />
              </button>
            </li>
          ))}
        </ol>
      )}
      {files.length > 0 && (
        <p className="muted small">
          Total: {formatSize(files.reduce((n, f) => n + f.bytes.length, 0))}
        </p>
      )}
      <div className="field">
        <label className="check-row">
          <input
            type="checkbox"
            checked={level !== "none"}
            onChange={(e) => setLevel(e.target.checked ? "balanced" : "none")}
          />
          Compactar o resultado ao salvar
        </label>
        {level !== "none" && <LevelPicker value={level} onChange={setLevel} />}
      </div>
    </Modal>
  );
}

function WatermarkDialog({ doc }: { doc: DocState }): React.ReactElement {
  const [wm, setWm] = useState<Watermark>(
    doc.content.watermark ?? {
      text: "CONFIDENCIAL",
      size: 64,
      color: "#DC2626",
      opacity: 0.18,
      angle: 45,
    },
  );
  const set = (p: Partial<Watermark>): void => {
    setWm((w) => ({ ...w, ...p }));
  };
  return (
    <Modal
      title="Marca d'água"
      footer={
        <>
          {doc.content.watermark && (
            <button
              type="button"
              className="btn danger-outline"
              onClick={() => {
                commit(doc.id, (c) => ({ ...c, watermark: null }));
                close();
              }}
            >
              Remover
            </button>
          )}
          <div className="spacer" />
          <button type="button" className="btn ghost" onClick={close}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!wm.text.trim()}
            onClick={() => {
              commit(doc.id, (c) => ({ ...c, watermark: wm }));
              close();
            }}
          >
            Aplicar em todas as páginas
          </button>
        </>
      }
    >
      <div className="wm-preview">
        <span
          style={{
            color: wm.color,
            opacity: wm.opacity,
            transform: `rotate(${-wm.angle}deg)`,
            fontSize: Math.min(40, wm.size * 0.5),
          }}
        >
          {wm.text || " "}
        </span>
      </div>
      <Row label="Texto">
        <input className="input" value={wm.text} onChange={(e) => set({ text: e.target.value })} />
      </Row>
      <div className="form-grid">
        <Row label="Tamanho (pt)">
          <input
            className="input"
            type="number"
            min={8}
            max={200}
            value={wm.size}
            onChange={(e) => set({ size: Number(e.target.value) || 64 })}
          />
        </Row>
        <Row label="Ângulo (°)">
          <input
            className="input"
            type="number"
            min={-90}
            max={90}
            value={wm.angle}
            onChange={(e) => set({ angle: Number(e.target.value) || 0 })}
          />
        </Row>
        <Row label="Cor">
          <input
            className="input color"
            type="color"
            value={wm.color}
            onChange={(e) => set({ color: e.target.value.toUpperCase() })}
          />
        </Row>
        <Row label={`Opacidade ${Math.round(wm.opacity * 100)}%`}>
          <input
            type="range"
            min={0.05}
            max={1}
            step={0.05}
            value={wm.opacity}
            onChange={(e) => set({ opacity: Number(e.target.value) })}
          />
        </Row>
      </div>
    </Modal>
  );
}

const FORMATS = ["{n}", "Página {n}", "Página {n} de {total}", "{n} / {total}", "- {n} -"];
const POSITIONS: { v: NumberPosition; l: string }[] = [
  { v: "bottom-center", l: "Rodapé, centro" },
  { v: "bottom-right", l: "Rodapé, direita" },
  { v: "bottom-left", l: "Rodapé, esquerda" },
  { v: "top-center", l: "Cabeçalho, centro" },
  { v: "top-right", l: "Cabeçalho, direita" },
  { v: "top-left", l: "Cabeçalho, esquerda" },
];

function PageNumbersDialog({ doc }: { doc: DocState }): React.ReactElement {
  const [pn, setPn] = useState<PageNumbers>(
    doc.content.pageNumbers ?? {
      format: "Página {n} de {total}",
      position: "bottom-center",
      size: 10,
      color: "#333333",
      start: 1,
    },
  );
  const set = (p: Partial<PageNumbers>): void => {
    setPn((x) => ({ ...x, ...p }));
  };
  const total = doc.content.pages.length;
  return (
    <Modal
      title="Numerar páginas"
      footer={
        <>
          {doc.content.pageNumbers && (
            <button
              type="button"
              className="btn danger-outline"
              onClick={() => {
                commit(doc.id, (c) => ({ ...c, pageNumbers: null }));
                close();
              }}
            >
              Remover
            </button>
          )}
          <div className="spacer" />
          <button type="button" className="btn ghost" onClick={close}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              commit(doc.id, (c) => ({ ...c, pageNumbers: pn }));
              close();
            }}
          >
            Aplicar
          </button>
        </>
      }
    >
      <Row label="Formato">
        <select
          className="select"
          value={pn.format}
          onChange={(e) => set({ format: e.target.value })}
        >
          {FORMATS.map((f) => (
            <option key={f} value={f}>
              {pageLabel(pn.start, total + pn.start - 1, f)}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Posição">
        <select
          className="select"
          value={pn.position}
          onChange={(e) => set({ position: e.target.value as NumberPosition })}
        >
          {POSITIONS.map((p) => (
            <option key={p.v} value={p.v}>
              {p.l}
            </option>
          ))}
        </select>
      </Row>
      <div className="form-grid">
        <Row label="Tamanho (pt)">
          <input
            className="input"
            type="number"
            min={6}
            max={36}
            value={pn.size}
            onChange={(e) => set({ size: Number(e.target.value) || 10 })}
          />
        </Row>
        <Row label="Começar em">
          <input
            className="input"
            type="number"
            min={0}
            value={pn.start}
            onChange={(e) => set({ start: Math.max(0, Number(e.target.value) || 0) })}
          />
        </Row>
        <Row label="Cor">
          <input
            className="input color"
            type="color"
            value={pn.color}
            onChange={(e) => set({ color: e.target.value.toUpperCase() })}
          />
        </Row>
      </div>
    </Modal>
  );
}

function PropertiesDialog({ doc }: { doc: DocState }): React.ReactElement {
  const [meta, setMeta] = useState(doc.content.meta);
  useEffect(() => {
    const src = doc.primary ? getSource(doc.primary) : undefined;
    if (!src) return;
    void src.pdf.getMetadata().then(({ info }) => {
      const i = info as Record<string, unknown>;
      setMeta((m) => ({
        title: m.title ?? String(i.Title ?? ""),
        author: m.author ?? String(i.Author ?? ""),
        subject: m.subject ?? String(i.Subject ?? ""),
        keywords: m.keywords ?? String(i.Keywords ?? ""),
      }));
    });
  }, [doc.primary]);
  const field = (k: keyof typeof meta, label: string): React.ReactElement => (
    <Row label={label}>
      <input
        className="input"
        value={meta[k] ?? ""}
        onChange={(e) => setMeta((m) => ({ ...m, [k]: e.target.value }))}
      />
    </Row>
  );
  return (
    <Modal
      title="Propriedades do documento"
      footer={
        <>
          <div className="spacer" />
          <button type="button" className="btn ghost" onClick={close}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              commit(doc.id, (c) => ({ ...c, meta }));
              close();
            }}
          >
            Aplicar
          </button>
        </>
      }
    >
      {field("title", "Título")}
      {field("author", "Autor")}
      {field("subject", "Assunto")}
      {field("keywords", "Palavras-chave (separadas por vírgula)")}
    </Modal>
  );
}

function InsertBlankDialog({ doc }: { doc: DocState }): React.ReactElement {
  const [size, setSize] = useState<"same" | "a4" | "letter" | "a4l">("same");
  const [count, setCount] = useState(1);
  const [where, setWhere] = useState<"after" | "end" | "start">("after");
  const dims = {
    same: pageSizeAt(doc, doc.currentPage),
    a4: A4,
    letter: LETTER,
    a4l: { w: A4.h, h: A4.w },
  }[size];
  const at =
    where === "after" ? doc.currentPage + 1 : where === "end" ? doc.content.pages.length : 0;
  return (
    <Modal
      title="Inserir páginas em branco"
      footer={
        <>
          <div className="spacer" />
          <button type="button" className="btn ghost" onClick={close}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              insertBlank(doc.id, at, dims, count);
              close();
            }}
          >
            Inserir
          </button>
        </>
      }
    >
      <Row label="Tamanho">
        <select
          className="select"
          value={size}
          onChange={(e) => setSize(e.target.value as typeof size)}
        >
          <option value="same">Igual à página atual</option>
          <option value="a4">A4 retrato</option>
          <option value="a4l">A4 paisagem</option>
          <option value="letter">Carta</option>
        </select>
      </Row>
      <Row label="Onde">
        <select
          className="select"
          value={where}
          onChange={(e) => setWhere(e.target.value as typeof where)}
        >
          <option value="after">Depois da página {doc.currentPage + 1}</option>
          <option value="start">No início</option>
          <option value="end">No fim</option>
        </select>
      </Row>
      <Row label="Quantidade">
        <input
          className="input"
          type="number"
          min={1}
          max={100}
          value={count}
          onChange={(e) => setCount(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
        />
      </Row>
    </Modal>
  );
}

function SplitDialog({ doc }: { doc: DocState }): React.ReactElement {
  const total = doc.content.pages.length;
  const [size, setSize] = useState(Math.max(1, Math.ceil(total / 2)));
  const parts = Math.ceil(total / size);
  return (
    <Modal
      title="Dividir documento"
      footer={
        <>
          <div className="spacer" />
          <button type="button" className="btn ghost" onClick={close}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={parts < 2}
            onClick={() => {
              close();
              void splitDoc(doc.id, size);
            }}
          >
            Escolher pasta e dividir
          </button>
        </>
      }
    >
      <Row label="Páginas por arquivo">
        <input
          className="input"
          type="number"
          min={1}
          max={total}
          value={size}
          onChange={(e) => setSize(Math.max(1, Math.min(total, Number(e.target.value) || 1)))}
        />
      </Row>
      <p className="muted small">
        {parts < 2
          ? "Com esse valor o documento não é dividido."
          : `Gera ${parts} arquivos a partir das ${total} páginas, com anotações incluídas.`}{" "}
        Para separar páginas específicas, selecione-as em Organizar e use Extrair.
      </p>
    </Modal>
  );
}

function ExportImagesDialog({ doc }: { doc: DocState }): React.ReactElement {
  const hasSel = doc.selection.length > 0;
  const [which, setWhich] = useState<"sel" | "current" | "all">(hasSel ? "sel" : "current");
  const [format, setFormat] = useState<"png" | "jpg">("png");
  const [dpi, setDpi] = useState(150);
  const ids =
    which === "sel"
      ? doc.selection
      : which === "current"
        ? [doc.content.pages[doc.currentPage]?.id].filter(Boolean)
        : doc.content.pages.map((p) => p.id);
  return (
    <Modal
      title="Exportar como imagens"
      footer={
        <>
          <div className="spacer" />
          <button type="button" className="btn ghost" onClick={close}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={!ids.length}
            onClick={() => {
              close();
              void exportImages(doc.id, ids, format, dpi);
            }}
          >
            Exportar {ids.length} {ids.length === 1 ? "página" : "páginas"}
          </button>
        </>
      }
    >
      <Row label="Páginas">
        <select
          className="select"
          value={which}
          onChange={(e) => setWhich(e.target.value as typeof which)}
        >
          {hasSel && <option value="sel">Selecionadas ({doc.selection.length})</option>}
          <option value="current">Página atual ({doc.currentPage + 1})</option>
          <option value="all">Todas ({doc.content.pages.length})</option>
        </select>
      </Row>
      <div className="form-grid">
        <Row label="Formato">
          <select
            className="select"
            value={format}
            onChange={(e) => setFormat(e.target.value as typeof format)}
          >
            <option value="png">PNG (sem perdas)</option>
            <option value="jpg">JPG (menor)</option>
          </select>
        </Row>
        <Row label="Resolução">
          <select className="select" value={dpi} onChange={(e) => setDpi(Number(e.target.value))}>
            <option value={72}>72 dpi (tela)</option>
            <option value={150}>150 dpi</option>
            <option value={300}>300 dpi (impressão)</option>
          </select>
        </Row>
      </div>
    </Modal>
  );
}

function PasswordDialog({
  name,
  retry,
  resolve,
}: {
  name: string;
  retry: boolean;
  resolve: (pw: string | null) => void;
}): React.ReactElement {
  const [pw, setPw] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  return (
    <Modal
      title="PDF protegido por senha"
      width={400}
      onClose={() => resolve(null)}
      footer={
        <>
          <div className="spacer" />
          <button type="button" className="btn ghost" onClick={() => resolve(null)}>
            Cancelar
          </button>
          <button type="button" className="btn primary" disabled={!pw} onClick={() => resolve(pw)}>
            Abrir
          </button>
        </>
      }
    >
      <p className="pw-head">
        <Lock size={16} /> <strong>{name}</strong>
      </p>
      {retry && <p className="error-text">Senha incorreta. Tente de novo.</p>}
      <input
        ref={input}
        className="input"
        type="password"
        placeholder="Senha"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && pw && resolve(pw)}
      />
    </Modal>
  );
}

export function DialogHost(): React.ReactElement | null {
  const dialog = useApp((s) => s.dialog);
  const doc = useActiveDoc();
  if (!dialog) return null;
  switch (dialog.kind) {
    case "combine":
      return <CombineDialog />;
    case "compress":
      return <CompressDialog mode={dialog.mode} />;
    case "password":
      return <PasswordDialog name={dialog.name} retry={dialog.retry} resolve={dialog.resolve} />;
    case "signature":
      return doc ? <SignatureDialog /> : null;
  }
  const d = doc ?? activeDoc();
  if (!d) return null;
  switch (dialog.kind) {
    case "watermark":
      return <WatermarkDialog doc={d} />;
    case "pageNumbers":
      return <PageNumbersDialog doc={d} />;
    case "properties":
      return <PropertiesDialog doc={d} />;
    case "insertBlank":
      return <InsertBlankDialog doc={d} />;
    case "split":
      return <SplitDialog doc={d} />;
    case "exportImages":
      return <ExportImagesDialog doc={d} />;
  }
}
