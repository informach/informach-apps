import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Check,
  FlipHorizontal2,
  FlipVertical2,
  RotateCw,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { attempt } from "@/lib/actions";
import { aspectRect, crop, editLayer, setTransform } from "@/lib/ops";
import { fitView } from "@/lib/view";
import { useDoc } from "@/state/doc";
import { BRUSH_MODES, type BrushSettings, useUi } from "@/state/ui";
import { ColorSwatch } from "@/ui/controls";
import { FontPicker } from "./FontPicker";
import { toolInfo } from "./ToolRail";
import { SelectionOptions, VectorOptions } from "./VectorControls";

const ASPECTS: { label: string; value: number | null | "orig" }[] = [
  { label: "Livre", value: null },
  { label: "Original", value: "orig" },
  { label: "1:1", value: 1 },
  { label: "4:5", value: 4 / 5 },
  { label: "3:2", value: 3 / 2 },
  { label: "16:9", value: 16 / 9 },
  { label: "9:16", value: 9 / 16 },
];

function Num({
  label,
  value,
  min,
  max,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange(v: number): void;
}): ReactNode {
  return (
    <label className="opt">
      {label}
      <input
        className="field opt-num"
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
        }}
        onKeyDown={(e) => e.stopPropagation()}
      />
      {unit}
    </label>
  );
}

