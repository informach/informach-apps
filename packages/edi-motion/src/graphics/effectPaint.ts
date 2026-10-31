import { type GradientPaints, paintServerId } from "./gradients";
import type { VectorEffects } from "./vectorEffects";

/** Inheritable presentation a painted mask source carries into its `<mask>`: mask content does
 * not inherit from the source's own groups, so the effective values are resolved here. */
export const EFFECT_PAINT_ATTRIBUTES = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
] as const;
export type EffectPaint = Readonly<
  Partial<Record<(typeof EFFECT_PAINT_ATTRIBUTES)[number], string>>
>;
interface PaintedNode {
  id: string;
  parentId: string | null;
  attrs?: Readonly<Record<string, string>>;
  gradients?: GradientPaints;
  filter?: unknown;
  paintLayers?: readonly unknown[];
}

const ABSOLUTE_UNITS: Readonly<Record<string, number>> = {
  "": 1,
  px: 1,
  pt: 4 / 3,
  pc: 16,
  mm: 96 / 25.4,
  cm: 96 / 2.54,
  in: 96,
};
/** A painted mask's region must cover the stroke, so its width has to be an absolute length;
 * em/%-relative widths depend on context the region cannot see and are refused clearly. */
export function paintedStrokeWidth(value: string | undefined) {
  const match = /^\s*([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*([a-z]*)\s*$/i.exec(
      value ?? "1",
    ),
    scale = match ? ABSOLUTE_UNITS[(match[2] ?? "").toLowerCase()] : undefined,
    width = match && scale !== undefined ? Number(match[1]) * scale : Number.NaN;
  if (!Number.isFinite(width) || width < 0 || width > 1e7)
    throw new Error(
      "Contorno de fonte de máscara pintada precisa de largura absoluta (px, pt, mm…), não relativa (em, %).",
    );
  return width;
}
/** Applies a root-to-node chain of presentation over what the scope itself inherits. */
function resolvePaint(chain: readonly PaintedNode[], inherited: EffectPaint) {
  const paint: Partial<Record<(typeof EFFECT_PAINT_ATTRIBUTES)[number], string>> = {
    ...inherited,
  };
  for (const node of chain) {
    for (const name of EFFECT_PAINT_ATTRIBUTES) {
      const value = node.attrs?.[name];
      if (value !== undefined && value !== "inherit" && value !== "unset") paint[name] = value;
    }
    for (const channel of ["fill", "stroke"] as const) {
      const server = node.gradients?.[channel];
      if (server) paint[channel] = `url(#${paintServerId(server)})`;
    }
  }
  return paint;
}
/** What a nested scope (a component mounted in this node's viewport) inherits: the scene
 * renders it inside this node's ancestors, so its painted-mask sources do too. */
export function inheritedEffectPaint(
  nodes: Iterable<PaintedNode>,
  id: string,
  inherited: EffectPaint = {},
): EffectPaint {
  const byId = new Map<string, PaintedNode>();
  for (const node of nodes) byId.set(node.id, node);
  const chain: PaintedNode[] = [];
  for (
    let current = byId.get(id);
    current;
    current = current.parentId ? byId.get(current.parentId) : undefined
  ) {
    chain.unshift(current);
    if (chain.length > 33) throw new Error("Herança da fonte de máscara profunda demais.");
  }
  return resolvePaint(chain, inherited);
}
export function isPaintedMask(effects: VectorEffects | undefined) {
  return !!effects?.mask?.mode && effects.mask.mode !== "silhouette";
}
/** Effective paint of every painted-mask source, following the same channel rule as authoring:
 * a typed gradient/pattern sets its channel, a solid colour clears an inherited one. Sources with
 * their own filter or extra paint layers are refused rather than drawn without them. */
export function effectSourcePaints(
  nodes: Iterable<PaintedNode>,
  effects: ReadonlyMap<string, VectorEffects>,
  inherited: EffectPaint = {},
) {
  const sources = new Set(
      [...effects.values()].flatMap((value) =>
        isPaintedMask(value) && value.mask ? [value.mask.sourceId] : [],
      ),
    ),
    result = new Map<string, EffectPaint>();
  if (!sources.size) return result;
  const byId = new Map<string, PaintedNode>();
  let count = 0;
  for (const node of nodes) {
    if (++count > 2000) throw new Error("Fontes de máscara excedem orçamento de objetos.");
    byId.set(node.id, node);
  }
  for (const id of sources) {
    const chain: PaintedNode[] = [];
    for (
      let current = byId.get(id);
      current;
      current = current.parentId ? byId.get(current.parentId) : undefined
    ) {
      chain.unshift(current);
      if (chain.length > 33) throw new Error("Herança da fonte de máscara profunda demais.");
    }
    const source = chain.at(-1);
    if (!source || source.id !== id) throw new Error("Fonte de máscara pintada ausente.");
    if (source.filter !== undefined)
      throw new Error("Fonte de máscara pintada com filtro fica fora do perfil.");
    if (source.paintLayers?.length)
      throw new Error(
        "Fonte de máscara pintada com camadas de pintura extras fica fora do perfil.",
      );
    const paint = resolvePaint(chain, inherited);
    // Checked when the context is built, never as a failure in the middle of a render.
    if (paint.stroke !== undefined && paint.stroke !== "none")
      paintedStrokeWidth(paint["stroke-width"]);
    result.set(id, paint);
  }
  return result;
}
