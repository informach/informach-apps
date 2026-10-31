import {
  parseAnimationArtifact,
  serializeAnimationArtifact,
} from "@informach/edi-motion/animation-artifact";
import { assetId, encodeAssetData, parseAsset } from "@informach/edi-motion/assets";
import type { Project } from "../../shared/project";
import { buildPlayerWebExport } from "./behavior/player-web-export";
import { createRasterFrameSource } from "./raster/frameSource";

/** One portable file includes the first frame, rendered by the real player, not a second drawing. */
export async function buildPlayerWebExportWithPoster(
  project: Project,
  options: unknown,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  const result = buildPlayerWebExport(project, options);
  const artifact = parseAnimationArtifact(result.content);
  const viewBox = artifact.document.visual?.viewBox;
  if (!viewBox) throw new Error("A animação precisa de um tamanho de desenho.");
  const scale = Math.min(512 / viewBox[2], 512 / viewBox[3]);
  const width = Math.max(1, Math.round(viewBox[2] * scale));
  const height = Math.max(1, Math.round(viewBox[3] * scale));
  const frames = await createRasterFrameSource(
    artifact.document,
    { width, height, background: "transparent" },
    signal,
  );
  try {
    const context = await frames.render(0);
    const blob = await context.canvas.convertToBlob({ type: "image/png" });
    signal?.throwIfAborted();
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const poster = parseAsset({
      id: assetId(bytes),
      name: "Prévia da animação",
      kind: "image",
      mime: "image/png",
      width,
      height,
      byteLength: bytes.byteLength,
      data: encodeAssetData(bytes),
    });
    if (poster.kind !== "image") throw new Error("A prévia precisa ser uma imagem PNG.");
    return { ...result, content: serializeAnimationArtifact({ ...artifact, poster }) };
  } finally {
    await frames.destroy();
  }
}
