import {
  PAINT_LAYER_LIMIT,
  type PaintLayer,
  type PaintServer,
  paintLayerTags,
} from "@informach/edi-motion/graphics";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { inheritedAppearance, inheritedGradients } from "../../shared/appearance";
import type { Scene, SceneNode } from "../../shared/sceneTypes";
import { formatInput } from "./form-values";
import { ScrubField } from "./inspector-field";
import { normalizeHex } from "./paint-color";
import { PaintPicker } from "./paint-picker";
import { PathEffects, type TrimEffectsHost, withoutLayerTrim } from "./path-effects";

type Paint = "fill" | "stroke";

interface Props {
  scene: Scene;
  node: SceneNode;
  locked: boolean;
  execute(commands: unknown[]): void;
  /** Path effects per paint row; absent where the board has no rig (components). */
  effects?: TrimEffectsHost;
}

type Linecap = NonNullable<PaintLayer["linecap"]>;
type Linejoin = NonNullable<PaintLayer["linejoin"]>;
interface RowModel {
  /** Picker, row and popover identity. */
  key: string;
  /** Lowercase noun used in the accessible names, e.g. "preenchimento". */
  label: string;
  kind: Paint;
  solid: string;
  server?: PaintServer;
  opacity: number;
  hidden: boolean;
  inherited?: boolean;
  setColor(color: string, opacity?: number): void;
  setOpacity(opacity: number): void;
  toggle(): void;
  remove(): void;
  width?: { value: number; set(width: number): void };
  /** The paint layer the row draws; undefined for the shape's own paint. */
  layerId?: string;
  name?: { value: string; placeholder: string; set(name: string | undefined): void };
  ends?: {
    linecap: Linecap;
    linejoin: Linejoin;
    set(patch: { linecap?: Linecap; linejoin?: Linejoin }): void;
  };
}
type OptionsTab = "options" | "effects";

const linecaps: [Linecap, string][] = [
  ["butt", "reta"],
  ["round", "arredondada"],
  ["square", "quadrada"],
];
const linejoins: [Linejoin, string][] = [
  ["miter", "em ponta"],
  ["round", "arredondada"],
  ["bevel", "chanfrada"],
];

const labels: Record<Paint, string> = { fill: "Preenchimento", stroke: "Contorno" };
// Hiding a base paint stores opacity 0, so the color and gradient survive. The
// opacity it had comes back when shown again in this session; otherwise 100%.
// Extra layers have their own visibility flag.
const hiddenOpacity = new Map<string, number>();
// Every command re-renders the inspector, so the open row options survive it here.
let openOptions: {
  nodeId: string;
  row: string;
  tab: OptionsTab;
  top: number;
  left: number;
} | null = null;

const swatchBackground = (server: PaintServer | undefined, solid: string) =>
  server && server.kind !== "pattern"
    ? `linear-gradient(90deg, ${server.stops.map((stop) => `${stop.color} ${stop.offset * 100}%`).join(", ")})`
    : server?.kind === "pattern"
      ? "repeating-linear-gradient(45deg, #87919c 0 3px, #282d35 3px 6px)"
      : solid;

