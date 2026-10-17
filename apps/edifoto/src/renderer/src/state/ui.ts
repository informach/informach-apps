import type { BlendMode } from "@shared/blendModes";
import { type Anchor, DEFAULT_VECTOR, type Point, type VectorStyle } from "@shared/doc";
import type { AiSettingsView } from "@shared/types";
import { create } from "zustand";

export type Tool =
  | "pen"
  | "shape"
  | "select"
  | "lasso"
  | "wand"
  | "clone"
  | "blur"
  | "move"
  | "crop"
  | "brush"
  | "eraser"
  | "text"
  | "eyedropper"
  | "hand"
  | "zoom";
export type PanelTab = "layers" | "props" | "history";
export type SelectionMode = "replace" | "add" | "subtract" | "intersect";

/** Canvas 2D composite operations offered for the brush ("Modo" in the options bar). */
export const BRUSH_MODES: { id: GlobalCompositeOperation; label: string }[] = [
  { id: "source-over", label: "Normal" },
  { id: "multiply", label: "Multiplicar" },
  { id: "screen", label: "Tela" },
  { id: "overlay", label: "Sobrepor" },
  { id: "soft-light", label: "Luz suave" },
  { id: "hard-light", label: "Luz forte" },
  { id: "darken", label: "Escurecer" },
  { id: "lighten", label: "Clarear" },
  { id: "color-dodge", label: "Subexposição de cor" },
  { id: "color-burn", label: "Superexposição de cor" },
  { id: "difference", label: "Diferença" },
  { id: "exclusion", label: "Exclusão" },
  { id: "hue", label: "Matiz" },
  { id: "saturation", label: "Saturação" },
  { id: "color", label: "Cor" },
  { id: "luminosity", label: "Luminosidade" },
];

export interface BrushSettings {
  size: number;
  /** 0..100 */
  hardness: number;
  opacity: number;
  flow: number;
  mode: GlobalCompositeOperation;
}

export interface Toast {
  id: number;
  text: string;
  tone: "info" | "ok" | "error";
  action?: { label: string; run: () => void };
}

export interface CropBox {
  x: number;
  y: number;
  w: number;
  h: number;
  /** width / height, or null for free. */
  aspect: number | null;
}

interface UiStore {
  vector: VectorStyle;
  penPoints: Anchor[];
  penSelected: number | null;
  selection: string | null;
  selectionMode: SelectionMode;
  selectionPreview: string | null;
  tolerance: number;
  cloneSource: Point | null;
  compareOpen: boolean;
  chromaOpen: boolean;
  tool: Tool;
  /** Tool to return to after holding space (temporary hand). */
  springTool: Tool | null;
  view: { zoom: number; panX: number; panY: number };
  /** Bumped to ask the viewport to fit the image on screen. */
  fitRequest: number;
  brush: BrushSettings;
  eraser: BrushSettings;
  fg: string;
  bg: string;
  paintTarget: "layer" | "mask";
  autoSelect: boolean;
  tab: PanelTab;
  assistantOpen: boolean;
  settingsOpen: boolean;
  newDocumentOpen: boolean;
  exportOpen: boolean;
  resizeOpen: boolean;
  blendMenuOpen: boolean;
  previewMode: { layerId: string; mode: BlendMode } | null;
  beforeAfter: boolean;
  crop: CropBox | null;
  toasts: Toast[];
  confirm: { title: string; text: string; okLabel: string; resolve: (ok: boolean) => void } | null;
  /** Last time an external agent (MCP) called a tool. */
  externalAt: number;
  ai: AiSettingsView | null;
  /** Focus request for the text editor in the properties panel. */
  focusText: number;

  set(p: Partial<UiStore>): void;
  setTool(t: Tool): void;
  toast(text: string, tone?: Toast["tone"], action?: Toast["action"]): void;
  ask(title: string, text: string, okLabel?: string): Promise<boolean>;
  refreshAi(): Promise<void>;
}

let toastId = 1;

export const useUi = create<UiStore>((set, get) => ({
  chromaOpen: false,
  vector: structuredClone(DEFAULT_VECTOR),
  penPoints: [],
  penSelected: null,
  selection: null,
  selectionPreview: null,
  tolerance: 32,
  cloneSource: null,
  compareOpen: false,
  tool: "move",
  selectionMode: "replace",
  springTool: null,
  view: { zoom: 1, panX: 0, panY: 0 },
  fitRequest: 0,
  brush: { size: 40, hardness: 70, opacity: 100, flow: 100, mode: "source-over" },
  eraser: { size: 60, hardness: 60, opacity: 100, flow: 100, mode: "destination-out" },
  fg: "#ff7a45",
  bg: "#ffffff",
  paintTarget: "layer",
  autoSelect: false,
  tab: "layers",
  assistantOpen: false,
  settingsOpen: false,
  newDocumentOpen: false,
  exportOpen: false,
  resizeOpen: false,
  blendMenuOpen: false,
  previewMode: null,
  beforeAfter: false,
  crop: null,
  toasts: [],
  confirm: null,
  externalAt: 0,
  ai: null,
  focusText: 0,

  set: (p) => set(p),
  setTool: (t) => {
    if (get().tool === "crop" && t !== "crop") set({ crop: null });
    set({ tool: t, springTool: null });
  },
  toast: (text, tone = "info", action) => {
    const id = toastId++;
    set({ toasts: [...get().toasts, { id, text, tone, action }] });
    setTimeout(
      () => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
      action ? 7000 : 3800,
    );
  },
  ask: (title, text, okLabel = "Confirmar") =>
    new Promise<boolean>((resolve) => {
      set({
        confirm: {
          title,
          text,
          okLabel,
          resolve: (ok) => {
            set({ confirm: null });
            resolve(ok);
          },
        },
      });
    }),
  refreshAi: async () => set({ ai: await window.api.aiSettings() }),
}));
