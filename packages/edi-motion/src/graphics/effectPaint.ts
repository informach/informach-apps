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
}

export function isPaintedMask(effects: VectorEffects | undefined) {
  return !!effects?.mask?.mode && effects.mask.mode !== "silhouette";
}
/** Effective paint of every painted-mask source, following the same channel rule as authoring:
 * a typed gradient/pattern sets its channel, a solid colour clears an inherited one. Sources with
 * their own filter are refused rather than drawn without it. */
export function effectSourcePaints(
  nodes: Iterable<PaintedNode>,
  effects: ReadonlyMap<string, VectorEffects>,
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
    const paint: Partial<Record<(typeof EFFECT_PAINT_ATTRIBUTES)[number], string>> = {};
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
    result.set(id, paint);
  }
  return result;
}
