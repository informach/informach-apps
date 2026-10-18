import { showModalOnMount } from "@informach/edi-desktop/renderer";
import { Lock, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { A4, insertBlank, LETTER } from "../lib/actions";
import { getSource } from "../lib/pdf";
import { activeDoc, commit, type DocState, useActiveDoc, useApp } from "../state/store";
import { pageSizeAt } from "../viewer/ThumbGrid";
import { AnnotationsDialog } from "./AnnotationsDialog";
import { BatchDialog } from "./BatchDialog";
import { CommandPalette } from "./CommandPalette";
import { CompressDialog } from "./CompressDialog";
import { CompressionResumeDialog } from "./CompressionResumeDialog";
import { ConversionDialog } from "./ConversionDialog";
import { FormsDialog } from "./FormsDialog";
import { LocalToolsDialog } from "./LocalToolsDialog";
import { MergeDialog } from "./MergeDialog";
import { NavigationDialog } from "./NavigationDialog";
import { OcrDialog } from "./OcrDialog";
import { PageDecorationsDialog } from "./PageDecorationsDialog";
import { ParagraphDialog } from "./ParagraphDialog";
import { PreferencesDialog } from "./PreferencesDialog";
import { PrintDialog } from "./PrintDialog";
import { ScannerDialog } from "./ScannerDialog";
import { SearchRedactionDialog } from "./SearchRedactionDialog";
import { SignatureDialog } from "./SignatureDialog";
import { TasksDialog } from "./TasksDialog";
import { VersionsDialog } from "./VersionsDialog";

const close = (): void => {
  useApp.setState({ dialog: null });
};

export function Modal({
  title,
  children,
  footer,
  width = 460,
  onClose = close,
  allowCancelWhileBusy = false,
}: {
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
  onClose?: () => void;
  allowCancelWhileBusy?: boolean;
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
        if (allowCancelWhileBusy || !useApp.getState().busy || useApp.getState().passwordPrompt)
          onClose();
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

function PrimaryDialog(): React.ReactElement | null {
  const dialog = useApp((s) => s.dialog);
  const doc = useActiveDoc();
  if (!dialog) return null;
  switch (dialog.kind) {
    case "batch":
      return <BatchDialog resumeId={dialog.taskId} />;
    case "scanning":
      return <ScannerDialog resumeId={dialog.taskId} />;
    case "printing":
      return (
        <PrintDialog
          doc={dialog.taskId ? undefined : (doc ?? undefined)}
          resumeId={dialog.taskId}
        />
      );
    case "conversion":
      return (
        <ConversionDialog
          mode={dialog.mode}
          doc={doc ?? undefined}
          resumeId={dialog.mode === "resume" ? dialog.taskId : undefined}
        />
      );
    case "tasks":
      return <TasksDialog />;
    case "ocr":
      return dialog.taskId || doc ? (
        <OcrDialog doc={doc ?? undefined} resumeId={dialog.taskId} />
      ) : null;
    case "commands":
      return <CommandPalette />;
    case "preferences":
      return <PreferencesDialog />;
    case "versions":
      return <VersionsDialog />;
    case "combine":
      return <MergeDialog />;
    case "compress":
      return <CompressDialog mode={dialog.mode} />;
    case "compressionResume":
      return <CompressionResumeDialog id={dialog.taskId} processing={dialog.processing} />;
    case "password":
      return <PasswordDialog name={dialog.name} retry={dialog.retry} resolve={dialog.resolve} />;
    case "signature":
      return doc ? <SignatureDialog /> : null;
  }
  const d = doc ?? activeDoc();
  if (!d) return null;
  switch (dialog.kind) {
    case "paragraph":
      return <ParagraphDialog doc={d} annotId={dialog.annotId} initialText={dialog.initialText} />;
    case "redactSearch":
      return <SearchRedactionDialog doc={d} />;
    case "navigation":
      return <NavigationDialog doc={d} />;
    case "forms":
      return <FormsDialog doc={d} />;
    case "annotations":
      return <AnnotationsDialog doc={d} />;
    case "localTools":
      return <LocalToolsDialog doc={d} spec={dialog} />;
    case "watermark":
      return <PageDecorationsDialog doc={d} mode="watermark" />;
    case "pageNumbers":
      return <PageDecorationsDialog doc={d} mode="pageNumbers" />;
    case "properties":
      return <PropertiesDialog doc={d} />;
    case "insertBlank":
      return <InsertBlankDialog doc={d} />;
    case "split":
      return <BatchDialog doc={d} operation="split" />;
    case "exportImages":
      return <BatchDialog doc={d} operation="images" />;
  }
}

export function DialogHost(): React.ReactElement {
  const password = useApp((state) => state.passwordPrompt);
  return (
    <>
      <PrimaryDialog />
      {password && (
        <PasswordDialog
          key={`${password.name}:${password.retry}`}
          name={password.name}
          retry={password.retry}
          resolve={password.resolve}
        />
      )}
    </>
  );
}
