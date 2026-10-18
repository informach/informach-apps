import { registerEdiRecovery } from "@informach/edi-desktop/renderer";
import { viewSize } from "@shared/model";
import { shortcutTool } from "@shared/preferences";
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
import {
  annotationAction,
  copyAnnotations,
  pasteAnnotations,
  selectedAnnotations,
} from "./lib/annotations";
import { finishDraft } from "./lib/editing";
import { pageInfo } from "./lib/pdf";
import { startRecoveryAutosave } from "./lib/recovery";
import { restoreSession, startSessionAutosave } from "./lib/session";
import { startSourceLifecycle } from "./lib/source-lifecycle";
import { navigateHistory } from "./lib/workspace-view";
import { loadPreferences, startPreferences, usePreferences } from "./state/preferences";
import {
  activeDoc,
  type DocState,
  isDirty,
  patchDoc,
  redo,
  setTool,
  toast,
  undo,
  useActiveDoc,
  useApp,
} from "./state/store";
import { Home } from "./ui/Home";
import { MenuHost } from "./ui/Menu";
import { PanelResize } from "./ui/PanelResize";
import { PropsPanel } from "./ui/PropsPanel";
import { Toolbar } from "./ui/Toolbar";
import { TopBar } from "./ui/TopBar";
import { Organize } from "./viewer/Organize";
import { runSearch } from "./viewer/SearchBar";
import { ThumbGrid } from "./viewer/ThumbGrid";
import { MAX_ZOOM, MIN_ZOOM, scrollToPage, Viewer } from "./viewer/Viewer";

const typing = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement &&
  (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

function onKey(e: KeyboardEvent): void {
  const s = useApp.getState();
  if (s.dialog || s.passwordPrompt || s.busy) return;
  const doc = activeDoc(s);
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  if (mod && k === "k") {
    e.preventDefault();
    useApp.setState({ dialog: { kind: "commands" } });
    return;
  }
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
  if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
    e.preventDefault();
    navigateHistory(doc.id, e.key === "ArrowLeft" ? "back" : "forward");
    return;
  }
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
  if (mod && k === "c" && doc.selectedAnnot && !window.getSelection()?.toString()) {
    e.preventDefault();
    void copyAnnotations(doc);
    return;
  }
  if (mod && k === "v") {
    e.preventDefault();
    void pasteAnnotations(doc);
    return;
  }
  if (mod && k === "d" && doc.selectedAnnot) {
    e.preventDefault();
    annotationAction(doc.id, { kind: "duplicate", ids: selectedAnnotations(doc) });
    return;
  }
  if ((e.key === "PageDown" || e.key === "PageUp") && doc.pageLayout === "single") {
    e.preventDefault();
    const next = Math.max(
      0,
      Math.min(doc.content.pages.length - 1, doc.currentPage + (e.key === "PageDown" ? 1 : -1)),
    );
    scrollToPage(doc.id, next);
    return;
  }
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
      e.preventDefault();
      annotationAction(doc.id, { kind: "delete", ids: selectedAnnotations(doc) });
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
    annotationAction(doc.id, { kind: "move", ids: selectedAnnotations(doc), dx, dy });
    return;
  }
  const shortcut = shortcutTool(k, usePreferences.getState().value);
  if (!mod && !e.altKey && !doc.reading && shortcut && doc.view === "pages") {
    setTool(shortcut);
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
        {doc.readOnly
          ? `Leitura · ${doc.readOnlyReason ?? "Edição indisponível"}`
          : dirty
            ? "Alterações não salvas"
            : doc.path
              ? "Salvo"
              : "Documento novo"}
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
        <div
          key={t.id}
          className={`toast ${t.tone ?? ""}`}
          role={t.tone === "error" ? "alert" : "status"}
        >
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
          {sidebar && <PanelResize side="left" />}
          <Viewer key={doc.id} doc={doc} />
          {panel && <PanelResize side="right" />}
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
  useEffect(startSourceLifecycle, []);
  useEffect(startPreferences, []);
  useEffect(startRecoveryAutosave, []);
  useEffect(
    () =>
      registerEdiRecovery(async () => {
        for (const document of useApp.getState().docs) finishDraft(document.id);
        for (const document of useApp.getState().docs)
          if (isDirty(document)) {
            if (!(await saveDoc(document.id))) throw new Error("Recovery save canceled");
          }
      }),
    [],
  );

  useEffect(() => {
    void window.api.recovery
      .list()
      .then((result) => {
        useApp.setState({ recoveries: result.entries });
        if (result.unreadable)
          toast(
            `${result.unreadable} cópia(s) de recuperação não puderam ser lidas e foram preservadas no disco.`,
            { tone: "error", ms: 9000 },
          );
      })
      .catch(() =>
        toast("Não foi possível consultar as cópias de recuperação locais.", { tone: "error" }),
      );
    void window.api.recent
      .list()
      .then((recents) => useApp.setState({ recents }))
      .catch((error) =>
        toast(error instanceof Error ? error.message : "Recentes indisponíveis.", {
          tone: "error",
        }),
      );
    void window.api.signatures
      .list()
      .then((signatures) => useApp.setState({ signatures }))
      .catch((error) =>
        toast(error instanceof Error ? error.message : "Assinaturas salvas indisponíveis.", {
          tone: "error",
        }),
      );
    let disposed = false;
    let offSession = () => {};
    void (async () => {
      await loadPreferences();
      if (disposed) return;
      await restoreSession();
      if (disposed) return;
      const paths = await window.api.takePendingFiles();
      if (paths.length) await openPaths(paths);
      if (!disposed) offSession = startSessionAutosave();
    })().catch((error) =>
      toast(error instanceof Error ? error.message : "Não foi possível abrir a sessão.", {
        tone: "error",
      }),
    );
    const offOpen = window.api.onOpenFiles((paths) => void openPaths(paths));
    const offClose = window.api.onCloseRequest(() => void requestQuit());
    window.addEventListener("keydown", onKey);
    return () => {
      disposed = true;
      offSession();
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
      onCopy={(event) => {
        if (doc?.readOnly && doc.canCopy === false) {
          event.preventDefault();
          toast("Este PDF restringe a cópia de conteúdo com a senha utilizada.", { tone: "error" });
        }
      }}
      onClickCapture={(e) => {
        if (busy && !(e.target instanceof Element && e.target.closest("dialog"))) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      onPointerDownCapture={(e) => {
        if (busy && !(e.target instanceof Element && e.target.closest("dialog"))) {
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
