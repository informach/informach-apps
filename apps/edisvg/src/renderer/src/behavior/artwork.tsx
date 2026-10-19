import { VisualArtwork } from "@informach/edi-motion/react";
import type { InteractiveDocument } from "@informach/edi-motion/runtime";
import { memo } from "react";
/** Host wrapper only; all graphical rules live in the portable core renderer. */
export const BehaviorArtwork = memo(function BehaviorArtwork({
  document,
}: {
  document: InteractiveDocument;
}) {
  const scene = document.visual;
  if (!scene) throw new Error("Prévia requer metadados visuais portáteis.");
  return (
    <svg
      aria-label="Prévia interativa da prancheta"
      xmlns="http://www.w3.org/2000/svg"
      viewBox={scene.viewBox.join(" ")}
      preserveAspectRatio={scene.preserveAspectRatio}
    >
      <title>Prévia interativa da prancheta</title>
      <VisualArtwork document={document} />
    </svg>
  );
});
