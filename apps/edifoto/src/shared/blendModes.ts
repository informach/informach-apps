/**
 * The 27 Photoshop blend modes. `index` is the value the compositing shader switches on, so
 * the order of this list must match `blend()` in engine/shaders.ts.
 */
export const BLEND_MODES = [
  { id: "normal", label: "Normal", group: "normal" },
  { id: "dissolve", label: "Dissolver", group: "normal" },
  { id: "darken", label: "Escurecer", group: "darken" },
  { id: "multiply", label: "Multiplicar", group: "darken" },
  { id: "colorBurn", label: "Superexposição de cor", group: "darken" },
  { id: "linearBurn", label: "Superexposição linear", group: "darken" },
  { id: "darkerColor", label: "Cor mais escura", group: "darken" },
  { id: "lighten", label: "Clarear", group: "lighten" },
  { id: "screen", label: "Tela", group: "lighten" },
  { id: "colorDodge", label: "Subexposição de cor", group: "lighten" },
  { id: "linearDodge", label: "Subexposição linear (Adição)", group: "lighten" },
  { id: "lighterColor", label: "Cor mais clara", group: "lighten" },
  { id: "overlay", label: "Sobrepor", group: "contrast" },
  { id: "softLight", label: "Luz suave", group: "contrast" },
  { id: "hardLight", label: "Luz forte", group: "contrast" },
  { id: "vividLight", label: "Luz brilhante", group: "contrast" },
  { id: "linearLight", label: "Luz linear", group: "contrast" },
  { id: "pinLight", label: "Luz do pino", group: "contrast" },
  { id: "hardMix", label: "Mistura sólida", group: "contrast" },
  { id: "difference", label: "Diferença", group: "inversion" },
  { id: "exclusion", label: "Exclusão", group: "inversion" },
  { id: "subtract", label: "Subtrair", group: "inversion" },
  { id: "divide", label: "Dividir", group: "inversion" },
  { id: "hue", label: "Matiz", group: "component" },
  { id: "saturation", label: "Saturação", group: "component" },
  { id: "color", label: "Cor", group: "component" },
  { id: "luminosity", label: "Luminosidade", group: "component" },
] as const;

export type BlendMode = (typeof BLEND_MODES)[number]["id"];
export type BlendGroup = (typeof BLEND_MODES)[number]["group"];

export const BLEND_IDS = BLEND_MODES.map((m) => m.id) as [BlendMode, ...BlendMode[]];

export const BLEND_GROUPS: { id: BlendGroup; label: string; hint: string }[] = [
  { id: "normal", label: "Normal", hint: "Sem mistura" },
  { id: "darken", label: "Escurecer", hint: "O branco some; o resto escurece" },
  { id: "lighten", label: "Clarear", hint: "O preto some; o resto clareia" },
  { id: "contrast", label: "Contraste", hint: "O cinza 50% some; aumenta o contraste" },
  { id: "inversion", label: "Inversão", hint: "Compara e inverte as cores" },
  { id: "component", label: "Cor", hint: "Mistura matiz, saturação ou brilho" },
];

/** Shown first in the panel: the modes people reach for every day. */
export const FAVORITE_MODES: BlendMode[] = [
  "multiply",
  "screen",
  "overlay",
  "softLight",
  "color",
  "difference",
];

export const blendIndex = (id: BlendMode): number => BLEND_MODES.findIndex((m) => m.id === id);
export const blendLabel = (id: BlendMode): string =>
  BLEND_MODES.find((m) => m.id === id)?.label ?? id;
export const blendGroup = (id: BlendMode): BlendGroup =>
  BLEND_MODES.find((m) => m.id === id)?.group ?? "normal";

/** Shift + / Shift − cycling, Photoshop style. */
export function cycleBlend(id: BlendMode, dir: 1 | -1): BlendMode {
  const i = blendIndex(id);
  return BLEND_MODES[(i + dir + BLEND_MODES.length) % BLEND_MODES.length].id;
}
