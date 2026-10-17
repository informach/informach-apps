import { focusOnMount } from "@informach/edi-desktop/renderer";
import { blendLabel } from "@shared/blendModes";
import { KIND_LABEL, type Layer } from "@shared/doc";
import {
  Blend,
  Copy,
  Eye,
  EyeOff,
  FolderOpen,
  Lock,
  Palette,
  Plus,
  SlidersHorizontal,
  Square,
  SquareDashed,
  Trash2,
  Type,
  Unlock,
} from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { getBitmap } from "@/engine/bitmaps";
import { renderText } from "@/engine/text";
import { renderVector } from "@/engine/vector";
import { actions, attempt } from "@/lib/actions";
import { addLayer, addMask, moveLayerTo, setLayerProps } from "@/lib/ops";
import { useDoc } from "@/state/doc";
import { useUi } from "@/state/ui";

/** Thumbnails synchronize with mutable bitmap content, not just layer props.
 * Subscribe at that boundary and debounce paint revisions without remounting canvases. */
function useThumbnailDrawing(draw: () => void): void {
  useEffect(() => {
    draw();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = useDoc.subscribe((next, previous) => {
      if (next.revision === previous.revision) return;
      clearTimeout(timer);
      timer = setTimeout(draw, 300);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [draw]);
}

function drawFit(canvas: HTMLCanvasElement, src: CanvasImageSource, w: number, h: number): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = 36 * dpr;
  canvas.height = 28 * dpr;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const s = Math.min(canvas.width / w, canvas.height / h);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, (canvas.width - w * s) / 2, (canvas.height - h * s) / 2, w * s, h * s);
}

function Thumb({ layer }: { layer: Layer }): ReactNode {
  const ref = useRef<HTMLCanvasElement>(null);
  const draw = useCallback(() => {
    const c = ref.current;
    if (!c) return;
    if (layer.kind === "raster") {
      const b = getBitmap(layer.bitmap);
      if (b) drawFit(c, b.canvas, b.canvas.width, b.canvas.height);
    } else if (layer.kind === "vector") {
      const doc = useDoc.getState().doc;
      if (doc) {
        const v = renderVector(layer, doc).canvas;
        drawFit(c, v, v.width, v.height);
      }
    } else if (layer.kind === "text") {
      const t = renderText(layer.text).canvas;
      drawFit(c, t, t.width, t.height);
    }
  }, [layer]);
  useThumbnailDrawing(draw);
  if (layer.kind === "solid") return <div className="lthumb" style={{ background: layer.color }} />;
  if (layer.kind === "gradient") {
    const g = layer.gradient;
    const stops = [...g.stops]
      .sort((a, b) => a.position - b.position)
      .map((s) => `${s.color} ${s.position * 100}%`);
    return (
      <div
        className="lthumb"
        style={{
          background:
            g.type === "linear"
              ? `linear-gradient(${g.angle + 90}deg, ${stops.join(",")})`
              : `radial-gradient(${stops.join(",")})`,
        }}
      />
    );
  }
  if (layer.kind === "adjust")
    return (
      <div className="lthumb" style={{ background: "var(--panel-3)" }}>
        <SlidersHorizontal size={14} />
      </div>
    );
  return (
    <div className="lthumb">
      <canvas ref={ref} />
    </div>
  );
}

function MaskThumb({ layer }: { layer: Layer }): ReactNode {
  const ref = useRef<HTMLCanvasElement>(null);
  const target = useUi((s) => s.paintTarget);
  const active = useDoc((s) => s.activeId === layer.id);
  const draw = useCallback(() => {
    const b = layer.mask && getBitmap(layer.mask.bitmap);
    if (b && ref.current) drawFit(ref.current, b.canvas, b.canvas.width, b.canvas.height);
  }, [layer]);
  useThumbnailDrawing(draw);
  if (!layer.mask) return null;
  return (
    <button
      type="button"
      aria-label={`Pintar máscara de ${layer.name}`}
      className={`lthumb mask${active && target === "mask" ? " is-target" : ""}${layer.mask.enabled ? "" : " is-off"}`}
      title="Máscara: clique para pintar nela (preto esconde, branco revela)"
      onClick={(e) => {
        e.stopPropagation();
        useDoc.getState().setActive(layer.id);
        useUi.setState({ paintTarget: "mask", fg: "#000000", bg: "#ffffff" });
      }}
    >
      <canvas ref={ref} />
    </button>
  );
}

function Row({
  layer,
  dropAt,
  onDrag,
}: {
  layer: Layer;
  dropAt: "above" | "below" | null;
  onDrag(e: React.DragEvent, id: string): void;
}): ReactNode {
  const active = useDoc((s) => s.activeId === layer.id);
  const target = useUi((s) => s.paintTarget);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(layer.name);
  return (
    <fieldset
      aria-label={`Camada ${layer.name}`}
      className={`layer-row${active ? " is-active" : ""}${layer.visible ? "" : " is-hidden"}${dropAt === "above" ? " drop-above" : dropAt === "below" ? " drop-below" : ""}`}
      draggable={!editing}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/x-edifoto-layer", layer.id);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => onDrag(e, layer.id)}
      onDrop={(e) => onDrag(e, layer.id)}
    >
      <button
        type="button"
        className="eye"
        title={layer.visible ? "Ocultar" : "Mostrar"}
        onClick={(e) => {
          e.stopPropagation();
          attempt(() => setLayerProps(layer.id, { visible: !layer.visible }));
        }}
      >
        {layer.visible ? <Eye size={14} /> : <EyeOff size={14} />}
      </button>
      <button
        type="button"
        aria-label={`Selecionar camada ${layer.name}`}
        className={
          layer.mask && active && target === "layer" ? "lthumb-wrap is-target" : "lthumb-wrap"
        }
        onClick={(e) => {
          e.stopPropagation();
          useDoc.getState().setActive(layer.id);
          useUi.setState({ paintTarget: "layer" });
        }}
        style={{
          display: "flex",
          borderRadius: 4,
          outline:
            layer.mask && active && target === "layer" ? "2px solid var(--accent)" : undefined,
        }}
      >
        <Thumb layer={layer} />
      </button>
      <MaskThumb layer={layer} />
      <div className="layer-info">
        {editing ? (
          <input
            className="layer-name-input"
            ref={focusOnMount}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={() => {
              setEditing(false);
              if (name.trim() && name !== layer.name)
                attempt(() => setLayerProps(layer.id, { name: name.trim() }));
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setName(layer.name);
                setEditing(false);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="layer-name"
            onClick={() => {
              useDoc.getState().setActive(layer.id);
              if (!active) useUi.setState({ paintTarget: "layer" });
            }}
            onDoubleClick={() => {
              setName(layer.name);
              setEditing(true);
            }}
            title="Duplo clique para renomear"
            onKeyDown={(event) => {
              if (event.key === "F2") {
                event.preventDefault();
                setName(layer.name);
                setEditing(true);
              }
            }}
          >
            {layer.name}
          </button>
        )}
        <span className="layer-meta">
          {KIND_LABEL[layer.kind]} · {blendLabel(layer.blendMode)} ·{" "}
          {Math.round(layer.opacity * layer.fill * 100)}%
        </span>
      </div>
      <button
        type="button"
        className="end"
        title={layer.locked ? "Desbloquear" : "Bloquear"}
        style={{ opacity: layer.locked ? 1 : 0.35 }}
        onClick={(e) => {
          e.stopPropagation();
          attempt(() => setLayerProps(layer.id, { locked: !layer.locked }));
        }}
      >
        {layer.locked ? <Lock size={12} /> : <Unlock size={12} />}
      </button>
    </fieldset>
  );
}

export function LayersList(): ReactNode {
  const layers = useDoc((s) => s.doc?.layers ?? []);
  const [drop, setDrop] = useState<{ id: string; at: "above" | "below" } | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const top = [...layers]
    .reverse()
    .filter(
      (l) =>
        l.name.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")) &&
        (kind === "all" || l.kind === kind),
    );

  const onDrag = (e: React.DragEvent, overId: string): void => {
    if (!e.dataTransfer.types.includes("text/x-edifoto-layer")) return;
    e.preventDefault();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const at = e.clientY < r.top + r.height / 2 ? "above" : "below";
    if (e.type === "drop") {
      const id = e.dataTransfer.getData("text/x-edifoto-layer");
      setDrop(null);
      const from = layers.findIndex((l) => l.id === id);
      const over = layers.findIndex((l) => l.id === overId);
      if (from < 0 || over < 0 || id === overId) return;
      // Stack indices are bottom-first: "above" in the list = higher index.
      let to = at === "above" ? over + 1 : over;
      if (from < to) to--;
      attempt(() => moveLayerTo(id, to));
    } else if (drop?.id !== overId || drop.at !== at) setDrop({ id: overId, at });
  };

  return (
    <fieldset className="layers" aria-label="Camadas" onDragLeave={() => setDrop(null)}>
      <div className="layers-head">
        <strong>
          Camadas{" "}
          <span className="muted mono" style={{ fontSize: 11, fontWeight: 400 }}>
            {layers.length}
          </span>
        </strong>
      </div>
      <div className="layer-search">
        <input
          className="field"
          aria-label="Buscar camadas"
          placeholder="Buscar camadas…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="field"
          aria-label="Filtrar camadas"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          <option value="all">Todos os tipos</option>
          {Object.entries(KIND_LABEL).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {!top.length && <p className="hint">Nenhuma camada encontrada.</p>}
      {top.map((l) => (
        <Row key={l.id} layer={l} dropAt={drop?.id === l.id ? drop.at : null} onDrag={onDrag} />
      ))}
    </fieldset>
  );
}

export function LayersFooter(): ReactNode {
  const [menu, setMenu] = useState(false);
  const hasDoc = useDoc((s) => !!s.doc);
  const activeHasMask = useDoc((s) => !!s.doc?.layers.find((l) => l.id === s.activeId)?.mask);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent): void => {
      if (!ref.current?.contains(e.target as Node)) setMenu(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menu]);
  if (!hasDoc) return null;
  const item = (icon: ReactNode, label: string, run: () => unknown): ReactNode => (
    <button
      type="button"
      className="menu-item"
      onClick={() => {
        setMenu(false);
        attempt(run);
      }}
    >
      {icon}
      {label}
    </button>
  );
  return (
    <div className="layers-foot" ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className={`icon-btn${menu ? " is-on" : ""}`}
        title="Nova camada"
        onClick={() => setMenu(!menu)}
      >
        <Plus size={16} />
      </button>
      {menu && (
        <div className="menu add-menu">
          {item(<Square size={14} />, "Camada vazia (para pintar)", actions.newLayer)}
          {item(<SlidersHorizontal size={14} />, "Camada de ajuste", () => {
            addLayer({ kind: "adjust" });
            useUi.setState({ tab: "props" });
          })}
          {item(<Palette size={14} />, "Cor sólida", () =>
            addLayer({ kind: "solid", color: useUi.getState().fg }),
          )}
          {item(<Blend size={14} />, "Gradiente", () => addLayer({ kind: "gradient" }))}
          {item(<Type size={14} />, "Texto", () => {
            addLayer({ kind: "text" });
            useUi.setState((s) => ({ tab: "props", focusText: s.focusText + 1 }));
          })}
          <div className="menu-sep" />
          {item(<FolderOpen size={14} />, "Imagem do computador…", actions.place)}
        </div>
      )}
      <button
        type="button"
        className="icon-btn"
        title={
          activeHasMask
            ? "Já tem máscara (clique na miniatura dela para pintar)"
            : "Adicionar máscara"
        }
        onClick={() =>
          attempt(() => {
            const id = useDoc.getState().activeId;
            if (!id) throw new Error("Selecione uma camada.");
            if (!activeHasMask) addMask(id);
            useUi.setState({ paintTarget: "mask", fg: "#000000", bg: "#ffffff" });
          })
        }
      >
        <SquareDashed size={15} />
      </button>
      <button
        type="button"
        className="icon-btn"
        title="Nova camada de ajuste"
        onClick={() =>
          attempt(() => {
            addLayer({ kind: "adjust" });
            useUi.setState({ tab: "props" });
          })
        }
      >
        <SlidersHorizontal size={15} />
      </button>
      <button
        type="button"
        className="icon-btn"
        title="Duplicar (Ctrl+J)"
        onClick={() => attempt(actions.duplicate)}
      >
        <Copy size={15} />
      </button>
      <button
        type="button"
        className="icon-btn"
        title="Apagar camada (Del)"
        onClick={() => attempt(actions.remove)}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}
