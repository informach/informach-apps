import { z } from "zod";
import type { annotationSchema } from "./document.ts";

type Annotation = z.infer<typeof annotationSchema>;
const sourceSchema = z.string().startsWith("data:image/png;base64,").max(70_000_000);
export const rasterAssetsSchema = z
  .array(z.strictObject({ id: z.string().uuid(), dataUrl: sourceSchema }))
  .max(1000);
export type RasterAsset = z.infer<typeof rasterAssetsSchema>[number];
export function assertRasterBudget(metadataCharacters: number, sourceCharacters: number) {
  if (metadataCharacters + sourceCharacters > 70_000_000)
    throw new Error("Projeto excede o limite de imagens.");
}

export function imageReferences(annotations: Annotation[]): Annotation[] {
  return annotations.map((annotation) => {
    if (annotation.kind !== "image") return annotation;
    const { dataUrl: _dataUrl, ...reference } = annotation;
    return reference;
  });
}

/** Budget the wire payload by unique raster, rather than number of placed copies. */
export function collectImageAssets(annotations: Annotation[], supplied: unknown = []) {
  const sources = new Map<string, string>();
  const referenced = new Set(annotations.filter((a) => a.kind === "image").map((a) => a.assetId));
  const add = (id: string, dataUrl: string) => {
    if (!referenced.has(id)) throw new Error("Imagem de composição sem referência.");
    const previous = sources.get(id);
    if (previous !== undefined && previous !== dataUrl)
      throw new Error("Imagem de composição conflitante.");
    sources.set(id, dataUrl);
  };
  for (const asset of rasterAssetsSchema.parse(supplied)) add(asset.id, asset.dataUrl);
  // Read compatibility for the former inline transport; never retain it in history.
  for (const annotation of annotations)
    if (annotation.kind === "image" && annotation.dataUrl)
      add(annotation.assetId, sourceSchema.parse(annotation.dataUrl));
  const size =
    JSON.stringify(imageReferences(annotations)).length +
    [...sources.values()].reduce((total, source) => total + source.length, 0);
  assertRasterBudget(0, size);
  return sources;
}

/** Sources live for one open document, including undo/redo and queued save snapshots. */
export class RasterAssets {
  private readonly sources = new Map<string, string>();
  private readonly persisted = new Set<string>();
  private size = 0;
  constructor(sources: ReadonlyMap<string, string> = new Map(), persisted = false) {
    for (const [id, source] of sources) this.add(id, source, persisted);
  }
  add(id: string, dataUrl: string, persisted = false) {
    z.string().uuid().parse(id);
    sourceSchema.parse(dataUrl);
    const previous = this.sources.get(id);
    if (previous !== undefined && previous !== dataUrl)
      throw new Error("Imagem de composição conflitante.");
    if (previous === undefined) {
      if (this.size + dataUrl.length > 70_000_000)
        throw new Error("Projeto excede o limite de imagens.");
      this.sources.set(id, dataUrl);
      this.size += dataUrl.length;
    }
    if (persisted) this.persisted.add(id);
  }
  find(dataUrl: string) {
    for (const [id, source] of this.sources) if (source === dataUrl) return id;
    return undefined;
  }
  pending(annotations: Annotation[]): RasterAsset[] {
    const ids = new Set(annotations.filter((a) => a.kind === "image").map((a) => a.assetId));
    return [...ids].flatMap((id) => {
      const dataUrl = this.sources.get(id);
      if (dataUrl === undefined) throw new Error("Imagem de composição não encontrada.");
      return this.persisted.has(id) ? [] : [{ id, dataUrl }];
    });
  }
  acknowledge(assets: RasterAsset[]) {
    for (const { id, dataUrl } of assets) {
      if (this.sources.get(id) !== dataUrl) throw new Error("Imagem de composição conflitante.");
      this.persisted.add(id);
    }
  }
}
