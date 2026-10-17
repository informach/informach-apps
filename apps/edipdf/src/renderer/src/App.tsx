import { registerEdiRecovery } from "@informach/edi-desktop/renderer";
import { translateAnnot, viewSize } from "@shared/model";
import { CheckCircle2, Loader2, Upload, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { DialogHost } from "./dialogs/Dialogs";
import {
  closeDoc,
  deletePages,
  droppedFiles,
  openDialog,
  openFiles,
  openPaths,
  printDoc,
  requestQuit,
  saveDoc,
} from "./lib/actions";
import { finishDraft } from "./lib/editing";
import { pageInfo } from "./lib/pdf";
import {
  activeDoc,
  commit,
  type DocState,
  isDirty,
  patchDoc,
  redo,
  removeAnnot,
  setTool,
  type Tool,
  undo,
  useActiveDoc,
  useApp,
} from "./state/store";
import { Home } from "./ui/Home";
import { MenuHost } from "./ui/Menu";
import { PropsPanel } from "./ui/PropsPanel";
import { Toolbar } from "./ui/Toolbar";
import { TopBar } from "./ui/TopBar";
import { Organize } from "./viewer/Organize";
import { runSearch } from "./viewer/SearchBar";
import { ThumbGrid } from "./viewer/ThumbGrid";
import { MAX_ZOOM, MIN_ZOOM, Viewer } from "./viewer/Viewer";

const TOOL_KEYS: Record<string, Tool> = {
  v: "select",
  h: "hand",
  t: "text",
  e: "edittext",
  r: "highlight",
  d: "ink",
  c: "note",
};

const typing = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement &&
  (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

function onKey(e: KeyboardEvent): void {
  const s = useApp.getState();
  if (s.dialog || s.busy) return;
  const doc = activeDoc(s);
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  if (mod && k === "o") {
    void (e.preventDefault(), openDialog());
    return;
  }
  if (mod && k === "tab") {
    e.preventDefault();
    if (!s.docs.length) return;
    const i = s.docs.findIndex((d) => d.id === s.activeId);
    const n = (i + (e.shiftKey ? -1 : 1) + s.docs.length) % s.docs.length;
    useApp.setState({ activeId: s.docs[n].id });
    return;
  }
  if (!doc) return;
  if (mod && k === "s") {
    e.preventDefault();
    finishDraft(doc.id);
    void saveDoc(doc.id, e.shiftKey);
    return;
  }
  if (mod && k === "p") {
    void (e.preventDefault(), finishDraft(doc.id), printDoc(doc.id));
    return;
  }
  if (mod && k === "w") {
    void (e.preventDefault(), closeDoc(doc.id));
    return;
  }
  if (mod && k === "f") {
    e.preventDefault();
    if (!doc.search) void runSearch(doc.id, "");
    else (document.querySelector(".search-bar input") as HTMLInputElement | null)?.select();
    return;
  }
  if (mod && (k === "=" || k === "+")) {
    void (e.preventDefault(),
    patchDoc(doc.id, { zoom: Math.min(MAX_ZOOM, doc.zoom * 1.2), fit: null }));
    return;
  }
  if (mod && k === "-") {
    void (e.preventDefault(),
    patchDoc(doc.id, { zoom: Math.max(MIN_ZOOM, doc.zoom / 1.2), fit: null }));
    return;
  }
  if (mod && k === "0") {
    void (e.preventDefault(), patchDoc(doc.id, { fit: "width" }));
    return;
  }
  if (typing(e.target)) return;
  if (mod && k === "z" && !e.shiftKey) {
    void (e.preventDefault(), undo(doc.id));
    return;
  }
  if (mod && (k === "y" || (k === "z" && e.shiftKey))) {
    void (e.preventDefault(), redo(doc.id));
    return;
  }
  if (mod && k === "a" && doc.view === "organize") {
    void (e.preventDefault(), patchDoc(doc.id, { selection: doc.content.pages.map((p) => p.id) }));
    return;
  }
  if (e.key === "Delete" || e.key === "Backspace") {
    if (doc.selectedAnnot) {
      void (e.preventDefault(), removeAnnot(doc.id, doc.selectedAnnot));
      return;
    }
    if (doc.view === "organize" && doc.selection.length) {
      void (e.preventDefault(), deletePages(doc.id, doc.selection));
      return;
    }
    return;
  }
  if (e.key === "Escape") {
    if (doc.openNote) {
      patchDoc(doc.id, { openNote: null });
      return;
    }
    if (doc.selectedAnnot) {
      patchDoc(doc.id, { selectedAnnot: null });
      return;
    }
    if (doc.search) {
      patchDoc(doc.id, { search: null });
      return;
    }
    if (doc.view === "organize") {
      patchDoc(doc.id, { view: "pages" });
      return;
    }
    if (s.tool !== "select") {
      setTool("select");
      return;
    }
    return;
  }
  if (doc.selectedAnnot && e.key.startsWith("Arrow")) {
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
    const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
    commit(doc.id, (c) => ({
      ...c,
      annots: c.annots.map((a) => (a.id === doc.selectedAnnot ? translateAnnot(a, dx, dy) : a)),
    }));
    return;
  }
  if (!mod && !e.altKey && TOOL_KEYS[k] && doc.view === "pages") {
    setTool(TOOL_KEYS[k]);
    return;
  }
}

function StatusBar({ doc }: { doc: DocState }): React.ReactElement {
  const page = doc.content.pages[doc.currentPage];
  const size = page ? viewSize(page, pageInfo(page)) : null;
  const cm = (pt: number): string =>
    ((pt / 72) * 2.54).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  const dirty = isDirty(doc);
  return (
    <footer className="statusbar">
      <span className={dirty ? "status-dirty" : ""}>
        {dirty ? "Alterações não salvas" : doc.path ? "Salvo" : "Documento novo"}
      </span>
      <span>
        Página {doc.currentPage + 1} de {doc.content.pages.length}
      </span>
      {size && (
        <span>
          {cm(size.w)} × {cm(size.h)} cm
        </span>
      )}
      <div className="spacer" />
      {doc.content.annots.length > 0 && <span>{doc.content.annots.length} anotações</span>}
      <span>{Math.round(doc.zoom * 100)}%</span>
    </footer>
  );
}

function Toasts(): React.ReactElement {
  const toasts = useApp((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone ?? ""}`}>
          {t.tone === "ok" && <CheckCircle2 size={15} />}
          {t.tone === "error" && <XCircle size={15} />}
          <span>{t.text}</span>
          {t.action && (
            <button type="button" className="toast-action" onClick={t.action.run}>
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function Workspace({ doc }: { doc: DocState }): React.ReactElement {
  const sidebar = useApp((s) => s.sidebar);
  const panel = useApp((s) => s.panel);
  return (
    <>
      <Toolbar doc={doc} />
      {doc.view === "organize" ? (
        <Organize doc={doc} />
      ) : (
        <div className="body">
          {sidebar && (
            <aside className="sidebar">
              <div className="sidebar-head">
                <span>Páginas</span>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => patchDoc(doc.id, { view: "organize" })}
                >
                  Organizar
                </button>
              </div>
              <ThumbGrid doc={doc} layout="list" width={124} />
            </aside>
          )}
          <Viewer key={doc.id} doc={doc} />
          {panel && <PropsPanel doc={doc} />}
        </div>
      )}
      <StatusBar doc={doc} />
    </>
  );
}

export function App(): React.ReactElement {
  const doc = useActiveDoc();
  const busy = useApp((s) => s.busy);
  const [dropping, setDropping] = useState(false);
  useEffect(
    () =>
      registerEdiRecovery(async () => {
        for (const document of useApp.getState().docs)
          if (isDirty(document)) {
            finishDraft(document.id);
            if (!(await saveDoc(document.id))) throw new Error("Recovery save canceled");
          }
      }),
    [],
  );

  useEffect(() => {
    void window.api.recent.list().then((recents) => useApp.setState({ recents }));
    void window.api.signatures.list().then((signatures) => useApp.setState({ signatures }));
    void window.api.takePendingFiles().then((paths) => {
      if (paths.length) void openPaths(paths);
    });
    const offOpen = window.api.onOpenFiles((paths) => void openPaths(paths));
    const offClose = window.api.onCloseRequest(() => void requestQuit());
    window.addEventListener("keydown", onKey);
    return () => {
      offOpen();
      offClose();
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const title = doc ? `${isDirty(doc) ? "• " : ""}${doc.name} — EdiPDF` : "EdiPDF";
  useEffect(() => {
    window.api.setTitle(title);
  }, [title]);

  // Leaving a document or switching tools commits any text being typed.
  useEffect(() => {
    let prev = useApp.getState();
    return useApp.subscribe((s) => {
      const previous = prev;
      prev = s;
      if (s.activeId !== previous.activeId || s.tool !== previous.tool) {
        const old = previous.docs.find((d) => d.id === previous.activeId);
        if (old?.draft) finishDraft(old.id);
      }
    });
  }, []);

  // Files dragged from Explorer onto the window open as documents (the thumbnail list inserts instead).
  const isFileDrag = (e: React.DragEvent): boolean => e.dataTransfer.types.includes("Files");
  return (
    <div
      className="app"
      role="application"
      aria-label="Editor de PDF"
      onClickCapture={(e) => {
        if (busy && useApp.getState().dialog?.kind !== "password") {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onPointerDownCapture={(e) => {
        if (busy && useApp.getState().dialog?.kind !== "password") {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onDragOver={(e) => {
        if (!isFileDrag(e)) return;
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(e) => {
        if (!e.relatedTarget) setDropping(false);
      }}
      onDrop={async (e) => {
        setDropping(false);
        if (!isFileDrag(e)) return;
        e.preventDefault();
        if (busy) return;
        await openFiles(await droppedFiles(e.dataTransfer.files));
      }}
    >
      <TopBar />
      {doc ? <Workspace doc={doc} /> : <Home />}
      <DialogHost />
      <MenuHost />
      <Toasts />
      {busy && (
        <div className="busy">
          <Loader2 size={18} className="spin" /> {busy}
        </div>
      )}
      {dropping && (
        <div className="drop-overlay">
          <Upload size={28} />
          <span>Solte para abrir</span>
        </div>
      )}
    </div>
  );
}
