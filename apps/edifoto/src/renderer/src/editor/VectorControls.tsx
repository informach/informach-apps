import type { ShapeKind, VectorLayer, VectorStyle } from "@shared/doc";
import { SHAPE_LABELS } from "@shared/vector";
import { Circle, Minus, Pentagon, Square, Star, Triangle } from "lucide-react";
import type { ReactNode } from "react";
import { attempt } from "@/lib/actions";
import { setLayerProps, setTransform } from "@/lib/ops";
import {
  clearSelection,
  invertSelection,
  refineSelection,
  selectionMask,
  vectorSelection,
} from "@/lib/selection";
import { editVector, finishPen } from "@/lib/vector";
import { useDoc } from "@/state/doc";
import { type SelectionMode, useUi } from "@/state/ui";
import { ColorSwatch, NumberField } from "@/ui/controls";

function Appearance({
  v,
  set,
}: {
  v: VectorStyle;
  set: (p: Partial<VectorStyle>) => void;
}): ReactNode {
  return (
    <>
      <label className="check">
        <input
          type="checkbox"
          checked={!!v.fillColor}
          onChange={(e) => set({ fillColor: e.target.checked ? useUi.getState().fg : null })}
        />
        Preenchimento
      </label>
      {v.fillColor && (
        <>
          <ColorSwatch value={v.fillColor} onChange={(fillColor) => set({ fillColor })} />
          <NumberField
            label="Preenchimento %"
            value={Math.round((v.fillOpacity ?? 1) * 100)}
            onChange={(n) => set({ fillOpacity: Math.max(0, Math.min(100, n)) / 100 })}
          />
        </>
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={!!v.strokeColor}
          onChange={(e) => set({ strokeColor: e.target.checked ? "#ffffff" : null })}
        />
        Contorno
      </label>
      {v.strokeColor && (
        <>
          <ColorSwatch value={v.strokeColor} onChange={(strokeColor) => set({ strokeColor })} />
          <NumberField
            label="Espessura (px)"
            value={v.strokeWidth}
            onChange={(strokeWidth) =>
              set({ strokeWidth: Math.max(0, Math.min(500, strokeWidth)) })
            }
          />
        </>
      )}
    </>
  );
}
export function VectorOptions(): ReactNode {
  const defaults = useUi((s) => s.vector),
    tool = useUi((s) => s.tool),
    points = useUi((s) => s.penPoints);
  const active = useDoc((s) => s.doc?.layers.find((l) => l.id === s.activeId));
  const selected =
    active?.kind === "vector" &&
    !points.length &&
    ((tool === "pen" && active.vector.shape === "path") ||
      (tool === "shape" && active.vector.shape !== "path"))
      ? active
      : null;
  const v = selected?.vector ?? defaults;
  const set = (p: Partial<VectorStyle>): void => {
    useUi.setState({ vector: { ...defaults, ...p } });
    if (selected) attempt(() => editVector(selected.id, p));
  };
  return (
    <>
      {tool === "shape" && (
        <select
          aria-label="Forma"
          className="field"
          value={v.shape === "path" ? "rectangle" : v.shape}
          onChange={(e) => set({ shape: e.target.value as ShapeKind })}
        >
          {Object.entries(SHAPE_LABELS)
            .filter(([k]) => k !== "path")
            .map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
        </select>
      )}
      {tool === "pen" && (
        <select
          className="field"
          aria-label="Modo da caneta"
          value={v.fillColor ? "shape" : "path"}
          onChange={(e) =>
            set({ fillColor: e.target.value === "path" ? null : useUi.getState().fg })
          }
        >
          <option value="path">Traçado</option>
          <option value="shape">Forma preenchida</option>
        </select>
      )}
      <Appearance v={v} set={set} />
      {tool === "shape" && (
        <>
          <NumberField
            label="Raio"
            value={v.radius}
            onChange={(radius) => set({ radius: Math.max(0, radius) })}
          />
          <select
            className="field"
            aria-label="Alinhar contorno"
            value={v.strokeAlign}
            onChange={(e) => set({ strokeAlign: e.target.value as VectorStyle["strokeAlign"] })}
          >
            <option value="inside">Interno</option>
            <option value="center">Centralizado</option>
            <option value="outside">Externo</option>
          </select>
          {selected && (
            <>
              <NumberField
                label="Rotação"
                value={selected.transform.rotation}
                onChange={(rotation) => attempt(() => setTransform(selected.id, { rotation }))}
              />
              <NumberField
                label="Opacidade %"
                value={Math.round(selected.opacity * 100)}
                onChange={(n) =>
                  attempt(() =>
                    setLayerProps(selected.id, { opacity: Math.max(0, Math.min(100, n)) / 100 }),
                  )
                }
              />
            </>
          )}
        </>
      )}
      {selected && (
        <button
          type="button"
          className="btn"
          onClick={() => {
            useDoc.getState().setActive(null);
            useUi.setState({ penSelected: null });
          }}
        >
          Novo {tool === "pen" ? "traçado" : "desenho"}
        </button>
      )}
      {tool === "pen" ? (
        <>
          <button
            type="button"
            className="btn"
            disabled={points.length < 3}
            onClick={() => attempt(() => finishPen(true))}
          >
            Fechar traçado
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={points.length < 2}
            onClick={() => attempt(() => finishPen())}
          >
            Concluir
          </button>
          <span className="opt-hint">Arraste para curvar · Enter conclui · Esc cancela</span>
        </>
      ) : (
        <span className="opt-hint">Shift: proporção · Alt: a partir do centro</span>
      )}
    </>
  );
}
export function SelectionOptions(): ReactNode {
  const selection = useUi((s) => s.selection),
    tolerance = useUi((s) => s.tolerance),
    tool = useUi((s) => s.tool),
    mode = useUi((s) => s.selectionMode);
  return (
    <>
      <label className="opt">
        Modo
        <select
          className="field"
          aria-label="Modo de seleção"
          value={mode}
          onChange={(e) => useUi.setState({ selectionMode: e.target.value as SelectionMode })}
        >
          <option value="replace">Nova seleção</option>
          <option value="add">Adicionar</option>
          <option value="subtract">Subtrair</option>
          <option value="intersect">Interseção</option>
        </select>
      </label>
      <span className="opt-hint">Shift: somar · Alt: subtrair · Shift+Alt: interseção</span>
      {tool === "wand" && (
        <NumberField
          label="Tolerância"
          value={tolerance}
          onChange={(v) => useUi.setState({ tolerance: Math.max(0, Math.min(255, v)) })}
        />
      )}
      <button
        type="button"
        className="btn"
        disabled={!selection}
        onClick={() => attempt(() => selectionMask())}
      >
        Criar máscara
      </button>
      <button type="button" className="btn" onClick={() => attempt(invertSelection)}>
        Inverter seleção
      </button>
      <button
        type="button"
        className="btn"
        disabled={!selection}
        onClick={() => attempt(() => refineSelection(2, 0))}
      >
        Expandir 2 px
      </button>
      <button
        type="button"
        className="btn"
        disabled={!selection}
        onClick={() => attempt(() => refineSelection(-2, 0))}
      >
        Recolher 2 px
      </button>
      <button
        type="button"
        className="btn"
        disabled={!selection}
        onClick={() => attempt(() => refineSelection(0, 4))}
      >
        Suavizar 4 px
      </button>
      <button type="button" className="btn" disabled={!selection} onClick={clearSelection}>
        Desmarcar · Ctrl+D
      </button>
    </>
  );
}
export function VectorProperties({ layer }: { layer: VectorLayer }): ReactNode {
  const v = layer.vector,
    selected = useUi((s) => s.penSelected);
  const set = (p: Partial<VectorStyle>): void => {
    attempt(() => editVector(layer.id, p));
  };
  const point = selected === null ? null : v.points[selected];
  const mask = (): void => {
    vectorSelection(layer);
    const d = useDoc.getState().doc!,
      i = d.layers.findIndex((l) => l.id === layer.id);
    if (i <= 0) throw new Error("Adicione uma camada abaixo do traçado.");
    selectionMask(d.layers[i - 1].id);
    useDoc.getState().setActive(d.layers[i - 1].id);
  };
  return (
    <>
      <div className="section">
        <span className="label">{SHAPE_LABELS[v.shape]}</span>
        <label>
          Nome
          <input
            key={layer.id + layer.name}
            className="field"
            aria-label="Nome do vetor"
            defaultValue={layer.name}
            onBlur={(e) => {
              if (e.target.value.trim())
                attempt(() => setLayerProps(layer.id, { name: e.target.value.trim() }));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
        </label>
        {v.shape === "path" && (
          <select
            className="field"
            aria-label="Modo"
            value={v.fillColor ? "shape" : "path"}
            onChange={(e) =>
              set({ fillColor: e.target.value === "path" ? null : useUi.getState().fg })
            }
          >
            <option value="path">Traçado</option>
            <option value="shape">Forma preenchida</option>
          </select>
        )}
        {v.shape !== "path" && (
          <div className="shape-grid">
            {(
              [
                ["rectangle", Square],
                ["ellipse", Circle],
                ["triangle", Triangle],
                ["polygon", Pentagon],
                ["star", Star],
                ["line", Minus],
              ] as const
            ).map(([kind, Icon]) => (
              <button
                type="button"
                key={kind}
                className={`btn${v.shape === kind ? " is-on" : ""}`}
                aria-pressed={v.shape === kind}
                onClick={() => set({ shape: kind, closed: kind !== "line" })}
              >
                <Icon size={20} />
                {SHAPE_LABELS[kind]}
              </button>
            ))}
          </div>
        )}
        {v.shape !== "path" && (
          <select
            aria-label="Tipo de forma"
            className="field"
            value={v.shape}
            onChange={(e) =>
              set({ shape: e.target.value as ShapeKind, closed: e.target.value !== "line" })
            }
          >
            {Object.entries(SHAPE_LABELS)
              .filter(([k]) => k !== "path")
              .map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
          </select>
        )}
        <div className="grid2">
          <NumberField
            label="Largura"
            value={v.width}
            onChange={(width) => set({ width: Math.max(1, width) })}
          />
          <NumberField
            label="Altura"
            value={v.height}
            onChange={(height) => set({ height: Math.max(1, height) })}
          />
        </div>
        {v.shape === "rectangle" && (
          <NumberField
            label="Raio"
            value={v.radius}
            onChange={(radius) => set({ radius: Math.max(0, radius) })}
          />
        )}
        {(v.shape === "polygon" || v.shape === "star") && (
          <NumberField
            label="Lados / pontas"
            value={v.sides}
            onChange={(sides) => set({ sides: Math.max(3, Math.min(40, Math.round(sides))) })}
          />
        )}
        {v.shape === "star" && (
          <NumberField
            label="Raio interno %"
            value={v.innerRadius * 100}
            onChange={(n) => set({ innerRadius: Math.max(0.05, Math.min(0.95, n / 100)) })}
          />
        )}
      </div>
      <div className="section">
        <span className="label">Aparência</span>
        <Appearance v={v} set={set} />
        <select
          aria-label="Alinhar contorno"
          className="field"
          value={v.strokeAlign}
          onChange={(e) => set({ strokeAlign: e.target.value as VectorStyle["strokeAlign"] })}
        >
          <option value="inside">Interno</option>
          <option value="center">Centralizado</option>
          <option value="outside">Externo</option>
        </select>
      </div>
      {v.shape === "path" && (
        <div className="section">
          <span className="label">Pontos e curvas</span>
          <button type="button" className="btn" onClick={() => useUi.setState({ tool: "pen" })}>
            Editar pontos na imagem
          </button>
          <label className="check">
            <input
              type="checkbox"
              checked={v.closed}
              onChange={(e) => set({ closed: e.target.checked })}
            />
            Traçado fechado
          </label>
          {point && (
            <>
              <span>
                Ponto {selected! + 1} / {v.points.length}
              </span>
              <label>
                Alças
                <select
                  className="field"
                  aria-label="Alças"
                  value={point.smooth ? "linked" : "free"}
                  onChange={(e) =>
                    set({
                      points: v.points.map((p, i) =>
                        i !== selected
                          ? p
                          : {
                              ...p,
                              smooth: e.target.value === "linked",
                              incoming:
                                e.target.value === "linked" && p.outgoing
                                  ? { x: 2 * p.x - p.outgoing.x, y: 2 * p.y - p.outgoing.y }
                                  : p.incoming,
                            },
                      ),
                    })
                  }
                >
                  <option value="linked">Vinculadas</option>
                  <option value="free">Independentes</option>
                </select>
              </label>
              <div className="row">
                {["Canto", "Suave"].map((label, i) => (
                  <button
                    type="button"
                    key={label}
                    className="btn"
                    onClick={() =>
                      set({
                        points: v.points.map((p, j) =>
                          j !== selected
                            ? p
                            : {
                                ...p,
                                smooth: !!i,
                                incoming: i ? { x: p.x - 30, y: p.y } : undefined,
                                outgoing: i ? { x: p.x + 30, y: p.y } : undefined,
                              },
                        ),
                      })
                    }
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  className="btn"
                  disabled={v.points.length <= 2}
                  onClick={() => {
                    set({ points: v.points.filter((_, i) => i !== selected) });
                    useUi.setState({ penSelected: null });
                  }}
                >
                  Excluir ponto
                </button>
              </div>
            </>
          )}
          <span className="hint">
            Arraste os pontos e alças. Alt move uma alça de forma independente.
          </span>
        </div>
      )}
      <div className="section">
        <button
          type="button"
          className="btn"
          disabled={!v.closed || v.shape === "line"}
          onClick={() => attempt(() => vectorSelection(layer))}
        >
          Criar seleção
        </button>
        <button
          type="button"
          className="btn"
          disabled={!v.closed || v.shape === "line"}
          onClick={() => attempt(mask)}
        >
          Máscara na camada abaixo
        </button>
      </div>
    </>
  );
}
