import { PDFDict, PDFDocument, PDFName } from "pdf-lib";
import { z } from "zod";
import type { LocalPdfEngine } from "./local-engine.ts";

const fraction = z.number().finite().min(0).max(1);
export const imageCropSchema = z
  .object({
    x: fraction,
    y: fraction,
    w: fraction.positive(),
    h: fraction.positive(),
  })
  .refine(
    (box) => box.x + box.w <= 1 + 1e-10 && box.y + box.h <= 1 + 1e-10,
    "O recorte precisa ficar dentro da imagem.",
  );
export type ImageCrop = z.infer<typeof imageCropSchema>;

/** Crop intrinsic pixels and map their unit square into the original affine placement. */
export function croppedImageMatrix(
  matrix: [number, number, number, number, number, number],
  raw: ImageCrop,
): [number, number, number, number, number, number] {
  const box = imageCropSchema.parse(raw),
    [a, b, c, d, e, f] = matrix,
    bottom = 1 - box.y - box.h;
  return [
    a * box.w,
    b * box.w,
    c * box.h,
    d * box.h,
    e + a * box.x + c * bottom,
    f + b * box.x + d * bottom,
  ];
}

export async function cropPdfImage(
  engine: LocalPdfEngine,
  bytes: Uint8Array,
  page: number,
  object: number,
  raw: ImageCrop,
): Promise<Uint8Array> {
  if (bytes.length > 64 * 1024 * 1024) throw new Error("O recorte aceita revisões de até 64 MB.");
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false }),
    leaf = pdf.getPages()[page];
  if (!leaf) throw new Error("Página indisponível para recorte.");
  if (leaf.node.has(PDFName.of("Group")))
    throw new Error("Recorte em página com grupo de transparência ainda exige homologação.");
  const rawStates = leaf.node.Resources()?.get(PDFName.of("ExtGState"));
  if (rawStates) {
    const states = pdf.context.lookup(rawStates);
    if (!(states instanceof PDFDict)) throw new Error("Estados gráficos inválidos na página.");
    for (const [, ref] of states.entries()) {
      const state = pdf.context.lookup(ref);
      if (!(state instanceof PDFDict)) throw new Error("Estado gráfico inválido na página.");
      for (const name of ["SMask", "TR", "TR2"]) {
        const raw = state.get(PDFName.of(name)),
          value = raw ? pdf.context.lookup(raw) : undefined;
        if (
          value !== undefined &&
          value !== PDFName.of("None") &&
          value !== PDFName.of("Identity") &&
          value !== PDFName.of("Default")
        )
          throw new Error(
            "Recorte em página com máscara de estado gráfico ou função de transferência ainda exige homologação.",
          );
      }
    }
  }
  const requested = imageCropSchema.parse(raw),
    selected = engine.inspect(bytes).pages[page]?.objects.find((item) => item.index === object);
  if (selected?.type !== 3) throw new Error("Escolha uma imagem original disponível.");
  const source = engine.imagePixels(bytes, page, object),
    left = Math.ceil(source.width * requested.x - 1e-8),
    top = Math.ceil(source.height * requested.y - 1e-8),
    right = Math.floor(source.width * (requested.x + requested.w) + 1e-8),
    bottom = Math.floor(source.height * (requested.y + requested.h) + 1e-8),
    width = right - left,
    height = bottom - top;
  if (width < 1 || height < 1)
    throw new Error("O recorte precisa conservar pelo menos um pixel inteiro.");
  const pixels = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row++) {
    const at = ((top + row) * source.width + left) * 4;
    pixels.set(source.pixels.subarray(at, at + width * 4), row * width * 4);
  }
  const matrix = croppedImageMatrix(selected.matrix, {
    x: left / source.width,
    y: top / source.height,
    w: width / source.width,
    h: height / source.height,
  });
  return engine.transform(bytes, [
    { kind: "image", page, object, width, height, pixels },
    { kind: "transform", page, object, matrix },
  ]);
}
