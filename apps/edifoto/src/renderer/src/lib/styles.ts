import { type AdjustLayer, baseLayer } from "@shared/doc";
import { IMAGE_STYLES, type ImageStyle, styleAdjust } from "@shared/styles";
import { updateLayer, useDoc } from "@/state/doc";
import { useUi } from "@/state/ui";
import { requireDoc } from "./ops";
export function applyStyle(id: ImageStyle, strength = 100): string {
  const doc = requireDoc();
  if (!Number.isFinite(strength) || strength < 0 || strength > 100)
    throw new Error("Intensidade inválida.");
  const existing = doc.layers.find(
    (layer) => layer.kind === "adjust" && layer.role === "style" && !layer.locked,
  );
  const layer: AdjustLayer = {
    ...(existing ?? baseLayer("Estilo")),
    kind: "adjust",
    role: "style",
    preset: id,
    name: `Estilo · ${IMAGE_STYLES.find((style) => style.id === id)?.name ?? id}`,
    adjust: styleAdjust(id),
    opacity: strength / 100,
  };
  useDoc
    .getState()
    .commit(
      "Aplicar estilo",
      (current) =>
        existing
          ? updateLayer(current, existing.id, () => layer)
          : { ...current, layers: [...current.layers, layer] },
      { active: layer.id, key: "image-style" },
    );
  useUi.setState({ tab: "props" });
  return layer.id;
}
