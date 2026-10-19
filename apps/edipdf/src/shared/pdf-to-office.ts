import type { ImagePixels } from "./engine-contracts.ts";
import type { LocalPdfEngine } from "./local-engine.ts";
import { type OfficeBlock, type OfficeDocument, officeDocumentSchema } from "./office-format.ts";
import { lineParagraph, nativeTextLines, visiblePageGlyphs } from "./text-layout.ts";
import { plainText } from "./text-search.ts";

export function pdfToPlainText(
  bytes: Uint8Array,
  engine: LocalPdfEngine,
  progress?: (page: number, total: number) => void,
): { bytes: Uint8Array; pages: number; warnings: string[] } {
  const document = engine.textDocument(bytes, { includeAnnotations: true }, progress),
    sizes = engine.pageSizes(bytes),
    warnings = new Set<string>();
  let characters = 0;
  const contents = document.pages.map((page) => {
    if (page.error) throw new Error(`Falha ao extrair a página ${page.index + 1}: ${page.error}`);
    const size = sizes[page.index];
    if (!size) throw new Error("Geometria de texto PDF indisponível.");
    const visible = visiblePageGlyphs(page.glyphs, size.width, size.height),
      text = plainText(visible);
    if (visible.length !== page.glyphs.length)
      warnings.add("Caracteres fora do recorte visível da página não foram exportados.");
    characters += text.length;
    if (characters > 5_000_000)
      throw new Error("Texto excede 5 milhões de caracteres. Extraia um intervalo menor.");
    if (!text.trim())
      warnings.add(
        "Há páginas sem texto pesquisável. Execute OCR para incluir o conteúdo digitalizado.",
      );
    if (page.missingUnicode)
      warnings.add(
        "Há caracteres sem mapeamento Unicode; confira o original ou execute OCR antes de exportar.",
      );
    return `Página ${page.index + 1}\r\n${text}`;
  });
  if (!characters)
    throw new Error("O documento não tem texto pesquisável. Execute OCR antes de exportar TXT.");
  return {
    bytes: new TextEncoder().encode(contents.join("\r\n\f\r\n")),
    pages: document.pages.length,
    warnings: [...warnings],
  };
}

export async function pdfToOffice(
  bytes: Uint8Array,
  title: string,
  engine: LocalPdfEngine,
  encodeImage: (image: ImagePixels, rotation: 0 | 90 | 180 | 270) => Promise<Uint8Array>,
  progress?: (page: number, total: number) => void,
): Promise<OfficeDocument> {
  const inspection = engine.inspect(bytes);
  if (inspection.pages.length > 200)
    throw new Error("Converta até 200 páginas por vez. Extraia um intervalo antes de converter.");
  const indexed = engine.textDocument(
    bytes,
    { includeAnnotations: true, styles: true, layout: true },
    progress,
  );
  let characters = 0,
    imageBytes = 0,
    images = 0;
  const warnings = new Set<string>([
    "Reconstrução editável por linhas de texto: paginação, colunas, listas e tabelas precisam de revisão no editor de destino. Fontes são substituídas por Noto Sans.",
  ]);
  const pages: OfficeDocument["pages"] = [];
  for (const source of inspection.pages) {
    const text = indexed.pages.find((page) => page.index === source.index);
    if (!text || text.error)
      throw new Error(
        `Não foi possível ler o texto da página ${source.index + 1}: ${text?.error ?? "índice ausente"}.`,
      );
    characters += text.glyphs.reduce((count, glyph) => count + glyph.text.length, 0);
    if (characters > 2_000_000)
      throw new Error("A conversão excede 2 milhões de caracteres. Extraia um intervalo menor.");
    if (text.missingUnicode)
      warnings.add(
        "Há caracteres sem mapeamento Unicode no PDF. Execute OCR e confira o texto antes de converter.",
      );
    const rotation =
      source.rotation === 90 || source.rotation === 180 || source.rotation === 270
        ? source.rotation
        : 0;
    const crop = {
      x: source.crop.left,
      y: source.crop.bottom,
      w: source.crop.right - source.crop.left,
      h: source.crop.top - source.crop.bottom,
    };
    const width = rotation % 180 ? crop.h : crop.w,
      height = rotation % 180 ? crop.w : crop.h,
      visible = visiblePageGlyphs(text.glyphs, width, height);
    if (visible.length !== text.glyphs.length)
      warnings.add("Caracteres fora do recorte visível da página não foram exportados.");
    const ordered: { top: number; left: number; block: OfficeBlock }[] = nativeTextLines(
      visible,
    ).map((line) => ({
      top: line.box?.y ?? 0,
      left: line.box?.x ?? 0,
      block: lineParagraph(line),
    }));
    for (const object of source.objects) {
      if (object.type !== 3) {
        if ([2, 4, 5].includes(object.type))
          warnings.add(
            "Desenhos vetoriais, gradientes e imagens dentro de grupos não entram nesta reconstrução editável. Use PDF ou exportação visual para preservar a aparência.",
          );
        continue;
      }
      if (++images > 200)
        throw new Error("Conversão excede 200 imagens. Extraia um intervalo menor.");
      const pixels = engine.visibleImage(bytes, source.index, object.index);
      if (!pixels) continue;
      const png = await encodeImage(pixels, 0);
      imageBytes += png.length;
      if (imageBytes > 64 * 1024 * 1024)
        throw new Error("Imagens da conversão excedem 64 MB. Compacte ou extraia um intervalo.");
      ordered.push({
        top: pixels.box.y,
        left: pixels.box.x,
        block: {
          kind: "image",
          bytes: new Uint8Array(png),
          format: "png",
          width: pixels.box.w,
          height: pixels.box.h,
          alt: `Imagem da página ${source.index + 1}`,
        },
      });
    }
    if (
      !ordered.some((item) => item.block.kind === "paragraph") &&
      source.objects.some((object) => object.type === 3)
    )
      warnings.add(
        "Há páginas digitalizadas sem texto pesquisável. Execute OCR para obter conteúdo editável.",
      );
    ordered.sort((a, b) => a.top - b.top || a.left - b.left);
    pages.push({
      width: rotation % 180 ? crop.h : crop.w,
      height: rotation % 180 ? crop.w : crop.h,
      blocks: ordered.map((item) => item.block),
    });
  }
  if (!pages.some((page) => page.blocks.length))
    throw new Error(
      "Não há texto ou imagens conversíveis. Execute OCR ou escolha uma exportação visual.",
    );
  return officeDocumentSchema.parse({ title, pages, warnings: [...warnings] });
}
