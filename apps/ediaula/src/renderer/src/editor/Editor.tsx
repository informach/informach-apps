import { type ReactNode, useEffect, useRef, useState } from "react";
import { actions } from "@/lib/actions";
import { copySelection, cutSelection, paste } from "@/lib/clipboard";
import { askPasteProps, copyProps } from "@/lib/clipProps";
import { useEditTimer } from "@/lib/editTimer";
import { importMedia } from "@/lib/importMedia";
import { confirmLeave } from "@/lib/leaveGuard";
import { zoomBy, zoomToFit } from "@/lib/timelineView";
import { cutRangesInteractive } from "@/lib/transcripts";
import { setTransition } from "@/lib/transitions";
import { type LeftPanel as LeftPanelKind, useApp } from "@/state/app";
import { exportsPending } from "@/state/exportQueue";
import { playback } from "@/state/playback";
import { hasUnsavedWork, useProject } from "@/state/project";
import { AnnotationsPanel } from "./AnnotationsPanel";
import { CursorPathDialog } from "./CursorPathDialog";
import { ExportDialog } from "./ExportDialog";
import { ExtendFrameDialog } from "./ExtendFrameDialog";
import { Library } from "./Library";
import { PastePropsDialog } from "./PastePropsDialog";
import { Preview } from "./Preview";
import { ProposalBar } from "./ProposalBar";
import {
  AudioPanel,
  CaptionsPanel,
  MotionsPanel,
  TemplatesPanel,
  TransitionsPanel,
} from "./RailPanels";
import { SidePanel } from "./SidePanel";
import { SpeedDialog } from "./SpeedDialog";
import { StatusBar } from "./StatusBar";
import { Timeline } from "./Timeline";
import { showRecordingProps, ToolRail } from "./ToolRail";
import { TopBar } from "./TopBar";
import { HeygenDialogs } from "./VoiceSection";
import { ZoomPanel } from "./ZoomLayerPanel";

const isTyping = (e: KeyboardEvent): boolean => {
  const el = e.target as HTMLElement;
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.isContentEditable
  );
};

/** A dialog (palette, export queue, save failure…) is in front: the timeline keys wait. */
const dialogOpen = (): boolean => !!document.querySelector("dialog[open]");

function handleKey(e: KeyboardEvent): void {
  if (
    isTyping(e) ||
    dialogOpen() ||
    useApp.getState().exportOpen ||
    useApp.getState().settingsOpen ||
    useApp.getState().speedClips ||
    useApp.getState().extendClip ||
    useApp.getState().cursorClip ||
    useApp.getState().pastePropsClips
  )
    return;
  const ctrl = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  const fps = useProject.getState().project?.settings.fps ?? 30;
  const done = (): void => {
    e.preventDefault();
  };

  if (ctrl) {
    if (k === "z" && !e.shiftKey) {
      done();
      useProject.getState().undo();
      return;
    }
    if ((k === "z" && e.shiftKey) || k === "y") {
      done();
      useProject.getState().redo();
      return;
    }
    if (k === "s") {
      done();
      void useProject.getState().saveNow();
      return;
    }
    if (k === "e") {
      done();
      useApp.getState().set({ exportOpen: true });
      return;
    }
    if (k === "i") {
      done();
      void actions.importDialog();
      return;
    }
    // Text selected on the page (transcript, script) keeps the normal copy.
    const textSelected = !!window.getSelection()?.toString();
    // Ctrl+Alt+C / Ctrl+Alt+V: copy and paste a clip's properties (Premiere's Paste Attributes).
    if (e.altKey && k === "c") {
      const sel = useProject.getState().selection;
      if (sel.length === 1) copyProps(sel[0]);
      else
        useApp.getState().toast("Selecione um clipe só para copiar as propriedades dele.", "info");
      done();
      return;
    }
    if (e.altKey && k === "v") {
      done();
      askPasteProps();
      return;
    }
    if (k === "c" && !textSelected) {
      done();
      void copySelection();
      return;
    }
    if (k === "x" && !textSelected) {
      done();
      cutSelection();
      return;
    }
    if (k === "v") {
      done();
      paste();
      return;
    }
    if (k === "a") {
      done();
      useProject.getState().select(useProject.getState().project?.clips.map((c) => c.id) ?? []);
    }
    return;
  }

  switch (e.key) {
    case " ":
      done();
      playback.toggle();
      break;
    case "k":
    case "K":
      playback.pause();
      break;
    case "j":
    case "J":
      playback.shuttleBack();
      break;
    case "l":
    case "L":
      playback.shuttleForward();
      break;
    case "ArrowLeft":
      done();
      playback.step(e.shiftKey ? -1 : -1 / fps);
      break;
    case "ArrowRight":
      done();
      playback.step(e.shiftKey ? 1 : 1 / fps);
      break;
    case "Home":
      done();
      playback.seek(0);
      break;
    case "End":
      done();
      playback.seek(Infinity);
      break;
    case "s":
    case "S":
      actions.splitAtPlayhead();
      break;
    case "c":
    case "C":
      useApp.getState().set({ tool: "cut" });
      break;
    case "v":
    case "V":
      useApp.getState().set({ tool: "select" });
      break;
    case "Delete":
    case "Backspace": {
      done();
      // Words selected in the transcript take priority over selected clips.
      const textCut = useApp.getState().textCut;
      const junction = useApp.getState().junction;
      if (junction) setTransition(junction, null);
      else if (textCut) {
        cutRangesInteractive([textCut]);
        useApp.getState().set({ textCut: null });
      } else actions.deleteSelection(e.shiftKey);
      break;
    }
    case "Escape":
      useApp.getState().set({ junction: null });
      useProject.getState().select([]);
      useApp.getState().set({ tool: "select" });
      break;
    case "+":
    case "=":
      zoomBy(1.25);
      break;
    case "-":
      zoomBy(0.8);
      break;
    case "\\":
      zoomToFit();
      break;
  }
}