export function PaintControls({ scene, node, locked, execute, effects }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const [options, setOptionsState] = useState(() =>
    openOptions?.nodeId === node.id ? openOptions : null,
  );
  const setOptions = (value: typeof options) => {
    openOptions = value;
    setOptionsState(value);
  };
  const [adding, setAdding] = useState(false);
  const [position, setPosition] = useState({ top: 52, left: 8 });
  const [error, setError] = useState("");
  const appearance = inheritedAppearance(scene, node);
  const gradients = inheritedGradients(scene, node);
  const layers = node.paintLayers ?? [];
  const layered = paintLayerTags.has(node.tag);
  const apply = (commands: unknown[]) => {
    try {
      execute(commands);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Pintura recusada.");
    }
  };
  const setAttrs = (value: Record<string, string>) =>
    apply([{ type: "scene", operation: "attrs", targetId: node.id, value }]);
  const setLayers = (value: PaintLayer[]) =>
    apply([
      {
        type: "scene",
        operation: "paint-layers",
        targetId: node.id,
        value: value.length ? value : null,
      },
    ]);
  const updateLayer = (id: string, patch: Partial<PaintLayer>) =>
    setLayers(layers.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer)));
  const saveColor = (color: string) => {
    if (scene.palette?.some((item) => item.toLowerCase() === color.toLowerCase())) return;
    if ((scene.palette?.length ?? 0) >= 64) {
      setError("A paleta aceita até 64 cores.");
      return;
    }
    apply([
      { type: "appearance", operation: "palette", colors: [...(scene.palette ?? []), color] },
    ]);
  };

  const base = (paint: Paint): RowModel | null => {
    const value = appearance[paint] ?? (paint === "fill" ? "#000000" : "none");
    const server = gradients[paint];
    if (value === "none" && !server) return null;
    const firstStop = server?.kind !== "pattern" ? server?.stops[0]?.color : undefined;
    const rawOpacity = Number(appearance[`${paint}-opacity`] ?? "1");
    const opacity = Number.isFinite(rawOpacity) ? Math.min(1, Math.max(0, rawOpacity)) : 1;
    const key = `${node.id}:${paint}`;
    const strokeWidth = Number(appearance["stroke-width"] ?? "1");
    return {
      key: paint,
      label: labels[paint].toLowerCase(),
      kind: paint,
      solid: normalizeHex(firstStop ?? "") ?? normalizeHex(value) ?? "#000000",
      server,
      opacity,
      hidden: opacity === 0,
      inherited: node.attrs[paint] === undefined || node.attrs[paint] === "inherit",
      setColor: (color, next) =>
        setAttrs({
          [paint]: color,
          ...(next === undefined ? {} : { [`${paint}-opacity`]: String(next) }),
        }),
      setOpacity: (next) => setAttrs({ [`${paint}-opacity`]: String(next) }),
      toggle: () => {
        if (opacity !== 0) hiddenOpacity.set(key, opacity);
        const restored = hiddenOpacity.get(key) || 1;
        if (opacity === 0) hiddenOpacity.delete(key);
        setAttrs({ [`${paint}-opacity`]: opacity === 0 ? String(restored) : "0" });
      },
      remove: () => setAttrs({ [paint]: "none" }),
      width:
        paint === "stroke"
          ? {
              value: Number.isFinite(strokeWidth) ? strokeWidth : 1,
              set: (width) => setAttrs({ "stroke-width": String(width) }),
            }
          : undefined,
      ends:
        paint === "stroke"
          ? {
              linecap: (appearance["stroke-linecap"] as Linecap | undefined) ?? "butt",
              linejoin: (appearance["stroke-linejoin"] as Linejoin | undefined) ?? "miter",
              set: ({ linecap, linejoin }) =>
                setAttrs({
                  ...(linecap ? { "stroke-linecap": linecap } : {}),
                  ...(linejoin ? { "stroke-linejoin": linejoin } : {}),
                }),
            }
          : undefined,
    };
  };
  const extra = (layer: PaintLayer): RowModel => {
    const number = layers.filter((item) => item.kind === layer.kind).indexOf(layer) + 1;
    return {
      key: layer.id,
      label: `${labels[layer.kind].toLowerCase()} extra ${number}`,
      kind: layer.kind,
      solid: layer.color,
      server: layer.paint,
      opacity: layer.opacity,
      hidden: !layer.visible,
      // A picked color replaces the layer's gradient, as a solid attr does on the base paint.
      setColor: (color, next) => {
        const { paint: _gradient, ...solid } = layer;
        setLayers(
          layers.map((item) =>
            item.id === layer.id ? { ...solid, color, opacity: next ?? layer.opacity } : item,
          ),
        );
      },
      setOpacity: (opacity) => updateLayer(layer.id, { opacity }),
      toggle: () => updateLayer(layer.id, { visible: !layer.visible }),
      // The layer's own trim goes with it, in the same transaction.
      remove: () => {
        const rest = layers.filter((item) => item.id !== layer.id),
          rig = withoutLayerTrim(effects?.rig, node, layer.id);
        apply([
          ...(rig ? [{ type: "rig", operation: "replace", value: rig }] : []),
          {
            type: "scene",
            operation: "paint-layers",
            targetId: node.id,
            value: rest.length ? rest : null,
          },
        ]);
      },
      width:
        layer.kind === "stroke"
          ? { value: layer.width ?? 1, set: (width) => updateLayer(layer.id, { width }) }
          : undefined,
      layerId: layer.id,
      name: {
        value: layer.name ?? "",
        placeholder: `${labels[layer.kind]} ${number}`,
        set: (name) => {
          const { name: _previous, ...rest } = layer;
          setLayers(
            layers.map((item) =>
              item.id === layer.id ? { ...rest, ...(name ? { name } : {}) } : item,
            ),
          );
        },
      },
      ends:
        layer.kind === "stroke"
          ? {
              linecap: layer.linecap ?? "butt",
              linejoin: layer.linejoin ?? "miter",
              set: (patch) => updateLayer(layer.id, patch),
            }
          : undefined,
    };
  };

  const fill = base("fill"),
    stroke = base("stroke");
  const add = (paint: Paint) => {
    setAdding(false);
    if (!(paint === "fill" ? fill : stroke)) {
      setAttrs({ [paint]: paint === "fill" ? "#747474" : "#000000", [`${paint}-opacity`]: "1" });
      return;
    }
    setLayers([
      ...layers,
      {
        id: `paint-${crypto.randomUUID()}`,
        kind: paint,
        color: paint === "fill" ? "#747474" : "#000000",
        opacity: 1,
        visible: true,
        ...(paint === "stroke" ? { width: 2 } : {}),
      },
    ]);
  };
  const addable = (["fill", "stroke"] as const).filter(
    (paint) =>
      !(paint === "fill" ? fill : stroke) || (layered && layers.length < PAINT_LAYER_LIMIT),
  );

  const row = (model: RowModel) => {
    const label = model.label;
    // Rive keeps stroke settings and path effects behind each row's options.
    const tabs: OptionsTab[] = ["options", ...(effects && layered ? (["effects"] as const) : [])];
    const shown = options?.row === model.key ? options : null,
      tab = shown && tabs.includes(shown.tab) ? shown.tab : tabs[0],
      trimmed = effects?.rig?.trims?.some(
        (trim) => trim.targetId === node.id && trim.layerId === model.layerId,
      );
    return (
      <div className={model.hidden ? "paint-channel is-hidden" : "paint-channel"} key={model.key}>
        <div className="paint-channel-row">
          {tabs.length > 0 && (
            <button
              type="button"
              className={`paint-channel-action paint-options-toggle${trimmed ? " has-effects" : ""}`}
              data-paint-options-toggle=""
              aria-label={`Opções e efeitos de ${label}`}
              aria-expanded={!!shown}
              title={
                trimmed
                  ? `Opções e efeitos de ${label} (trim ativo)`
                  : `Opções e efeitos de ${label}`
              }
              onClick={(event) => {
                const bounds = event.currentTarget.getBoundingClientRect();
                setOptions(
                  shown
                    ? null
                    : {
                        nodeId: node.id,
                        row: model.key,
                        tab: tabs[0] ?? "options",
                        top: Math.max(52, Math.min(bounds.top, window.innerHeight - 380)),
                        left: Math.max(8, bounds.left - 274),
                      },
                );
              }}
            >
              <SlidersIcon />
            </button>
          )}
          <button
            type="button"
            className={`paint-swatch ${model.kind === "stroke" ? "paint-swatch-stroke" : ""}`}
            aria-label={`Escolher cor de ${label}`}
            aria-expanded={open === model.key}
            title={model.inherited ? `${label} herdado do grupo` : label}
            disabled={locked}
            style={{ background: swatchBackground(model.server, model.solid) }}
            onClick={(event) => {
              const bounds = event.currentTarget.getBoundingClientRect();
              setPosition({
                top: Math.max(52, Math.min(bounds.top, window.innerHeight - 450)),
                left: Math.max(8, bounds.left - 274),
              });
              setOpen(open === model.key ? null : model.key);
            }}
          />
          {model.server ? (
            <span className="paint-hex paint-kind">
              {model.server.kind === "pattern" ? "Padrão" : "Gradiente"}
            </span>
          ) : (
            <input
              key={model.solid}
              className="paint-hex"
              aria-label={`Cor hexadecimal de ${label}`}
              maxLength={7}
              spellCheck={false}
              disabled={locked}
              defaultValue={model.solid.slice(1).toUpperCase()}
              onBlur={(event) => {
                const text = event.currentTarget.value.trim();
                const color = normalizeHex(text.startsWith("#") ? text : `#${text}`);
                if (!color) {
                  event.currentTarget.value = model.solid.slice(1).toUpperCase();
                  setError("Use uma cor hexadecimal, como 747474.");
                  return;
                }
                if (color !== model.solid) model.setColor(color);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") {
                  event.currentTarget.value = model.solid.slice(1).toUpperCase();
                  event.currentTarget.blur();
                }
              }}
            />
          )}
          <ScrubField
            label={`Opacidade de ${label} (%)`}
            shortLabel="◐"
            value={model.opacity * 100}
            min={0}
            max={100}
            unit="%"
            disabled={locked}
            onError={setError}
            onCommit={(input) => {
              const value = input.valueAsNumber;
              if (!Number.isFinite(value) || value < 0 || value > 100) {
                input.value = formatInput(model.opacity * 100);
                setError("A opacidade deve estar entre 0% e 100%.");
                return;
              }
              if (value !== model.opacity * 100) model.setOpacity(value / 100);
            }}
          />
          <button
            type="button"
            className="paint-channel-action"
            aria-label={`${model.hidden ? "Mostrar" : "Ocultar"} ${label}`}
            aria-pressed={model.hidden}
            title={`${model.hidden ? "Mostrar" : "Ocultar"} ${label}`}
            disabled={locked}
            onClick={model.toggle}
          >
            <EyeIcon hidden={model.hidden} />
          </button>
          <button
            type="button"
            className="paint-channel-action"
            aria-label={`Remover ${label}`}
            title={`Remover ${label}`}
            disabled={locked}
            onClick={model.remove}
          >
            −
          </button>
        </div>
        {model.width && (
          <div className="paint-width">
            <span>Espessura</span>
            <ScrubField
              label={`Espessura de ${label}`}
              shortLabel="≡"
              value={model.width.value}
              min={0}
              max={10000}
              unit="px"
              disabled={locked}
              onError={setError}
              onCommit={(input) => {
                const width = input.valueAsNumber;
                if (!Number.isFinite(width) || width < 0 || width > 10000) {
                  input.value = formatInput(model.width?.value ?? 1);
                  setError("A espessura deve estar entre 0 e 10.000 px.");
                  return;
                }
                if (width !== model.width?.value) model.width?.set(width);
              }}
            />
          </div>
        )}
        {shown &&
          tab &&
          createPortal(
            <RowOptions label={label} position={shown} onClose={() => setOptions(null)}>
              <div className="paint-options-tabs" role="tablist">
                {tabs.map((value) => (
                  <button
                    type="button"
                    role="tab"
                    key={value}
                    aria-selected={value === tab}
                    onClick={() => setOptions({ ...shown, tab: value })}
                  >
                    {value === "options" ? "Opções" : "Efeitos"}
                  </button>
                ))}
              </div>
              {tab === "options" && (
                <div className="paint-options-body">
                  <div className="artboard-transform-row">
                    <span>Nome</span>
                    {model.name ? (
                      <input
                        key={model.name.value}
                        className="paint-name"
                        aria-label={`Nome de ${label}`}
                        maxLength={120}
                        placeholder={model.name.placeholder}
                        defaultValue={model.name.value}
                        disabled={locked}
                        onBlur={(event) => {
                          const text = event.currentTarget.value.trim();
                          if (text !== model.name?.value) model.name?.set(text || undefined);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") event.currentTarget.blur();
                        }}
                      />
                    ) : (
                      <span className="paint-name">{labels[model.kind]} do objeto</span>
                    )}
                  </div>
                  {model.ends && (
                    <div className="paint-ends">
                      <Segmented
                        label={`Ponta de ${label}`}
                        options={linecaps}
                        prefix="Ponta"
                        value={model.ends.linecap}
                        disabled={locked}
                        icon={CapIcon}
                        onChange={(linecap) => model.ends?.set({ linecap })}
                      />
                      <Segmented
                        label={`Junção de ${label}`}
                        options={linejoins}
                        prefix="Junção"
                        value={model.ends.linejoin}
                        disabled={locked}
                        icon={JoinIcon}
                        onChange={(linejoin) => model.ends?.set({ linejoin })}
                      />
                    </div>
                  )}
                </div>
              )}
              {tab === "effects" && effects && (
                <PathEffects
                  {...effects}
                  node={node}
                  layerId={model.layerId}
                  locked={locked}
                  execute={execute}
                  onError={setError}
                />
              )}
              {error && <p role="alert">{error}</p>}
            </RowOptions>,
            document.body,
          )}
        {open === model.key &&
          createPortal(
            <PaintPicker
              label={label}
              color={model.solid}
              opacity={model.opacity}
              palette={scene.palette ?? []}
              position={position}
              onClose={() => setOpen(null)}
              onSaveColor={saveColor}
              onApply={(color, opacity) => model.setColor(color, opacity)}
            />,
            document.body,
          )}
      </div>
    );
  };
  // Top to bottom as drawn: the last extra layer is on top, the base fill at the bottom.
  const rows = [...layers].reverse().map(extra);
  if (stroke) rows.push(stroke);
  if (fill) rows.push(fill);
  return (
    <div className="paint-controls">
      <div className="artboard-inspector-title paint-controls-title">
        <h3>Preenchimentos e contornos</h3>
        <button
          type="button"
          aria-label="Adicionar preenchimento ou contorno"
          title={addable.length ? "Adicionar" : "Limite de camadas de pintura atingido"}
          aria-expanded={adding}
          disabled={locked || !addable.length}
          onClick={() => {
            const only = addable.length === 1 ? addable[0] : undefined;
            if (only) add(only);
            else setAdding(!adding);
          }}
        >
          +
        </button>
      </div>
      {adding && addable.length > 1 && (
        <div className="paint-add-menu">
          {addable.map((paint) => (
            <button type="button" key={paint} onClick={() => add(paint)}>
              {labels[paint]}
            </button>
          ))}
        </div>
      )}
      <div className="paint-channels">
        {rows.map(row)}
        {!rows.length && <p className="micro">Sem preenchimento nem contorno.</p>}
      </div>
      {error && !options && <p role="alert">{error}</p>}
    </div>
  );
}

