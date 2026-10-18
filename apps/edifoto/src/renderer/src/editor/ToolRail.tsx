import {
  Crop,
  Droplet,
  Ellipsis,
  Eraser,
  Hand,
  Lasso,
  type LucideIcon,
  Move,
  Paintbrush,
  PenTool,
  Pipette,
  Shapes,
  SquareDashed,
  Stamp,
  Type,
  WandSparkles,
  ZoomIn,
} from "lucide-react";
import type { ReactNode } from "react";
import { type Tool, useUi } from "@/state/ui";

export const TOOLS: { id: Tool; icon: LucideIcon; label: string; key: string }[][] = [
  [
    { id: "move", icon: Move, label: "Mover e transformar", key: "V" },
    { id: "select", icon: SquareDashed, label: "Seleção retangular", key: "M" },
    { id: "lasso", icon: Lasso, label: "Laço", key: "L" },
    { id: "wand", icon: WandSparkles, label: "Varinha mágica", key: "W" },
    { id: "crop", icon: Crop, label: "Cortar", key: "C" },
  ],
  [
    { id: "clone", icon: Stamp, label: "Carimbo (Alt define origem)", key: "S" },
    { id: "blur", icon: Droplet, label: "Desfoque", key: "R" },
    { id: "brush", icon: Paintbrush, label: "Pincel", key: "B" },
    { id: "eraser", icon: Eraser, label: "Borracha", key: "E" },
  ],
  [
    { id: "pen", icon: PenTool, label: "Caneta", key: "P" },
    { id: "shape", icon: Shapes, label: "Formas", key: "U" },
    { id: "text", icon: Type, label: "Texto", key: "T" },
    { id: "eyedropper", icon: Pipette, label: "Conta-gotas", key: "I" },
  ],
  [
    { id: "hand", icon: Hand, label: "Mão (segure Espaço)", key: "H" },
    { id: "zoom", icon: ZoomIn, label: "Zoom (Alt afasta)", key: "Z" },
  ],
];

export const toolInfo = (id: Tool): (typeof TOOLS)[number][number] =>
  TOOLS.flat().find((t) => t.id === id)!;

export function ToolRail(): ReactNode {
  const tool = useUi((s) => s.tool);
  const fg = useUi((s) => s.fg);
  const bg = useUi((s) => s.bg);
  const advanced = useUi((s) => s.advanced);
  const basicTools = new Set<Tool>([
    "move",
    "select",
    "crop",
    "brush",
    "eraser",
    "shape",
    "text",
    "hand",
    "zoom",
  ]);
  return (
    <div
      className="toolrail"
      role="toolbar"
      aria-label="Ferramentas de edição"
      aria-orientation="vertical"
    >
      <div className="tools">
        {TOOLS.map((group, gi) => (
          <div key={group.map((tool) => tool.id).join(":")} className="tools">
            {gi > 0 && <div className="tool-sep" />}
            {group
              .filter((t) => advanced || basicTools.has(t.id) || t.id === tool)
              .map((t) => (
                <button
                  type="button"
                  key={t.id}
                  className={`tool${tool === t.id ? " is-on" : ""}`}
                  aria-label={t.label}
                  aria-pressed={tool === t.id}
                  aria-keyshortcuts={t.key}
                  title={`${t.label} (${t.key})`}
                  onClick={() => useUi.getState().setTool(t.id)}
                >
                  <t.icon size={18} />
                </button>
              ))}
          </div>
        ))}
        <button
          type="button"
          className={`tool${advanced ? " is-on" : ""}`}
          aria-label={advanced ? "Menos ferramentas" : "Mais ferramentas"}
          aria-pressed={advanced}
          title={advanced ? "Voltar aos controles simples" : "Mostrar todas as ferramentas"}
          onClick={() => useUi.setState({ advanced: !advanced })}
        >
          <Ellipsis size={18} />
        </button>
      </div>
      <div
        className="swatches"
        title="Cor principal e secundária (X troca, D volta ao preto e branco)"
      >
        <label className="sw sw-bg" style={{ background: bg }}>
          <input type="color" value={bg} onChange={(e) => useUi.setState({ bg: e.target.value })} />
        </label>
        <label className="sw sw-fg" style={{ background: fg }}>
          <input type="color" value={fg} onChange={(e) => useUi.setState({ fg: e.target.value })} />
        </label>
      </div>
    </div>
  );
}
