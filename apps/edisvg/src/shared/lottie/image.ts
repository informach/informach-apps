import type { Affine } from "@informach/edi-motion";
import { type Asset, assetDataUri } from "@informach/edi-motion/assets";
import type { SceneNode } from "../sceneTypes";

/** A raster as a Lottie image layer: the embedded PNG drawn at its pixel size,
 * mapped onto the image box by the same fit the SVG viewport uses. Nine-slice,
 * meshes and preserveAspectRatio slice (which clips) stay outside the profile. */
export function prepareLottieImage(node: SceneNode, assets: readonly Asset[]) {
  if (node.imageSlice || node.imageMesh)
    throw new Error(
      "Nine-slice e malha raster não têm representação Lottie neste perfil. Use HTML, React ou vídeo.",
    );
  const asset = assets.find((item) => item.id === node.assetId);
  if (asset?.kind !== "image") throw new Error("Imagem Lottie sem recurso PNG incorporado.");
  const number = (name: string, fallback: number) => {
    const raw = node.attrs[name];
    if (raw === undefined) return fallback;
    if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:px)?$/.test(raw))
      throw new Error("Imagem Lottie requer caixa em unidades absolutas.");
    return Number(raw.replace(/px$/, ""));
  };
  const x = number("x", 0),
    y = number("y", 0),
    width = number("width", asset.width),
    height = number("height", asset.height),
    match = /^(none|x(Min|Mid|Max)Y(Min|Mid|Max))(?:\s+(meet|slice))?$/.exec(
      (node.attrs.preserveAspectRatio ?? "xMidYMid meet").trim(),
    );
  if (!match) throw new Error("preserveAspectRatio da imagem fora do perfil Lottie.");
  if (match[4] === "slice")
    throw new Error("preserveAspectRatio slice recorta a imagem e não está no perfil Lottie.");
  if (!(width > 0 && height > 0)) throw new Error("Imagem Lottie requer área positiva.");
  let local: Affine;
  if (match[1] === "none") local = [width / asset.width, 0, 0, height / asset.height, x, y];
  else {
    const scale = Math.min(width / asset.width, height / asset.height),
      align = (mode: string | undefined, free: number) =>
        mode === "Min" ? 0 : mode === "Max" ? free : free / 2;
    local = [
      scale,
      0,
      0,
      scale,
      x + align(match[2], width - asset.width * scale),
      y + align(match[3], height - asset.height * scale),
    ];
  }
  return { asset, local, uri: assetDataUri(asset) };
}
export type LottieImage = ReturnType<typeof prepareLottieImage>;