function RowOptions({
  label,
  position,
  onClose,
  children,
}: {
  label: string;
  position: { top: number; left: number };
  onClose(): void;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        !root.current?.contains(target) &&
        !target.closest("[data-paint-options-toggle]")
      )
        onClose();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);
  return (
    <div
      ref={root}
      className="paint-options"
      role="dialog"
      aria-label={`Opções e efeitos de ${label}`}
      style={{ top: position.top, left: position.left }}
    >
      {children}
    </div>
  );
}

function SlidersIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M2 5h12M2 11h12" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="6" cy="5" r="1.8" fill="var(--panel, #1b1f26)" stroke="currentColor" />
      <circle cx="10" cy="11" r="1.8" fill="var(--panel, #1b1f26)" stroke="currentColor" />
    </svg>
  );
}

function EyeIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <circle cx="8" cy="8" r="2" fill={hidden ? "none" : "currentColor"} stroke="currentColor" />
      {hidden && <path d="M2.5 2.5l11 11" stroke="currentColor" strokeWidth="1.3" />}
    </svg>
  );
}

/** Rive-style icon buttons for one stroke setting. */
function Segmented<T extends string>({
  label,
  options,
  prefix,
  value,
  disabled,
  icon: Icon,
  onChange,
}: {
  label: string;
  options: [T, string][];
  prefix: string;
  value: T;
  disabled: boolean;
  icon(props: { value: T }): ReactNode;
  onChange(value: T): void;
}) {
  return (
    <fieldset className="paint-segmented" aria-label={label}>
      {options.map(([option, name]) => (
        <button
          type="button"
          key={option}
          aria-pressed={option === value}
          aria-label={`${prefix} ${name}`}
          title={`${prefix} ${name}`}
          disabled={disabled}
          onClick={() => option !== value && onChange(option)}
        >
          <Icon value={option} />
        </button>
      ))}
    </fieldset>
  );
}

function CapIcon({ value }: { value: Linecap }) {
  return (
    <svg viewBox="0 0 20 16" width="20" height="16" aria-hidden="true">
      <path d="M2 8h9" stroke="currentColor" strokeWidth="8" strokeLinecap={value} opacity="0.35" />
      <path d="M2 8h9" stroke="currentColor" strokeWidth="1.2" />
      <path d="M11 3v10" stroke="currentColor" strokeWidth="1" strokeDasharray="1.5 1.5" />
    </svg>
  );
}

function JoinIcon({ value }: { value: Linejoin }) {
  return (
    <svg viewBox="0 0 20 16" width="20" height="16" aria-hidden="true">
      <path
        d="M5 15V6h11"
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinejoin={value}
        opacity="0.35"
      />
      <path d="M5 15V6h11" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
