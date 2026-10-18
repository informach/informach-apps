import {
  type Adjust,
  type AdjustLayer,
  DEFAULT_ADJUST,
  type GradientLayer,
  KIND_LABEL,
  type Layer,
  type RasterLayer,
  type TextLayer,
  type VectorLayer,
} from "@shared/doc";
import { IMAGE_STYLES } from "@shared/styles";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Blend,
  Image as ImageIcon,
  Minus,
  Palette,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  SquareDashed,
  Type,
} from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";
import { attempt } from "@/lib/actions";
import { readImageFile } from "@/lib/files";
import { alignLayer, replaceImageSlot } from "@/lib/layout";
import {
  editLayer,
  invertMask,
  removeMask,
  requireDoc,
  setMaskEnabled,
  setMaskLinked,
  setTransform,
  shapeMask,
} from "@/lib/ops";
import { applyStyle } from "@/lib/styles";
import { useDoc } from "@/state/doc";
import { useUi } from "@/state/ui";
import { ColorSwatch, NumberField, Slider, Toggle } from "@/ui/controls";
import { FontPicker } from "./FontPicker";
import { VectorProperties } from "./VectorControls";

function AdjustProps({ layer }: { layer: AdjustLayer }): ReactNode {
  const a = layer.adjust;
  const advanced = useUi((s) => s.advanced);
  const set = (p: Partial<Adjust>): void => {
    attempt(() => editLayer(layer.id, { adjust: p }));
  };
  const s = (
    key: keyof Adjust,
    label: string,
    min = -100,
    max = 100,
    extra: Partial<Parameters<typeof Slider>[0]> = {},
  ): ReactNode => (
    <Slider
      key={key}
      label={label}
      value={a[key] as number}
      min={min}
      max={max}
      centered
      reset={0}
      onChange={(v) => set({ [key]: v })}
      {...extra}
    />
  );
  const lv = a.levels;
  const avg = (v: number[]): number => Math.round((v[0] + v[1] + v[2]) / 3);
  return (
    <>
      {layer.role === "style" && (
        <div className="section">
          <span className="label">Estilo</span>
          <select
            aria-label="Estilo da imagem"
            className="field"
            value={layer.preset ?? "natural"}
            onChange={(event) => {
              const style = IMAGE_STYLES.find((item) => item.id === event.target.value);
              if (style) attempt(() => applyStyle(style.id, layer.opacity * 100));
            }}
          >
            {IMAGE_STYLES.map((style) => (
              <option key={style.id} value={style.id}>
                {style.name}
              </option>
            ))}
          </select>
          <Slider
            label="Intensidade"
            value={Math.round(layer.opacity * 100)}
            min={0}
            max={100}
            unit="%"
            onChange={(value) => attempt(() => applyStyle(layer.preset ?? "natural", value))}
          />
          <p className="hint">O estilo fica em uma camada editável e pode ser removido.</p>
        </div>
      )}
      {advanced && (
        <div className="section">
          <span className="label">Curvas de luminosidade</span>
          {["Pretos", "Sombras", "Meios-tons", "Realces", "Brancos"].map((label, i) => (
            <Slider
              key={label}
              label={label}
              min={0}
              max={100}
              value={Math.round((a.curves ?? [0, 0.25, 0.5, 0.75, 1])[i] * 100)}
              reset={i * 25}
              unit="%"
              onChange={(v) =>
                set({
                  curves: (a.curves ?? [0, 0.25, 0.5, 0.75, 1]).map((n, j) =>
                    j === i ? v / 100 : n,
                  ) as [number, number, number, number, number],
                })
              }
            />
          ))}
          <button
            type="button"
            className="btn"
            onClick={() => set({ curves: [0, 0.25, 0.5, 0.75, 1] })}
          >
            Zerar curva
          </button>
        </div>
      )}
      <div className="section">
        <div className="section-head">
          <span className="label">Luz</span>
          <button
            type="button"
            className="link"
            onClick={() => set({ ...DEFAULT_ADJUST, curves: [0, 0.25, 0.5, 0.75, 1] })}
          >
            <RotateCcw size={11} /> Zerar tudo
          </button>
        </div>
        {s("exposure", "Exposição", -3, 3, { step: 0.01, digits: 2, unit: " EV" })}
        {s("brightness", "Brilho")}
        {s("contrast", "Contraste")}
        {s("highlights", "Realces")}
        {s("shadows", "Sombras")}
      </div>
      <div className="section">
        <span className="label">Cor</span>
        {s("temperature", "Temperatura", -100, 100, { track: "temp" })}
        {s("tint", "Tonalidade", -100, 100, { track: "tint" })}
        {s("vibrance", "Vibração")}
        {s("saturation", "Saturação")}
        {s("hue", "Matiz", -180, 180, { track: "hue", unit: "°" })}
        <div className="toggle-row">
          Preto e branco <Toggle on={a.grayscale} onChange={(v) => set({ grayscale: v })} />
        </div>
        <div className="toggle-row">
          Inverter cores <Toggle on={a.invert} onChange={(v) => set({ invert: v })} />
        </div>
      </div>
      {advanced && (
        <div className="section">
          <span className="label">Níveis</span>
          <Slider
            label="Ponto preto"
            value={avg(lv.black)}
            min={0}
            max={254}
            reset={0}
            onChange={(v) => set({ levels: { ...lv, black: [v, v, v] } })}
          />
          <Slider
            label="Ponto branco"
            value={avg(lv.white)}
            min={1}
            max={255}
            reset={255}
            onChange={(v) => set({ levels: { ...lv, white: [v, v, v] } })}
          />
          <Slider
            label="Meios-tons (gama)"
            value={lv.gamma}
            min={0.2}
            max={3}
            step={0.01}
            digits={2}
            reset={1}
            onChange={(v) => set({ levels: { ...lv, gamma: v } })}
          />
          {(new Set(lv.black).size > 1 || new Set(lv.white).size > 1) && (
            <span className="hint">
              Por canal: preto R{lv.black[0]} G{lv.black[1]} B{lv.black[2]} · branco R{lv.white[0]}{" "}
              G{lv.white[1]} B{lv.white[2]}
            </span>
          )}
        </div>
      )}
    </>
  );
}

