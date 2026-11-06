import { useEffect } from "react";
import { Controls, captureFrame, stepSpeed, toggleAb } from "./components/Controls";
import { EditTools } from "./components/EditTools";
import { Home } from "./components/Home";
import { Queue } from "./components/Queue";
import { MarksAndResult, Ruler } from "./components/Ruler";
import { SaveDialog } from "./components/SaveDialog";
import { SeekBar } from "./components/SeekBar";
import { Sidebar } from "./components/Sidebar";
import { Stage, toggleFullscreen } from "./components/Stage";
import { TitleBar } from "./components/TitleBar";
import { playbackCaps, seek, togglePlay, video } from "./lib/media";
import {
  deleteSelected,
  enterEdit,
  exitEdit,
  fail,
  markIn,
  markOut,
  openPaths,
  openSave,
  redo,
  savePrefs,
  splitHere,
  undo,
  useStore,
} from "./state/store";

export function App() {
  const view = useStore((s) => s.view);
  const editing = useStore((s) => s.editing);
  const mini = useStore((s) => s.mini);
  const toast = useStore((s) => s.toast);

  useEffect(() => {
    void window.api.reportCaps(playbackCaps()).catch(fail);
    void window.api
      .prefs()
      .then((prefs) => useStore.setState({ prefs }))
      .catch(fail);
    void window.api
      .queue()
      .then((queue) => useStore.setState({ queue }))
      .catch(fail);
    const offQueue = window.api.onQueue((queue) => useStore.setState({ queue }));
    const offOpen = window.api.onOpenFiles((paths) => void openPaths(paths).catch(fail));
    const offProgress = window.api.onProgress((event) => {
      const current = useStore.getState().list.at(useStore.getState().index)?.path;
      if (event.id === current && useStore.getState().loading)
        useStore.setState({
          loading: event.ratio >= 1 ? null : { label: event.label, ratio: event.ratio },
        });
    });
    window.addEventListener("keydown", onKey);
    return () => {
      offQueue();
      offOpen();
      offProgress();
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className={`app${mini ? " mini" : ""}`}>
      <TitleBar />
      {view === "home" && <Home />}
      {view === "player" && !editing && (
        <div className="player">
          <main className="player-main">
            <Stage />
            <SeekBar />
            <Controls />
          </main>
          <Sidebar />
        </div>
      )}
      {view === "player" && editing && (
        <>
          <div className="edit-top">
            <div className="edit-preview">
              <Stage showTime />
              <EditKeys />
            </div>
            <EditTools />
          </div>
          <section className="ruler-panel" aria-label="Régua de corte">
            <Ruler />
            <MarksAndResult />
          </section>
        </>
      )}
      <SaveDialog />
      <Queue />
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}

function EditKeys() {
  const playing = useStore((s) => s.playing);
  return (
    <div className="row">
      <button
        type="button"
        className="icon-btn"
        aria-label="Quadro anterior"
        onClick={() => frameStep(-1)}
      >
        ‹
      </button>
      <button type="button" className="btn" onClick={togglePlay}>
        {playing ? "Pausar" : "Tocar"}
      </button>
      <button
        type="button"
        className="icon-btn"
        aria-label="Próximo quadro"
        onClick={() => frameStep(1)}
      >
        ›
      </button>
      <span className="spacer" />
      <span className="keys-hint">
        <span>
          <kbd>I</kbd> entrada
        </span>
        <span>
          <kbd>O</kbd> saída
        </span>
        <span>
          <kbd>S</kbd> dividir
        </span>
        <span>
          <kbd>Del</kbd> remover
        </span>
      </span>
    </div>
  );
}

function frameStep(direction: 1 | -1): void {
  const v = video();
  if (!v) return;
  v.pause();
  const fps = useStore.getState().facts?.fps || 30;
  seek(v.currentTime + direction / fps);
}

/** Keys of the window only (never global): VLC's where they exist, plus the edit keys. */
function onKey(e: KeyboardEvent): void {
  const target = e.target;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement
  )
    return;
  const state = useStore.getState();
  if (state.save) return;
  const key = e.key;
  const ctrl = e.ctrlKey || e.metaKey;
  const v = video();
  if (ctrl && key.toLowerCase() === "o") {
    e.preventDefault();
    void window.api.pickFiles().then(openPaths).catch(fail);
    return;
  }
  if (state.view !== "player") return;
  const handled = () => e.preventDefault();
  if (ctrl && key.toLowerCase() === "z") {
    handled();
    if (state.editing) undo();
    return;
  }
  if (ctrl && (key.toLowerCase() === "y" || (e.shiftKey && key.toLowerCase() === "z"))) {
    handled();
    if (state.editing) redo();
    return;
  }
  if (ctrl && key.toLowerCase() === "s") {
    handled();
    if (state.editing) openSave("export");
    return;
  }
  if (ctrl) return;
  const now = v?.currentTime ?? 0;
  switch (key) {
    case " ":
      handled();
      togglePlay();
      break;
    case "ArrowLeft":
      handled();
      seek(now - (e.shiftKey ? 1 : e.altKey ? 60 : 5));
      break;
    case "ArrowRight":
      handled();
      seek(now + (e.shiftKey ? 1 : e.altKey ? 60 : 5));
      break;
    case ",":
      handled();
      frameStep(-1);
      break;
    case ".":
      handled();
      frameStep(1);
      break;
    case "[":
      stepSpeed(-1);
      break;
    case "]":
      stepSpeed(1);
      break;
    case "=":
      useStore.setState({ rate: 1 });
      break;
    case "f":
    case "F":
      void toggleFullscreen().catch(fail);
      break;
    case "m":
    case "M":
      void savePrefs({ muted: !state.prefs.muted });
      break;
    case "l":
    case "L":
      toggleAb();
      break;
    case "ArrowUp":
      handled();
      void savePrefs({ volume: Math.min(2, state.prefs.volume + 0.05), muted: false });
      break;
    case "ArrowDown":
      handled();
      void savePrefs({ volume: Math.max(0, state.prefs.volume - 0.05) });
      break;
    case "e":
    case "E":
      if (state.editing) exitEdit();
      else void enterEdit().catch(fail);
      break;
    case "i":
    case "I":
      if (state.editing) markIn();
      break;
    case "o":
    case "O":
      if (state.editing) markOut();
      break;
    case "s":
    case "S":
      if (state.editing) splitHere();
      else if (e.shiftKey) void captureFrame("file").catch(fail);
      break;
    case "Delete":
    case "Backspace":
      if (state.editing) deleteSelected();
      break;
    case "Escape":
      if (state.editing && state.pendingIn !== null) useStore.setState({ pendingIn: null });
      else if (state.mini) {
        useStore.setState({ mini: false });
        void window.api.setMiniPlayer(false);
      }
      break;
  }
}