function LeftPanel({ which }: { which: LeftPanelKind }): ReactNode {
  switch (which) {
    case "annotations":
      return <AnnotationsPanel />;
    case "templates":
      return <TemplatesPanel />;
    case "transitions":
      return <TransitionsPanel />;
    case "motions":
      return <MotionsPanel />;
    case "audio":
      return <AudioPanel />;
    case "captions":
      return <CaptionsPanel />;
    case "zoom":
      return <ZoomPanel onRecordingZoom={showRecordingProps} />;
    default:
      return <Library />;
  }
}

export function Editor(): ReactNode {
  const exportOpen = useApp((s) => s.exportOpen);
  const speedOpen = useApp((s) => !!s.speedClips);
  const extendOpen = useApp((s) => !!s.extendClip);
  const cursorOpen = useApp((s) => !!s.cursorClip);
  const pastePropsOpen = useApp((s) => !!s.pastePropsClips);
  const leftPanel = useApp((s) => s.leftPanel);
  const [timelineHeight, setTimelineHeight] = useState(() => Math.round(window.innerHeight * 0.42));
  const resizing = useRef(false);
  useEditTimer();

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    // Closing the window waits for the save, like the export queue holds it (ExportQueuePanel),
    // and then closes it again: by then nothing is left unsaved, or it was let go on purpose.
    const beforeUnload = (e: BeforeUnloadEvent): void => {
      // While exports are queued the window stays open anyway (ExportQueuePanel explains), so
      // nothing is saved or let go here.
      if (exportsPending() || !hasUnsavedWork()) return;
      e.preventDefault();
      e.returnValue = "";
      void confirmLeave().then((ok) => {
        if (!ok) return;
        if (hasUnsavedWork()) {
          useProject.getState().close();
          useApp.getState().set({ screen: "home", exportOpen: false });
        }
        window.close();
      });
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, []);

  const startResize = (e: React.PointerEvent): void => {
    resizing.current = true;
    const startY = e.clientY;
    const startH = timelineHeight;
    const move = (ev: PointerEvent): void => {
      const h = startH - (ev.clientY - startY);
      setTimelineHeight(Math.min(window.innerHeight - 330, Math.max(200, h)));
    };
    const up = (): void => {
      resizing.current = false;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      className="editor"
      role="application"
      aria-label="Editor de aula"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        void importMedia(
          [...e.dataTransfer.files].map((f) => window.api.pathForFile(f)).filter(Boolean),
        );
      }}
    >
      <TopBar />
      <div className="workspace">
        <ToolRail />
        <LeftPanel which={leftPanel} />
        <Preview />
        <SidePanel />
      </div>
      <div
        className="resizer"
        onPointerDown={startResize}
        title="Arraste para redimensionar a timeline"
      />
      <ProposalBar />
      <HeygenDialogs />
      <div className="timeline-wrap" style={{ height: timelineHeight }}>
        <Timeline />
      </div>
      <StatusBar />
      {exportOpen && <ExportDialog />}
      {speedOpen && <SpeedDialog />}
      {extendOpen && <ExtendFrameDialog />}
      {cursorOpen && <CursorPathDialog />}
      {pastePropsOpen && <PastePropsDialog />}
    </div>
  );
}