function TextProps({ layer }: { layer: TextLayer }): ReactNode {
  const t = layer.text;
  const focus = useUi((s) => s.focusText);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!focus || !ref.current) return;
    ref.current.focus();
    ref.current.select();
  }, [focus]);
  const edit = (p: Partial<typeof t>): void => {
    attempt(() => editLayer(layer.id, { text: p }));
  };
  return (
    <div className="section">
      <span className="label">Texto</span>
      <textarea
        ref={ref}
        className="field"
        rows={3}
        value={t.content}
        onChange={(e) => edit({ content: e.target.value })}
        style={{ userSelect: "text" }}
      />
      <div className="row">
        <div className="grow">
          <FontPicker value={t.font} onChange={(font) => edit({ font })} />
        </div>
        <ColorSwatch value={t.color} onChange={(color) => edit({ color })} />
      </div>
      <div className="row">
        <select
          className="field grow"
          value={t.weight}
          onChange={(e) => edit({ weight: Number(e.target.value) })}
        >
          {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => (
            <option key={w} value={w}>
              Peso {w}
            </option>
          ))}
        </select>
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
          <button
            type="button"
            className={t.italic ? "is-on" : ""}
            style={{ fontStyle: "italic", fontWeight: 600 }}
            onClick={() => edit({ italic: !t.italic })}
          >
            I
          </button>
        </div>
      </div>
      <Slider
        label="Tamanho"
        value={t.size}
        min={8}
        max={800}
        unit=" px"
        onChange={(size) => edit({ size })}
      />
      <NumberField
        label="Largura do texto"
        value={t.maxWidth ?? 0}
        min={0}
        max={8192}
        onChange={(width) => edit({ maxWidth: width >= 20 ? width : undefined })}
      />
      <Slider
        label="Entrelinha"
        value={t.lineHeight}
        min={0.6}
        max={3}
        step={0.01}
        digits={2}
        reset={1.15}
        onChange={(lineHeight) => edit({ lineHeight })}
      />
      <Slider
        label="Espaçamento"
        value={t.letterSpacing}
        min={-20}
        max={100}
        unit=" px"
        reset={0}
        onChange={(letterSpacing) => edit({ letterSpacing })}
      />
    </div>
  );
}

