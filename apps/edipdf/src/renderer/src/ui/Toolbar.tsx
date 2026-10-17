import {
  ChevronDown,
  Circle,
  Eraser,
  Hand,
  Highlighter,
  ImagePlus,
  LayoutGrid,
  MessageSquare,
  Minus,
  MousePointer2,
  MoveUpRight,
  PanelLeft,
  PanelRight,
  PenLine,
  Plus,
  Redo2,
  Search,
  Signature,
  Square,
  Strikethrough,
  TextCursorInput,
  Type,
  Underline,
  Undo2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { pickAndPlaceImage } from "../lib/actions";
import { type DocState, patchDoc, redo, setTool, type Tool, undo, useApp } from "../state/store";
import { runSearch } from "../viewer/SearchBar";
import { MAX_ZOOM, MIN_ZOOM, scrollToPage } from "../viewer/Viewer";
import { openMenuAt } from "./Menu";

const MARKUP: { tool: Tool; label: string; icon: React.ReactNode }[] = [
  { tool: "highlight", label: "Realçar texto", icon: <Highlighter size={16} /> },
  { tool: "underline", label: "Sublinhar texto", icon: <Underline size={16} /> },
  { tool: "strike", label: "Tachar texto", icon: <Strikethrough size={16} /> },
];
const SHAPES: { tool: Tool; label: string; icon: React.ReactNode }[] = [
  { tool: "rect", label: "Retângulo", icon: <Square size={16} /> },
  { tool: "ellipse", label: "Elipse", icon: <Circle size={16} /> },
  { tool: "line", label: "Linha", icon: <Minus size={16} /> },
  { tool: "arrow", label: "Seta", icon: <MoveUpRight size={16} /> },
];

function ToolBtn({
  tool,
  icon,
  label,
  hint,
  showLabel = true,
}: {
  tool: Tool;
  icon: React.ReactNode;
  label: string;
  hint?: string;
  showLabel?: boolean;
}): React.ReactElement {
  const active = useApp((s) => s.tool === tool);
  return (
    <button
      type="button"
      className={`tool${active ? " active" : ""}`}
      title={hint ? `${label} (${hint})` : label}
      onClick={() => setTool(tool)}
    >
      {icon}
      {showLabel && <span className="tool-label">{label}</span>}
    </button>
  );
}

/** A tool button whose icon reflects the last variant used, with a chevron to pick another. */
function GroupBtn({
  items,
  label,
  hint,
}: {
  items: typeof SHAPES;
  label: string;
  hint?: string;
}): React.ReactElement {
  const tool = useApp((s) => s.tool);
  const [last, setLast] = useState(items[0].tool);
  useEffect(() => {
    if (items.some((i) => i.tool === tool)) setLast(tool);
  }, [tool, items]);
  const current = items.find((i) => i.tool === last) ?? items[0];
  const active = items.some((i) => i.tool === tool);
  return (
    <div className={`tool-group${active ? " active" : ""}`}>
      <button
        type="button"
        className={`tool${active ? " active" : ""}`}
        title={hint ? `${current.label} (${hint})` : current.label}
        onClick={() => setTool(current.tool)}
      >
        {current.icon}
        <span className="tool-label">{label}</span>
      </button>
      <button
        type="button"
        className="tool tool-caret"
        title={`Opções de ${label.toLowerCase()}`}
        onClick={(e) =>
          openMenuAt(
            e.currentTarget.parentElement!,
            items.map((i) => ({
              label: i.label,
              icon: i.icon,
              checked: i.tool === last,
              run: () => setTool(i.tool),
            })),
          )
        }
      >
        <ChevronDown size={12} />
      </button>
    </div>
  );
}

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

export function Toolbar({ doc }: { doc: DocState }): React.ReactElement {
  const sidebar = useApp((s) => s.sidebar);
  const panel = useApp((s) => s.panel);
  const [pageText, setPageText] = useState("");
  const total = doc.content.pages.length;
  const organize = doc.view === "organize";
  const setZoom = (z: number): void => {
    patchDoc(doc.id, { zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z)), fit: null });
  };

  return (
    <div className="toolbar">
      <button
        type="button"
        className="icon-btn"
        title="Desfazer (Ctrl+Z)"
        disabled={!doc.past.length}
        onClick={() => undo(doc.id)}
      >
        <Undo2 size={16} />
      </button>
      <button
        type="button"
        className="icon-btn"
        title="Refazer (Ctrl+Y)"
        disabled={!doc.future.length}
        onClick={() => redo(doc.id)}
      >
        <Redo2 size={16} />
      </button>
      <div className="bar-sep" />
      {!organize && (
        <>
          <ToolBtn tool="select" icon={<MousePointer2 size={16} />} label="Selecionar" hint="V" />
          <ToolBtn tool="hand" icon={<Hand size={16} />} label="Mão" hint="H" showLabel={false} />
          <div className="bar-sep" />
          <ToolBtn tool="text" icon={<Type size={16} />} label="Texto" hint="T" />
          <ToolBtn
            tool="edittext"
            icon={<TextCursorInput size={16} />}
            label="Editar texto"
            hint="E"
          />
          <GroupBtn items={MARKUP} label="Realçar" hint="R" />
          <ToolBtn tool="ink" icon={<PenLine size={16} />} label="Desenhar" hint="D" />
          <GroupBtn items={SHAPES} label="Formas" />
          <ToolBtn tool="note" icon={<MessageSquare size={16} />} label="Comentário" hint="C" />
          <button
            type="button"
            className="tool"
            title="Inserir imagem"
            onClick={() => void pickAndPlaceImage()}
          >
            <ImagePlus size={16} />
            <span className="tool-label">Imagem</span>
          </button>
          <button
            type="button"
            className="tool"
            title="Assinar"
            onClick={() => useApp.setState({ dialog: { kind: "signature" } })}
          >
            <Signature size={16} />
            <span className="tool-label">Assinar</span>
          </button>
          <ToolBtn
            tool="whiteout"
            icon={<Eraser size={16} />}
            label="Cobrir"
            hint="arraste para apagar com um retângulo branco"
          />
        </>
      )}
      <div className="spacer" />
      <button
        type="button"
        className={`tool${organize ? " active" : ""}`}
        title="Organizar páginas"
        onClick={() =>
          patchDoc(doc.id, {
            view: organize ? "pages" : "organize",
            selection: organize ? doc.selection : [],
          })
        }
      >
        <LayoutGrid size={16} />
        <span className="tool-label">Organizar</span>
      </button>
      {!organize && (
        <>
          <div className="bar-sep" />
          <div className="page-nav">
            <input
              className="page-input"
              value={pageText || String(doc.currentPage + 1)}
              onFocus={(e) => {
                setPageText(String(doc.currentPage + 1));
                e.target.select();
              }}
              onChange={(e) => setPageText(e.target.value.replace(/\D/g, ""))}
              onBlur={() => setPageText("")}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                  const n = Math.max(1, Math.min(total, Number(pageText) || 1));
                  scrollToPage(doc.id, n - 1);
                  (e.target as HTMLInputElement).blur();
                }
              }}
              aria-label="Página"
            />
            <span className="muted">de {total}</span>
          </div>
          <div className="bar-sep" />
          <button
            type="button"
            className="icon-btn"
            title="Diminuir zoom (Ctrl+-)"
            onClick={() => setZoom(doc.zoom / 1.2)}
          >
            <Minus size={15} />
          </button>
          <button
            type="button"
            className="zoom-btn"
            title="Nível de zoom"
            onClick={(e) =>
              openMenuAt(e.currentTarget, [
                {
                  label: "Ajustar à largura",
                  checked: doc.fit === "width",
                  hint: "Ctrl+0",
                  run: () => patchDoc(doc.id, { fit: "width" }),
                },
                {
                  label: "Página inteira",
                  checked: doc.fit === "page",
                  run: () => patchDoc(doc.id, { fit: "page" }),
                },
                { separator: true },
                ...ZOOMS.map((z) => ({
                  label: `${Math.round(z * 100)}%`,
                  checked: !doc.fit && Math.abs(doc.zoom - z) < 0.001,
                  run: () => setZoom(z),
                })),
              ])
            }
          >
            {Math.round(doc.zoom * 100)}%
            <ChevronDown size={11} />
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Aumentar zoom (Ctrl+=)"
            onClick={() => setZoom(doc.zoom * 1.2)}
          >
            <Plus size={15} />
          </button>
          <div className="bar-sep" />
          <button
            type="button"
            className={`icon-btn${doc.search ? " active" : ""}`}
            title="Buscar (Ctrl+F)"
            onClick={() =>
              doc.search ? patchDoc(doc.id, { search: null }) : void runSearch(doc.id, "")
            }
          >
            <Search size={16} />
          </button>
          <button
            type="button"
            className={`icon-btn${sidebar ? " active" : ""}`}
            title="Miniaturas"
            onClick={() => useApp.setState({ sidebar: !sidebar })}
          >
            <PanelLeft size={16} />
          </button>
          <button
            type="button"
            className={`icon-btn${panel ? " active" : ""}`}
            title="Painel de propriedades"
            onClick={() => useApp.setState({ panel: !panel })}
          >
            <PanelRight size={16} />
          </button>
        </>
      )}
    </div>
  );
}