function BrushOptions({ which }: { which: "brush" | "eraser" }): ReactNode {
  const s = useUi((u) => u[which]);
  const target = useUi((u) => u.paintTarget);
  const hasMask = useDoc((d) => !!d.doc?.layers.find((l) => l.id === d.activeId)?.mask);
  const set = (p: Partial<BrushSettings>): void => {
    useUi.setState({ [which]: { ...s, ...p } } as never);
  };
  return (
    <>
      <Num
        label="Tamanho"
        value={s.size}
        min={1}
        max={2000}
        unit="px"
        onChange={(size) => set({ size })}
      />
      <Num
        label="Dureza"
        value={s.hardness}
        min={0}
        max={100}
        unit="%"
        onChange={(hardness) => set({ hardness })}
      />
      <Num
        label="Opacidade"
        value={s.opacity}
        min={1}
        max={100}
        unit="%"
        onChange={(opacity) => set({ opacity })}
      />
      <Num
        label="Fluxo"
        value={s.flow}
        min={1}
        max={100}
        unit="%"
        onChange={(flow) => set({ flow })}
      />
      {which === "brush" && (
        <label className="opt">
          Modo
          <select
            className="field"
            value={s.mode}
            onChange={(e) => set({ mode: e.target.value as GlobalCompositeOperation })}
          >
            {BRUSH_MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {hasMask && (
        <div className="seg" title="Onde o pincel pinta">
          <button
            type="button"
            className={target === "layer" ? "is-on" : ""}
            onClick={() => useUi.setState({ paintTarget: "layer" })}
          >
            Camada
          </button>
          <button
            type="button"
            className={target === "mask" ? "is-on" : ""}
            onClick={() => useUi.setState({ paintTarget: "mask", fg: "#000000", bg: "#ffffff" })}
          >
            Máscara
          </button>
        </div>
      )}
      {target === "mask" && hasMask && (
        <span className="opt-hint">Preto esconde · branco revela · X troca</span>
      )}
    </>
  );
}

function MoveOptions(): ReactNode {
  const auto = useUi((s) => s.autoSelect);
  const layer = useDoc((s) => s.doc?.layers.find((l) => l.id === s.activeId));
  const placed =
    layer && (layer.kind === "raster" || layer.kind === "text" || layer.kind === "vector")
      ? layer
      : null;
  return (
    <>
      <label className="check">
        <input
          type="checkbox"
          checked={auto}
          onChange={(e) => useUi.setState({ autoSelect: e.target.checked })}
        />
        Selecionar camada ao clicar
      </label>
      {placed && (
        <>
          <Num
            label="Escala"
            value={Math.round(placed.transform.scale * 1000) / 10}
            min={1}
            max={5000}
            unit="%"
            onChange={(v) => attempt(() => setTransform(placed.id, { scale: v / 100 }))}
          />
          <Num
            label="Rotação"
            value={Math.round(placed.transform.rotation * 10) / 10}
            min={-360}
            max={360}
            unit="°"
            onChange={(v) => attempt(() => setTransform(placed.id, { rotation: v }))}
          />
          <button
            type="button"
            className="icon-btn"
            title="Girar 90°"
            onClick={() =>
              attempt(() =>
                setTransform(placed.id, { rotation: (placed.transform.rotation + 90) % 360 }),
              )
            }
          >
            <RotateCw size={15} />
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Espelhar na horizontal"
            onClick={() =>
              attempt(() => setTransform(placed.id, { flipX: !placed.transform.flipX }))
            }
          >
            <FlipHorizontal2 size={15} />
          </button>
          <button
            type="button"
            className="icon-btn"
            title="Espelhar na vertical"
            onClick={() =>
              attempt(() => setTransform(placed.id, { flipY: !placed.transform.flipY }))
            }
          >
            <FlipVertical2 size={15} />
          </button>
          <span className="opt-hint">
            Arraste os cantos para redimensionar · Shift livre · alça de cima gira
          </span>
        </>
      )}
    </>
  );
}

function CropOptions(): ReactNode {
  const box = useUi((s) => s.crop);
  const doc = useDoc((s) => s.doc);
  if (!doc) return null;
  const choose = (v: number | null | "orig"): void => {
    const aspect = v === "orig" ? doc.width / doc.height : v;
    useUi.setState({
      crop: aspect
        ? { ...aspectRect(doc, aspect), aspect }
        : { x: 0, y: 0, w: doc.width, h: doc.height, aspect: null },
    });
  };
  const current = box?.aspect ?? null;
  return (
    <>
      <div className="seg">
        {ASPECTS.map((a) => {
          const val = a.value === "orig" ? doc.width / doc.height : a.value;
          const on =
            a.value === null
              ? current === null
              : current !== null &&
                val !== null &&
                Math.abs(current - val) < 0.001 &&
                (a.value !== "orig" ||
                  !ASPECTS.some(
                    (b) => typeof b.value === "number" && Math.abs(b.value - val) < 0.001,
                  ));
          return (
            <button
              type="button"
              key={a.label}
              className={on ? "is-on" : ""}
              onClick={() => choose(a.value)}
            >
              {a.label}
            </button>
          );
        })}
      </div>
      {box && (
        <span className="opt-hint mono">
          {Math.round(box.w)} × {Math.round(box.h)}
        </span>
      )}
      <span className="spacer" />
      <button
        type="button"
        className="btn"
        onClick={() => useUi.setState({ crop: null, tool: "move" })}
      >
        <X size={14} /> Cancelar
      </button>
      <button
        type="button"
        className="btn btn-primary"
        disabled={!box}
        onClick={() =>
          box &&
          attempt(() => {
            crop(box.x, box.y, box.w, box.h);
            useUi.setState({ crop: null, tool: "move" });
            fitView();
          })
        }
      >
        <Check size={14} /> Cortar
      </button>
    </>
  );
}

function TextOptions(): ReactNode {
  const layer = useDoc((s) => s.doc?.layers.find((l) => l.id === s.activeId));
  if (!layer || layer.kind !== "text")
    return (
      <span className="opt-hint">
        Clique na imagem para criar um texto. Edite o conteúdo no painel Propriedades.
      </span>
    );
  const t = layer.text;
  const edit = (p: Partial<typeof t>): void => {
    attempt(() => editLayer(layer.id, { text: p }));
  };
  return (
    <>
      <FontPicker value={t.font} onChange={(font) => edit({ font })} />
      <Num
        label="Tamanho"
        value={t.size}
        min={4}
        max={2000}
        unit="px"
        onChange={(size) => edit({ size })}
      />
      <label className="opt">
        Peso
        <select
          className="field"
          value={t.weight}
          onChange={(e) => edit({ weight: Number(e.target.value) })}
        >
          {[300, 400, 500, 600, 700, 800, 900].map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
      </label>
      <ColorSwatch value={t.color} onChange={(color) => edit({ color })} />
      <div className="seg">
        {(["left", "center", "right"] as const).map((a) => {
          const Icon = a === "left" ? AlignLeft : a === "center" ? AlignCenter : AlignRight;
          return (
            <button
              type="button"
              key={a}
              className={t.align === a ? "is-on" : ""}
              onClick={() => edit({ align: a })}
            >
              <Icon size={13} />
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className={`btn${t.italic ? " is-on" : ""}`}
        style={{ height: 26, fontStyle: "italic" }}
        onClick={() => edit({ italic: !t.italic })}
      >
        I
      </button>
    </>
  );
}

export function OptionsBar(): ReactNode {
  const tool = useUi((s) => s.tool);
  const info = toolInfo(tool);
  return (
    <div className="optionsbar">
      <div className="opt-tool">
        <info.icon size={15} />
        {info.label}
      </div>
      <span className="vsep" />
      {(tool === "pen" || tool === "shape") && <VectorOptions />}
      {["select", "lasso", "wand"].includes(tool) && <SelectionOptions />}
      {(tool === "clone" || tool === "blur") && <BrushOptions which="brush" />}
      {tool === "brush" && <BrushOptions which="brush" />}
      {tool === "eraser" && <BrushOptions which="eraser" />}
      {tool === "move" && <MoveOptions />}
      {tool === "crop" && <CropOptions />}
      {tool === "text" && <TextOptions />}
      {tool === "eyedropper" && (
        <span className="opt-hint">
          Clique para pegar uma cor da imagem (Alt pega a cor secundária).
        </span>
      )}
      {tool === "hand" && (
        <span className="opt-hint">
          Arraste para mover a vista. Roda do mouse aproxima e afasta.
        </span>
      )}
      {tool === "zoom" && (
        <span className="opt-hint">Clique para aproximar, Alt+clique para afastar.</span>
      )}
    </div>
  );
}
