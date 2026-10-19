import { withRenderKeys } from "@informach/edi-desktop/renderer";
import { Columns2, Download, Image as ImageIcon, Redo2, Sparkles, Undo2 } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { actions, addText, attempt, autoAdjust } from "@/lib/actions";
import { openChromaKey } from "@/lib/chroma";
import { addLayer, addMask, flipImage, invertMask, removeMask, rotateImage } from "@/lib/ops";
import { clearSelection, invertSelection, removeBackground, selectionMask } from "@/lib/selection";
import { fitView, zoomStep, zoomTo } from "@/lib/view";
import { useDoc } from "@/state/doc";
import { useUi } from "@/state/ui";

interface Item {
  label: string;
  keys?: string;
  run: () => unknown;
  disabled?: boolean;
}
type Entry = Item | "-";

const active = (): string => {
  const id = useDoc.getState().activeId;
  if (!id) throw new Error("Selecione uma camada.");
  return id;
};

function menus(hasMask: boolean): { label: string; items: Entry[] }[] {
  return [
    {
      label: "Arquivo",
      items: [
        { label: "Novo…", keys: "Ctrl+N", run: actions.newDocument },
        { label: "Abrir…", keys: "Ctrl+O", run: actions.open },
        { label: "Inserir imagem como camada…", run: actions.place },
        "-",
        { label: "Salvar", keys: "Ctrl+S", run: actions.save },
        { label: "Salvar como…", keys: "Ctrl+Shift+S", run: actions.saveAs },
        "-",
        { label: "Exportar…", keys: "Ctrl+Shift+E", run: actions.exportDialog },
        { label: "Exportar JPEG rápido…", run: actions.quickExport },
        { label: "Copiar imagem", keys: "Ctrl+C", run: actions.copy },
        "-",
        { label: "Fechar imagem", run: actions.close },
      ],
    },
    {
      label: "Editar",
      items: [
        { label: "Desfazer", keys: "Ctrl+Z", run: actions.undo },
        { label: "Refazer", keys: "Ctrl+Shift+Z", run: actions.redo },
        "-",
        { label: "Inteligência artificial…", run: () => useUi.setState({ settingsOpen: true }) },
      ],
    },
    {
      label: "Imagem",
      items: [
        { label: "Ajuste automático", run: () => autoAdjust() },
        "-",
        { label: "Cortar", keys: "C", run: () => useUi.getState().setTool("crop") },
        { label: "Tamanho da imagem…", run: () => useUi.setState({ resizeOpen: true }) },
        "-",
        { label: "Girar 90° à direita", run: () => rotateImage(1) },
        { label: "Girar 90° à esquerda", run: () => rotateImage(-1) },
        { label: "Girar 180°", run: () => rotateImage(2) },
        { label: "Espelhar na horizontal", run: () => flipImage("horizontal") },
        { label: "Espelhar na vertical", run: () => flipImage("vertical") },
      ],
    },
    {
      label: "Camada",
      items: [
        { label: "Nova camada vazia", keys: "Ctrl+Shift+N", run: actions.newLayer },
        { label: "Nova camada de ajuste", run: () => addLayer({ kind: "adjust" }) },
        {
          label: "Nova cor sólida",
          run: () => addLayer({ kind: "solid", color: useUi.getState().fg }),
        },
        { label: "Novo gradiente", run: () => addLayer({ kind: "gradient" }) },
        { label: "Novo texto", keys: "T", run: addText },
        "-",
        { label: "Duplicar camada", keys: "Ctrl+J", run: actions.duplicate },
        { label: "Mesclar para baixo", keys: "Ctrl+E", run: actions.mergeDown },
        "-",
        {
          label: hasMask ? "Refazer máscara (branca)" : "Adicionar máscara",
          run: () => addMask(active()),
        },
        { label: "Inverter máscara", run: () => invertMask(active()), disabled: !hasMask },
        { label: "Remover máscara", run: () => removeMask(active()), disabled: !hasMask },
        "-",
        { label: "Apagar camada", keys: "Del", run: actions.remove },
      ],
    },
    {
      label: "Filtro",
      items: [
        {
          label: "Preto e branco",
          run: () =>
            addLayer({ kind: "adjust", name: "Preto e branco", adjust: { grayscale: true } }),
        },
        {
          label: "Inverter cores",
          run: () => addLayer({ kind: "adjust", name: "Inverter", adjust: { invert: true } }),
        },
        {
          label: "Curvas",
          run: () => {
            addLayer({ kind: "adjust", name: "Curvas" });
            useUi.setState({ tab: "props" });
          },
        },
        { label: "Desfoque local", keys: "R", run: () => useUi.getState().setTool("blur") },
        { label: "Chroma key — remover fundo…", run: openChromaKey },
        { label: "Remover fundo conectado aos cantos", run: removeBackground },
      ],
    },
    {
      label: "Selecionar",
      items: [
        { label: "Inverter seleção", keys: "Ctrl+Shift+I", run: invertSelection },
        { label: "Desmarcar", keys: "Ctrl+D", run: clearSelection },
        { label: "Criar máscara da seleção", run: () => selectionMask() },
      ],
    },
    {
      label: "Exibir",
      items: [
        { label: "Ajustar à tela", keys: "Ctrl+0", run: fitView },
        { label: "Tamanho real (100%)", keys: "Ctrl+1", run: () => zoomTo(1) },
        { label: "Aproximar", keys: "Ctrl++", run: () => zoomStep(1) },
        { label: "Afastar", keys: "Ctrl+-", run: () => zoomStep(-1) },
        "-",
        {
          label: "Comparar mesclagens lado a lado",
          run: () => useUi.setState({ compareOpen: true }),
        },
        {
          label: "Antes / Depois",
          run: () => useUi.setState((s) => ({ beforeAfter: !s.beforeAfter })),
        },
        {
          label: "Assistente",
          run: () => useUi.setState((s) => ({ assistantOpen: !s.assistantOpen })),
        },
      ],
    },
  ];
}

