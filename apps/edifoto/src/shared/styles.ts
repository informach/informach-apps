import { type Adjust, DEFAULT_ADJUST } from "./doc.ts";
export const IMAGE_STYLES = [
  { id: "natural", name: "Natural" },
  { id: "warm", name: "Quente" },
  { id: "cool", name: "Frio" },
  { id: "mono", name: "Preto e branco" },
] as const;
export type ImageStyle = (typeof IMAGE_STYLES)[number]["id"];
export function styleAdjust(id: ImageStyle): Adjust {
  const values: Record<ImageStyle, Partial<Adjust>> = {
    natural: { contrast: 8, vibrance: 12 },
    warm: { temperature: 18, contrast: 5, saturation: 5 },
    cool: { temperature: -18, contrast: 5, vibrance: 8 },
    mono: { grayscale: true, contrast: 12 },
  };
  if (!(id in values)) throw new Error("Estilo não encontrado.");
  return { ...structuredClone(DEFAULT_ADJUST), ...values[id] };
}
