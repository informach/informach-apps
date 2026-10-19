import { cycleBlend } from "@shared/blendModes";
import { type ReactNode, useEffect } from "react";
import { actions, attempt } from "@/lib/actions";
import { pasteImage } from "@/lib/files";
import { crop, setLayerProps, setTransform } from "@/lib/ops";
import {
  clearSelection,
  deleteSelectedPixels,
  invertSelection,
  selectionMask,
} from "@/lib/selection";
import { finishPen } from "@/lib/vector";
import { fitView, zoomStep, zoomTo } from "@/lib/view";
import { useAssistant } from "@/state/assistant";
import { useDoc } from "@/state/doc";
import { type Tool, useUi } from "@/state/ui";
import { AssistantPanel } from "./AssistantPanel";
import { ChromaKeyDialog } from "./ChromaKeyDialog";
import { CompareDialog } from "./CompareDialog";
import { ExportDialog, ResizeDialog } from "./ExportDialog";
import { OptionsBar } from "./OptionsBar";
import { QuickDock } from "./QuickDock";
import { RightPanel } from "./RightPanel";
import { StatusBar } from "./StatusBar";
import { ToolRail } from "./ToolRail";
import { TopBar } from "./TopBar";
import { Viewport } from "./Viewport";

const TOOL_KEYS: Record<string, Tool> = {
  p: "pen",
  u: "shape",
  m: "select",
  l: "lasso",
  w: "wand",
  s: "clone",
  r: "blur",
  v: "move",
  c: "crop",
  b: "brush",
  e: "eraser",
  t: "text",
  i: "eyedropper",
  h: "hand",
  z: "zoom",
};