function PlacementProps({ layer }: { layer: RasterLayer | TextLayer | VectorLayer }): ReactNode {
  const t = layer.transform;
  const set = (p: Partial<typeof t>): void => {
    attempt(() => setTransform(layer.id, p));
  };
  const fit = (cover: boolean): void => {
    const doc = requireDoc();
    if (layer.kind !== "raster") return;
    const f = cover
      ? Math.max(doc.width / layer.width, doc.height / layer.height)
      : Math.min(doc.width / layer.width, doc.height / layer.height);
    set({ x: doc.width / 2, y: doc.height / 2, scale: f, rotation: 0, basis: undefined });
  };
  return (
    <div className="section">
      <span className="label">Posição</span>
      <div className="alignment-grid">
        {(
          [
            ["left", "Esquerda"],
            ["center", "Centro"],
            ["right", "Direita"],
            ["top", "Topo"],
            ["middle", "Meio"],
            ["bottom", "Base"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className="btn"
            onClick={() => attempt(() => alignLayer(layer.id, id))}
          >
            {label}
          </button>
        ))}
      </div>
      {layer.role === "image-placeholder" && (
        <button
          type="button"
          className="btn btn-primary"
          onClick={() =>
            attempt(async () => {
              const state = useDoc.getState();
              const paths = await window.api.pickImages(false);
              if (!paths[0]) return;
              const canvas = await readImageFile(paths[0]);
              if (
                useDoc.getState().doc?.id !== state.doc?.id ||
                useDoc.getState().stateId !== state.stateId
              )
                throw new Error("A edição mudou. Escolha a imagem novamente.");
              replaceImageSlot(layer.id, canvas);
            })
          }
        >
          Escolher imagem…
        </button>
      )}
      <div className="grid2">
        <NumberField label="Centro X" value={t.x} onChange={(x) => set({ x })} />
        <NumberField label="Centro Y" value={t.y} onChange={(y) => set({ y })} />
        <NumberField
          label="Escala %"
          value={t.scale * 100}
          digits={1}
          onChange={(v) => set({ scale: Math.max(0.01, v / 100) })}
        />
        <NumberField
          label="Giro °"
          value={t.rotation}
          digits={1}
          onChange={(rotation) => set({ rotation })}
        />
      </div>
      <div className="row">
        <button
          type="button"
          className="btn"
          onClick={() => {
            const doc = requireDoc();
            set({ x: doc.width / 2, y: doc.height / 2 });
          }}
        >
          Centralizar
        </button>
        {layer.kind === "raster" && (
          <>
            <button type="button" className="btn" onClick={() => fit(false)}>
              Caber
            </button>
            <button type="button" className="btn" onClick={() => fit(true)}>
              Preencher
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function GradientProps({ layer }: { layer: GradientLayer }): ReactNode {
  const g = layer.gradient;
  const set = (p: Partial<typeof g>): void => {
    attempt(() => editLayer(layer.id, { gradient: p }));
  };
  const stops = [...g.stops].sort((a, b) => a.position - b.position);
  const css = `linear-gradient(90deg, ${stops
    .map(
      (s) =>
        `${s.color}${Math.round(s.opacity * 255)
          .toString(16)
          .padStart(2, "0")} ${s.position * 100}%`,
    )
    .join(",")})`;
  const setStop = (i: number, p: Partial<(typeof stops)[number]>): void => {
    set({ stops: stops.map((s, j) => (j === i ? { ...s, ...p } : s)) });
  };
  return (
    <div className="section">
      <div className="section-head">
        <span className="label">Gradiente</span>
        <div className="seg">
          <button
            type="button"
            className={g.type === "linear" ? "is-on" : ""}
            onClick={() => set({ type: "linear" })}
          >
            Linear
          </button>
          <button
            type="button"
            className={g.type === "radial" ? "is-on" : ""}
            onClick={() => set({ type: "radial" })}
          >
            Radial
          </button>
        </div>
      </div>
      <div className="gradient-bar" style={{ background: css }} />
      {stops.map((s, i) => (
        <div key={s.id} className="stop-row">
          <ColorSwatch value={s.color} onChange={(color) => setStop(i, { color })} />
          <div className="grow" style={{ flex: 1 }}>
            <Slider
              label={`Posição ${i + 1}`}
              value={Math.round(s.position * 100)}
              min={0}
              max={100}
              unit="%"
              onChange={(v) => setStop(i, { position: v / 100 })}
            />
          </div>
          <div style={{ width: 70 }}>
            <Slider
              label="Opac."
              value={Math.round(s.opacity * 100)}
              min={0}
              max={100}
              unit="%"
              onChange={(v) => setStop(i, { opacity: v / 100 })}
            />
          </div>
          <button
            type="button"
            className="icon-btn"
            disabled={stops.length <= 2}
            title="Remover cor"
            onClick={() => set({ stops: stops.filter((_, j) => j !== i) })}
          >
            <Minus size={13} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn"
        disabled={stops.length >= 8}
        onClick={() =>
          set({ stops: [...stops, { color: useUi.getState().fg, position: 0.5, opacity: 1 }] })
        }
      >
        <Plus size={13} /> Adicionar cor
      </button>
      {g.type === "linear" ? (
        <Slider
          label="Ângulo"
          value={g.angle}
          min={-180}
          max={180}
          unit="°"
          reset={90}
          onChange={(angle) => set({ angle })}
        />
      ) : (
        <>
          <Slider
            label="Centro X"
            value={Math.round(g.cx * 100)}
            min={0}
            max={100}
            unit="%"
            reset={50}
            onChange={(v) => set({ cx: v / 100 })}
          />
          <Slider
            label="Centro Y"
            value={Math.round(g.cy * 100)}
            min={0}
            max={100}
            unit="%"
            reset={50}
            onChange={(v) => set({ cy: v / 100 })}
          />
        </>
      )}
      <Slider
        label="Tamanho"
        value={Math.round(g.scale * 100)}
        min={5}
        max={400}
        unit="%"
        reset={100}
        onChange={(v) => set({ scale: v / 100 })}
      />
    </div>
  );
}

function MaskProps({ layer }: { layer: Layer }): ReactNode {
  const target = useUi((s) => s.paintTarget);
  if (!layer.mask) return null;
  return (
    <div className="section">
      <div className="section-head">
        <span className="label">Máscara</span>
        <Toggle
          on={layer.mask.enabled}
          title="Ativar / desativar"
          onChange={(v) => attempt(() => setMaskEnabled(layer.id, v))}
        />
      </div>
      {"transform" in layer && (
        <div className="toggle-row">
          Acompanha a imagem{" "}
          <Toggle
            on={!!layer.mask.reference}
            onChange={(linked) => attempt(() => setMaskLinked(layer.id, linked))}
          />
        </div>
      )}
      <div className="row">
        <div className="seg">
          <button
            type="button"
            className={target === "layer" ? "is-on" : ""}
            onClick={() => useUi.setState({ paintTarget: "layer" })}
          >
            Pintar na camada
          </button>
          <button
            type="button"
            className={target === "mask" ? "is-on" : ""}
            onClick={() =>
              useUi.setState({ paintTarget: "mask", fg: "#000000", bg: "#ffffff", tool: "brush" })
            }
          >
            Pintar na máscara
          </button>
        </div>
      </div>
      <div className="row" style={{ flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn"
          onClick={() =>
            attempt(() =>
              shapeMask(layer.id, { kind: "linear", angle: 90, start: 0.35, end: 0.65 }),
            )
          }
        >
          Degradê de cima
        </button>
        <button
          type="button"
          className="btn"
          onClick={() =>
            attempt(() => shapeMask(layer.id, { kind: "radial", radius: 0.45, feather: 0.6 }))
          }
        >
          Centro (vinheta)
        </button>
        <button type="button" className="btn" onClick={() => attempt(() => invertMask(layer.id))}>
          Inverter
        </button>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => attempt(() => removeMask(layer.id))}
        >
          Remover
        </button>
      </div>
    </div>
  );
}

const KIND_ICON = {
  vector: SquareDashed,
  raster: ImageIcon,
  text: Type,
  solid: Palette,
  gradient: Blend,
  adjust: SlidersHorizontal,
};

export function Properties(): ReactNode {
  const layer = useDoc((s) => s.doc?.layers.find((l) => l.id === s.activeId));
  if (!layer)
    return <div className="empty-props">Selecione uma camada para ver as propriedades.</div>;
  const Icon = KIND_ICON[layer.kind];
  return (
    <>
      <div className="section" style={{ gap: 6 }}>
        <div className="props-title">
          <Icon size={15} />
          {layer.name}
        </div>
        <span className="muted" style={{ fontSize: 12 }}>
          {KIND_LABEL[layer.kind]}
          {layer.kind === "raster" && ` · ${layer.width} × ${layer.height} px`}
        </span>
      </div>
      {layer.kind === "vector" && <VectorProperties layer={layer} />}
      {layer.kind === "adjust" && <AdjustProps layer={layer} />}
      {layer.kind === "text" && <TextProps key={layer.id} layer={layer} />}
      {layer.kind === "solid" && (
        <div className="section">
          <span className="label">Cor</span>
          <div className="row">
            <ColorSwatch
              value={layer.color}
              onChange={(color) => attempt(() => editLayer(layer.id, { color }))}
            />
            <span className="mono">{layer.color}</span>
          </div>
        </div>
      )}
      {layer.kind === "gradient" && <GradientProps layer={layer} />}
      {(layer.kind === "raster" || layer.kind === "text" || layer.kind === "vector") && (
        <PlacementProps layer={layer} />
      )}
      <MaskProps layer={layer} />
      {!layer.mask && (
        <div className="section">
          <button
            type="button"
            className="btn"
            onClick={() =>
              attempt(() =>
                shapeMask(layer.id, { kind: "linear", angle: 90, start: 0.35, end: 0.65 }),
              )
            }
          >
            <SquareDashed size={14} /> Máscara em degradê (só em cima)
          </button>
        </div>
      )}
    </>
  );
}