function MenuBar(): ReactNode {
  const [open, setOpen] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const hasMask = useDoc((s) => !!s.doc?.layers.find((l) => l.id === s.activeId)?.mask);
  useEffect(() => {
    if (open === null) return;
    const close = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setOpen(null);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);
  const list = menus(hasMask);
  return (
    <div className="menubar" ref={ref}>
      {list.map((m, i) => (
        <div className="menu-root" key={m.label}>
          <button
            type="button"
            className={`menu-btn${open === i ? " is-open" : ""}`}
            onClick={() => setOpen(open === i ? null : i)}
            onMouseEnter={() => open !== null && setOpen(i)}
          >
            {m.label}
          </button>
          {open === i && (
            <div className="menu">
              {withRenderKeys(m.items, (item) => (item === "-" ? "separator" : item.label)).map(
                ({ key, value: it }) =>
                  it === "-" ? (
                    <div key={key} className="menu-sep" />
                  ) : (
                    <button
                      type="button"
                      key={it.label}
                      className="menu-item"
                      disabled={it.disabled}
                      onClick={() => {
                        setOpen(null);
                        attempt(it.run);
                      }}
                    >
                      {it.label}
                      {it.keys && <span className="kbd">{it.keys}</span>}
                    </button>
                  ),
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function TopBar(): ReactNode {
  const name = useDoc((s) => s.doc?.name ?? "");
  const dirty = useDoc((s) => s.dirty);
  const canUndo = useDoc((s) => s.past.length > 0);
  const canRedo = useDoc((s) => s.future.length > 0);
  const zoom = useUi((s) => s.view.zoom);
  const assistantOpen = useUi((s) => s.assistantOpen);
  const before = useUi((s) => s.beforeAfter);
  return (
    <div className="topbar">
      <div className="brand">
        <div className="logo" />
        EdiFoto
      </div>
      <MenuBar />
      <span className="spacer" />
      <div
        className="doc-tab"
        title={useDoc.getState().filePath ?? useDoc.getState().sourcePath ?? ""}
      >
        <ImageIcon size={14} />
        <strong>{name}</strong>
        <span className="mono muted" style={{ fontSize: 12 }}>
          {Math.round(zoom * 100)}%
        </span>
        {dirty && <span className="dirty-dot" title="Alterações não salvas" />}
      </div>
      <span className="spacer" />
      <div className="topbar-right">
        <button
          type="button"
          className="icon-btn"
          title="Desfazer (Ctrl+Z)"
          disabled={!canUndo}
          onClick={actions.undo}
        >
          <Undo2 size={16} />
        </button>
        <button
          type="button"
          className="icon-btn"
          title="Refazer (Ctrl+Shift+Z)"
          disabled={!canRedo}
          onClick={actions.redo}
        >
          <Redo2 size={16} />
        </button>
        <span className="vsep" />
        <button
          type="button"
          className={`btn${assistantOpen ? " is-on" : ""}`}
          onClick={() => useUi.setState({ assistantOpen: !assistantOpen })}
        >
          <Sparkles size={14} className="accent" /> Assistente
        </button>
        <button
          type="button"
          className={`btn${before ? " is-on" : ""}`}
          title="Compara com a imagem ao abrir. O projeto atual continua preservado."
          onClick={() => useUi.setState({ beforeAfter: !before })}
        >
          <Columns2 size={14} /> Antes / Depois
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => attempt(actions.exportDialog)}
        >
          <Download size={14} /> Exportar
        </button>
      </div>
    </div>
  );
}