const typing = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement &&
  (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

export function Editor(): ReactNode {
  const tool = useUi((s) => s.tool);
  const chromaOpen = useUi((s) => s.chromaOpen);
  const compareOpen = useUi((s) => s.compareOpen);
  const assistantOpen = useUi((s) => s.assistantOpen);
  const exportOpen = useUi((s) => s.exportOpen);
  const resizeOpen = useUi((s) => s.resizeOpen);

  useEffect(() => {
    // Keep the assistant module loaded so its event listener exists before the first message.
    void useAssistant.getState();

    const onKey = (e: KeyboardEvent): void => {
      const ui = useUi.getState();
      const doc = useDoc.getState();
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (
        ui.confirm ||
        ui.settingsOpen ||
        ui.exportOpen ||
        ui.resizeOpen ||
        ui.compareOpen ||
        ui.newDocumentOpen ||
        ui.chromaOpen
      )
        return;
      if (typing(e.target)) {
        if (ctrl && k === "s") {
          e.preventDefault();
          attempt(e.shiftKey ? actions.saveAs : actions.save);
        }
        return;
      }
      const run = (fn: () => unknown): void => {
        e.preventDefault();
        attempt(fn);
      };
      if (ctrl) {
        if (k === "d") {
          run(clearSelection);
          return;
        }
        if (k === "i" && e.shiftKey) {
          run(invertSelection);
          return;
        }
        if (k === "z" && !e.shiftKey) {
          run(actions.undo);
          return;
        }
        if ((k === "z" && e.shiftKey) || k === "y") {
          run(actions.redo);
          return;
        }
        if (k === "s") {
          run(e.shiftKey ? actions.saveAs : actions.save);
          return;
        }
        if (k === "o") {
          run(actions.open);
          return;
        }
        if (k === "e" && e.shiftKey) {
          run(actions.exportDialog);
          return;
        }
        if (k === "e") {
          run(actions.mergeDown);
          return;
        }
        if (k === "j") {
          run(actions.duplicate);
          return;
        }
        if (k === "n" && e.shiftKey) {
          run(actions.newLayer);
          return;
        }
        if (k === "c" && !window.getSelection()?.toString()) {
          run(actions.copy);
          return;
        }
        if (k === "0") {
          run(fitView);
          return;
        }
        if (k === "1") {
          run(() => zoomTo(1));
          return;
        }
        if (k === "=" || k === "+") {
          run(() => zoomStep(1));
          return;
        }
        if (k === "-") {
          run(() => zoomStep(-1));
          return;
        }
        return;
      }
      if (e.shiftKey && (e.key === "+" || e.key === "_" || e.key === "-" || e.key === "=")) {
        const l = doc.doc?.layers.find((x) => x.id === doc.activeId);
        if (l)
          run(() =>
            setLayerProps(
              l.id,
              { blendMode: cycleBlend(l.blendMode, e.key === "+" || e.key === "=" ? 1 : -1) },
              `blend-cycle:${l.id}`,
            ),
          );
        return;
      }
      if (e.key === " " && !e.repeat && ui.tool !== "hand") {
        e.preventDefault();
        useUi.setState({ springTool: ui.tool, tool: "hand" });
        return;
      }
      if (TOOL_KEYS[k] && !e.altKey) {
        run(() => ui.setTool(TOOL_KEYS[k]));
        return;
      }
      if (k === "enter" && ui.tool === "pen") {
        run(() => finishPen(false));
        return;
      }
      if ((k === "delete" || k === "backspace") && ui.penPoints.length) {
        run(() => useUi.setState({ penPoints: ui.penPoints.slice(0, -1) }));
        return;
      }
      if ((k === "delete" || k === "backspace") && ui.selection) {
        run(deleteSelectedPixels);
        return;
      }
      if (k === "enter" && ui.crop) {
        const c = ui.crop;
        run(() => {
          crop(c.x, c.y, c.w, c.h);
          useUi.setState({ crop: null, tool: "move" });
          fitView();
        });
        return;
      }
      if (k === "escape") {
        if (ui.penPoints.length) {
          run(() => useUi.setState({ penPoints: [], penSelected: null }));
          return;
        }
        if (ui.selection) {
          run(clearSelection);
          return;
        }
        if (ui.crop) {
          run(() => useUi.setState({ crop: null, tool: "move" }));
          return;
        }
        if (ui.blendMenuOpen) {
          run(() => useUi.setState({ blendMenuOpen: false }));
          return;
        }
        return;
      }
      if (k === "x") {
        run(() => useUi.setState({ fg: ui.bg, bg: ui.fg }));
        return;
      }
      if (k === "d") {
        run(() => useUi.setState({ fg: "#000000", bg: "#ffffff" }));
        return;
      }
      if (k === "[" || k === "]") {
        const key = ui.tool === "eraser" ? "eraser" : "brush";
        const s = ui[key];
        const size = Math.round(
          Math.max(1, Math.min(2000, k === "]" ? s.size * 1.15 + 1 : s.size / 1.15 - 1)),
        );
        run(() => useUi.setState({ [key]: { ...s, size } } as never));
        return;
      }
      if ((k === "delete" || k === "backspace") && doc.activeId) {
        run(actions.remove);
        return;
      }
      if (/^[0-9]$/.test(k) && doc.activeId && (ui.tool === "move" || ui.tool === "hand")) {
        const v = k === "0" ? 1 : Number(k) / 10;
        run(() => setLayerProps(doc.activeId!, { opacity: v }));
        return;
      }
      if (k.startsWith("arrow") && ui.tool === "move" && doc.activeId) {
        const l = doc.doc?.layers.find((x) => x.id === doc.activeId);
        if (l && (l.kind === "raster" || l.kind === "text" || l.kind === "vector")) {
          const step = e.shiftKey ? 10 : 1;
          const dx = k === "arrowleft" ? -step : k === "arrowright" ? step : 0;
          const dy = k === "arrowup" ? -step : k === "arrowdown" ? step : 0;
          run(() =>
            setTransform(l.id, { x: l.transform.x + dx, y: l.transform.y + dy }, `nudge:${l.id}`),
          );
          return;
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      const ui = useUi.getState();
      if (e.key === " " && ui.springTool) useUi.setState({ tool: ui.springTool, springTool: null });
    };
    const onPaste = (e: ClipboardEvent): void => {
      if (
        useUi.getState().newDocumentOpen ||
        useUi.getState().confirm ||
        useUi.getState().chromaOpen
      )
        return;
      if (typing(e.target)) return;
      attempt(() => pasteImage(e));
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("paste", onPaste);
    };
  }, []);

  return (
    <div className="editor">
      <TopBar />
      <div className="body">
        <ToolRail />
        <div className="workspace">
          <OptionsBar />
          <Viewport />
          {tool !== "crop" && <QuickDock />}
          <StatusBar />
        </div>
        <RightPanel />
        {assistantOpen && <AssistantPanel />}
      </div>
      {compareOpen && <CompareDialog />}
      {chromaOpen && <ChromaKeyDialog />}
      {exportOpen && <ExportDialog />}
      {resizeOpen && <ResizeDialog />}
    </div>
  );
}
