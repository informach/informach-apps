import { z } from "zod";
import { nineSlice } from "../layout/nineSlice";
import { validateImageAttributes } from "./imageAttributes";
import { assetIdSchema } from "./model";

export const imageSliceSchema = z.strictObject({
  top: z.number().min(0).max(16384),
  right: z.number().min(0).max(16384),
  bottom: z.number().min(0).max(16384),
  left: z.number().min(0).max(16384),
});
export type ImageSlice = z.infer<typeof imageSliceSchema>;
export const slicedImageSchema = z
  .strictObject({
    source: z.strictObject({
      width: z.number().int().positive().max(16384),
      height: z.number().int().positive().max(16384),
    }),
    insets: imageSliceSchema,
  })
  .superRefine(({ source, insets }, context) => {
    if (insets.left + insets.right >= source.width || insets.top + insets.bottom >= source.height)
      context.addIssue({
        code: "custom",
        message: "Nine-slice requer centro com extensão positiva na imagem de origem.",
      });
  });
export type SlicedImage = z.infer<typeof slicedImageSchema>;
export interface ImageElement {
  tag: "svg" | "use";
  attrs: Record<string, string>;
  children: ImageElement[];
}
export function imageDimension(value: string | undefined, fallback: number) {
  if (value === undefined) return fallback;
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?(?:px)?$/.test(value))
    throw new Error("Nine-slice requer largura/altura absolutas em px, sem unidades relativas.");
  const number = Number(value.replace(/px$/, ""));
  if (!Number.isFinite(number) || number < 0 || number > 100000)
    throw new Error("Dimensão de nine-slice fora do orçamento.");
  return number;
}
/** A bounded, code-free render description shared by SVG, React and layout.
 * Only generated internal references reach href; no project markup is parsed. */
export function imagePresentation(
  asset: { id: string; width: number; height: number },
  attrs: Record<string, string>,
  insets?: ImageSlice,
): ImageElement {
  assetIdSchema.parse(asset.id);
  validateImageAttributes(attrs);
  const use: ImageElement = { tag: "use", attrs: { href: `#edi-${asset.id}` }, children: [] };
  if (!insets)
    return {
      tag: "svg",
      attrs: {
        ...attrs,
        "data-edi-image": asset.id,
        viewBox: `0 0 ${asset.width} ${asset.height}`,
      },
      children: [use],
    };
  const value = slicedImageSchema.parse({
      source: { width: asset.width, height: asset.height },
      insets,
    }),
    width = imageDimension(attrs.width, asset.width),
    height = imageDimension(attrs.height, asset.height),
    cells = nineSlice(value.source, { width, height }, value.insets);
  return {
    tag: "svg",
    attrs: {
      ...attrs,
      width: String(width),
      height: String(height),
      "data-edi-image": asset.id,
      "data-edi-slice": "1",
      viewBox: `0 0 ${Math.max(1, width)} ${Math.max(1, height)}`,
      preserveAspectRatio: "none",
    },
    children: cells.map(({ source, target }) => ({
      tag: "svg",
      attrs: {
        x: String(target.x),
        y: String(target.y),
        width: String(target.width),
        height: String(target.height),
        viewBox: `${source.x} ${source.y} ${source.width === 0 ? 1 : source.width} ${source.height === 0 ? 1 : source.height}`,
        preserveAspectRatio: "none",
        overflow: "hidden",
      },
      children: [{ ...use, attrs: { ...use.attrs }, children: [] }],
    })),
  };
}
