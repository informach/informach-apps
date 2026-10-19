import { init, type WrappedPdfiumModule } from "@embedpdf/pdfium";
import fontkit from "@pdf-lib/fontkit";
import { z } from "zod";
import {
  type EngineOperation,
  engineOperationSchema,
  inspectionSchema,
  PdfEngineError,
  type PdfGlyph,
  type PdfInspection,
  type PdfSecurity,
  securitySchema,
  type TextDocument,
} from "./engine-contracts.ts";
import { inspectEditableFont } from "./font-file.ts";
import { type Box, pdfToView } from "./model.ts";
import { pdfPasswordProblem } from "./pdf-password.ts";

/** All native handles and allocated buffers are confined to one operation. No network requests. */
export class LocalPdfEngine {
  private native: WrappedPdfiumModule;
  private constructor(native: WrappedPdfiumModule) {
    this.native = native;
  }
  static async create(wasm: Uint8Array): Promise<LocalPdfEngine> {
    const native = await init({ wasmBinary: new Uint8Array(wasm).buffer });
    native.PDFiumExt_Init();
    return new LocalPdfEngine(native);
  }
  private alloc(size: number): number {
    const ptr = this.native.pdfium.wasmExports.malloc(size);
    if (!ptr) throw new Error("Memória insuficiente no motor PDF.");
    return ptr;
  }
  private free(ptr: number): void {
    this.native.pdfium.wasmExports.free(ptr);
  }
  private check(ok: unknown, message: string): void {
    if (!ok) throw new Error(message);
  }
  private withDocument<T>(bytes: Uint8Array, password: string, run: (doc: number) => T): T {
    const passwordProblem = pdfPasswordProblem(password);
    if (passwordProblem) throw new PdfEngineError("password", passwordProblem);
    if (!bytes.length || bytes.length > 512 * 1024 * 1024)
      throw new Error("PDF vazio ou acima de 512 MB.");
    const ptr = this.alloc(bytes.length);
    let doc = 0;
    try {
      this.native.pdfium.HEAPU8.set(bytes, ptr);
      doc = this.native.FPDF_LoadMemDocument64(ptr, bytes.length, password);
      if (!doc) {
        const code = this.native.FPDF_GetLastError();
        throw new PdfEngineError(
          code === 4 ? "password" : "operation",
          `Não foi possível abrir o PDF no motor local (código ${code}).`,
        );
      }
      return run(doc);
    } finally {
      if (doc) this.native.FPDF_CloseDocument(doc);
      this.free(ptr);
    }
  }
  private withPage<T>(doc: number, index: number, run: (page: number) => T): T {
    if (!Number.isInteger(index) || index < 0 || index >= this.native.FPDF_GetPageCount(doc))
      throw new Error("Página inexistente.");
    const page = this.native.FPDF_LoadPage(doc, index);
    this.check(page, "Não foi possível carregar a página.");
    try {
      return run(page);
    } finally {
      this.native.FPDF_ClosePage(page);
    }
  }
  private floats(count: 1, run: (ptr: number) => unknown): [number];
  private floats(count: 4, run: (ptr: number) => unknown): [number, number, number, number];
  private floats(
    count: 6,
    run: (ptr: number) => unknown,
  ): [number, number, number, number, number, number];
  private floats(count: number, run: (ptr: number) => unknown): number[] {
    const ptr = this.alloc(count * 4);
    try {
      this.check(run(ptr), "Não foi possível ler a geometria do objeto.");
      return Array.from({ length: count }, (_, i) =>
        this.native.pdfium.getValue(ptr + i * 4, "float"),
      );
    } finally {
      this.free(ptr);
    }
  }
  inspect(bytes: Uint8Array, password = ""): PdfInspection {
    const n = this.native;
    return this.withDocument(bytes, password, (doc) =>
      inspectionSchema.parse({
        encrypted: n.EPDF_IsEncrypted(doc),
        ownerUnlocked: n.EPDF_IsOwnerUnlocked(doc),
        signatures: n.FPDF_GetSignatureCount(doc),
        pages: Array.from({ length: n.FPDF_GetPageCount(doc) }, (_, index) =>
          this.withPage(doc, index, (page) => {
            const [left, bottom, right, top] = this.floats(
              4,
              (p) =>
                n.FPDFPage_GetCropBox(page, p, p + 4, p + 8, p + 12) ||
                n.FPDFPage_GetMediaBox(page, p, p + 4, p + 8, p + 12),
            );
            const textPage = n.FPDFText_LoadPage(page);
            this.check(textPage, "Não foi possível ler o texto da página.");
            try {
              return {
                index,
                rotation: n.FPDFPage_GetRotation(page) * 90,
                crop: { left, bottom, right, top },
                objects: Array.from({ length: n.FPDFPage_CountObjects(page) }, (_, objectIndex) => {
                  const object = n.FPDFPage_GetObject(page, objectIndex);
                  const type = n.FPDFPageObj_GetType(object);
                  const b = this.floats(4, (p) =>
                    n.FPDFPageObj_GetBounds(object, p, p + 4, p + 8, p + 12),
                  );
                  const matrix = this.floats(6, (p) => n.FPDFPageObj_GetMatrix(object, p));
                  let text = "";
                  let size = 0;
                  if (type === 1) {
                    const length = n.FPDFTextObj_GetText(object, textPage, 0, 0);
                    if (length > 0) {
                      const ptr = this.alloc(length);
                      try {
                        this.check(
                          n.FPDFTextObj_GetText(object, textPage, ptr, length),
                          "Falha na leitura do texto.",
                        );
                        text = n.pdfium.UTF16ToString(ptr);
                      } finally {
                        this.free(ptr);
                      }
                    }
                    [size] = this.floats(1, (p) => n.FPDFTextObj_GetFontSize(object, p));
                  }
                  return {
                    index: objectIndex,
                    type,
                    text,
                    size,
                    matrix,
                    bounds: { left: b[0], bottom: b[1], right: b[2], top: b[3] },
                  };
                }),
              };
            } finally {
              n.FPDFText_ClosePage(textPage);
            }
          }),
        ),
      }),
    );
  }
  pageSizes(bytes: Uint8Array, password = ""): { width: number; height: number }[] {
    return this.withDocument(bytes, password, (doc) => {
      const count = this.native.FPDF_GetPageCount(doc);
      if (count < 1 || count > 1000) throw new Error("Quantidade de páginas fora do perfil local.");
      return Array.from({ length: count }, (_, index) =>
        this.withPage(doc, index, (page) => ({
          width: this.native.FPDF_GetPageWidthF(page),
          height: this.native.FPDF_GetPageHeightF(page),
        })),
      );
    });
  }
  /** Rasterize a private loaded page; flatten visible appearances, never change the input PDF. */
  renderPage(
    bytes: Uint8Array,
    index: number,
    dpi: number,
    password = "",
    physicalScale = 1,
  ): { width: number; height: number; pixels: Uint8Array } {
    if (!Number.isInteger(dpi) || dpi < 1 || dpi > 600)
      throw new Error("Resolução de renderização inválida.");
    if (!Number.isFinite(physicalScale) || physicalScale <= 0 || physicalScale > 75000)
      throw new Error("Unidade física da página inválida.");
    const n = this.native;
    return this.withDocument(bytes, password, (doc) => {
      const geometry = this.withPage(doc, index, (page) => {
        const width = Math.ceil((n.FPDF_GetPageWidthF(page) * physicalScale * dpi) / 72),
          height = Math.ceil((n.FPDF_GetPageHeightF(page) * physicalScale * dpi) / 72);
        if (
          ![width, height].every(
            (value) => Number.isSafeInteger(value) && value >= 1 && value <= 8192,
          ) ||
          width * height > 24_000_000
        )
          throw new Error("Página acima de 8192 pixels por lado ou 24 megapixels.");
        this.check(
          n.FPDFPage_Flatten(page, 0),
          "Não foi possível preparar as aparências da página.",
        );
        return { width, height };
      });
      // Flatten updates /Contents; reload the page to rebuild its cached display objects.
      return this.withPage(doc, index, (page) => {
        const { width, height } = geometry;
        const pointer = this.alloc(width * height * 4);
        let bitmap = 0;
        try {
          bitmap = n.FPDFBitmap_CreateEx(width, height, 4, pointer, width * 4);
          this.check(bitmap, "Não foi possível preparar o bitmap da página.");
          this.check(
            n.FPDFBitmap_FillRect(bitmap, 0, 0, width, height, 0xffffffff),
            "Não foi possível preencher o fundo da página.",
          );
          n.FPDF_RenderPageBitmap(bitmap, page, 0, 0, width, height, 0, 1);
          const heap = n.pdfium.HEAPU8;
          if (pointer + width * height * 4 > heap.length)
            throw new Error("Bitmap fora dos limites da memória local.");
          const pixels = new Uint8Array(width * height * 3),
            sample = new DataView(heap.buffer, heap.byteOffset, heap.byteLength);
          for (let input = pointer, output = 0; output < pixels.length; input += 4, output += 3) {
            pixels[output] = sample.getUint8(input + 2);
            pixels[output + 1] = sample.getUint8(input + 1);
            pixels[output + 2] = sample.getUint8(input);
          }
          return { width, height, pixels };
        } finally {
          if (bitmap) n.FPDFBitmap_Destroy(bitmap);
          this.free(pointer);
        }
      });
    });
  }
  private save(doc: number): Uint8Array {
    const n = this.native;
    const writer = n.PDFiumExt_OpenFileWriter();
    this.check(writer, "Não foi possível iniciar a gravação.");
    try {
      // Full rewrite: never retain an incremental revision containing removed content.
      this.check(n.FPDF_SaveAsCopy(doc, writer, 2), "O motor não conseguiu regravar o PDF.");
      const size = n.PDFiumExt_GetFileWriterSize(writer);
      this.check(size, "O motor retornou um PDF vazio.");
      const ptr = this.alloc(size);
      try {
        this.check(
          n.PDFiumExt_GetFileWriterData(writer, ptr, size),
          "Falha na leitura do PDF regravado.",
        );
        return n.pdfium.HEAPU8.slice(ptr, ptr + size);
      } finally {
        this.free(ptr);
      }
    } finally {
      n.PDFiumExt_CloseFileWriter(writer);
    }
  }
  decrypt(bytes: Uint8Array, password: string): Uint8Array {
    return this.withDocument(bytes, password, (doc) => {
      if (this.native.EPDF_IsEncrypted(doc)) {
        if (!this.native.EPDF_IsOwnerUnlocked(doc))
          throw new PdfEngineError(
            "permission",
            "Use a senha de administração para editar este PDF com restrições.",
          );
        this.check(this.native.EPDF_RemoveEncryption(doc), "Não foi possível remover a proteção.");
      }
      return this.save(doc);
    });
  }
  encrypt(bytes: Uint8Array, security: PdfSecurity): Uint8Array {
    const settings = securitySchema.parse(security);
    return this.withDocument(bytes, "", (doc) => {
      if (this.native.EPDF_IsEncrypted(doc) && !this.native.EPDF_IsOwnerUnlocked(doc))
        throw new PdfEngineError(
          "permission",
          "Use a senha de administração para trocar a proteção deste PDF.",
        );
      // PDF permission bits: low/high quality print, copy, modify, annotations, forms, accessibility.
      const allowed =
        512 |
        (settings.print ? 4 | 2048 : 0) |
        (settings.copy ? 16 : 0) |
        (settings.modify ? 8 | 32 | 1024 : 0) |
        (settings.fill ? 256 : 0);
      this.check(
        this.native.EPDF_SetEncryption(doc, settings.user, settings.owner, allowed),
        "Não foi possível proteger o PDF.",
      );
      return this.save(doc);
    });
  }
  transform(bytes: Uint8Array, operations: EngineOperation[], stripHiddenData = false): Uint8Array {
    const ops = z.array(engineOperationSchema).max(10000).parse(operations);
    return this.withDocument(bytes, "", (doc) => {
      if (this.native.EPDF_IsEncrypted(doc) && !this.native.EPDF_IsOwnerUnlocked(doc))
        throw new PdfEngineError(
          "permission",
          "Use a senha de administração para alterar este PDF protegido.",
        );
      for (const op of ops)
        this.withPage(doc, op.page, (page) => {
          const n = this.native;
          if (op.kind === "redact") {
            const annot = n.FPDFPage_CreateAnnot(page, 28);
            this.check(annot, "Não foi possível criar a área de redação.");
            const ptr = this.alloc(16);
            try {
              const { left, bottom, right, top } = op.rect;
              [left, top, right, bottom].forEach((v, i) => {
                n.pdfium.setValue(ptr + i * 4, v, "float");
              });
              this.check(n.FPDFAnnot_SetRect(annot, ptr), "Área de redação inválida.");
              this.check(n.FPDFAnnot_SetColor(annot, 1, 0, 0, 0, 255), "Falha na cor da redação.");
              this.check(
                n.EPDFAnnot_ApplyRedaction(page, annot),
                "Não foi possível remover todo o conteúdo da área.",
              );
            } finally {
              this.free(ptr);
              n.FPDFPage_CloseAnnot(annot);
            }
            // The low-level redaction function rewrites page content. Remove overlapping
            // annotations explicitly: their Contents/AP/private models can disclose the original.
            for (let i = n.FPDFPage_GetAnnotCount(page) - 1; i >= 0; i--) {
              const handle = n.FPDFPage_GetAnnot(page, i);
              if (!handle) {
                this.check(
                  n.FPDFPage_RemoveAnnot(page, i),
                  "Não foi possível remover uma referência de anotação inválida.",
                );
                continue;
              }
              const rectPtr = this.alloc(16);
              let overlaps = false;
              try {
                this.check(
                  n.FPDFAnnot_GetRect(handle, rectPtr),
                  "Anotação sem área válida; a redação foi cancelada.",
                );
                const left = n.pdfium.getValue(rectPtr, "float"),
                  top = n.pdfium.getValue(rectPtr + 4, "float");
                const right = n.pdfium.getValue(rectPtr + 8, "float"),
                  bottom = n.pdfium.getValue(rectPtr + 12, "float");
                overlaps =
                  left <= op.rect.right &&
                  right >= op.rect.left &&
                  bottom <= op.rect.top &&
                  top >= op.rect.bottom;
              } finally {
                this.free(rectPtr);
                n.FPDFPage_CloseAnnot(handle);
              }
              if (overlaps)
                this.check(
                  n.FPDFPage_RemoveAnnot(page, i),
                  "Não foi possível remover uma anotação da área.",
                );
            }
          } else {
            if (op.object >= n.FPDFPage_CountObjects(page))
              throw new Error("Objeto inexistente. Reabra o editor de conteúdo.");
            const object = n.FPDFPage_GetObject(page, op.object);
            if (op.kind === "delete") {
              this.check(
                n.FPDFPage_RemoveObject(page, object),
                "Não foi possível remover o objeto.",
              );
              n.FPDFPageObj_Destroy(object);
            } else if (op.kind === "transform") {
              const ptr = this.alloc(24);
              try {
                op.matrix.forEach((v, i) => {
                  n.pdfium.setValue(ptr + i * 4, v, "float");
                });
                this.check(
                  n.FPDFPageObj_SetMatrix(object, ptr),
                  "Não foi possível transformar o objeto.",
                );
              } finally {
                this.free(ptr);
              }
            } else if (op.kind === "image") {
              this.check(
                n.FPDFPageObj_GetType(object) === 3,
                "O objeto escolhido não é uma imagem.",
              );
              if (op.pixels.length !== op.width * op.height * 4)
                throw new Error("Dados da imagem inválidos.");
              const pixels = this.alloc(op.pixels.length),
                pages = this.alloc(4);
              let bitmap = 0;
              try {
                const bgra = n.pdfium.HEAPU8,
                  rgba = new DataView(op.pixels.buffer, op.pixels.byteOffset, op.pixels.byteLength);
                for (let i = 0; i < op.pixels.length; i += 4) {
                  bgra[pixels + i] = rgba.getUint8(i + 2);
                  bgra[pixels + i + 1] = rgba.getUint8(i + 1);
                  bgra[pixels + i + 2] = rgba.getUint8(i);
                  bgra[pixels + i + 3] = rgba.getUint8(i + 3);
                }
                bitmap = n.FPDFBitmap_CreateEx(op.width, op.height, 4, pixels, op.width * 4);
                this.check(bitmap, "Não foi possível decodificar a imagem substituta.");
                n.pdfium.setValue(pages, page, "i32");
                this.check(
                  n.FPDFImageObj_SetBitmap(pages, 1, object, bitmap),
                  "Não foi possível substituir a imagem original.",
                );
              } finally {
                if (bitmap) n.FPDFBitmap_Destroy(bitmap);
                this.free(pixels);
                this.free(pages);
              }
            } else {
              this.check(n.FPDFPageObj_GetType(object) === 1, "O objeto escolhido não é texto.");
              if (!op.font) throw new Error("Escolha uma fonte local para o texto substituto.");
              if (!inspectEditableFont(op.font).subset)
                throw new Error(
                  "Esta fonte exige incorporação integral, ainda não disponível na substituição de objetos. Escolha uma fonte que permita subsetting.",
                );
              const fontData = fontkit.create(op.font);
              for (const char of op.text)
                if (!fontData.hasGlyphForCodePoint(char.codePointAt(0) ?? 0))
                  throw new Error(
                    `A fonte local não contém o caractere “${char}”. Escolha outra fonte.`,
                  );
              const fontPtr = this.alloc(op.font.length);
              let font = 0;
              let replacement = 0;
              try {
                n.pdfium.HEAPU8.set(op.font, fontPtr);
                font = n.FPDFText_LoadFont(doc, fontPtr, op.font.length, 2, true);
                this.check(font, "Não foi possível incorporar a fonte local.");
                const [size] = this.floats(1, (p) => n.FPDFTextObj_GetFontSize(object, p));
                replacement = n.FPDFPageObj_CreateTextObj(doc, font, size);
                this.check(replacement, "Não foi possível criar o texto substituto.");
                const renderMode = n.FPDFTextObj_GetTextRenderMode(object);
                this.check(
                  renderMode >= 0 && n.FPDFTextObj_SetTextRenderMode(replacement, renderMode),
                  "Falha ao preservar o modo de renderização do texto.",
                );
                const matrix = this.alloc(24);
                try {
                  this.check(n.FPDFPageObj_GetMatrix(object, matrix), "Falha na matriz do texto.");
                  this.check(
                    n.FPDFPageObj_SetMatrix(replacement, matrix),
                    "Falha no posicionamento do texto.",
                  );
                } finally {
                  this.free(matrix);
                }
                const colorPtr = this.alloc(16);
                try {
                  this.check(
                    n.FPDFPageObj_GetFillColor(
                      object,
                      colorPtr,
                      colorPtr + 4,
                      colorPtr + 8,
                      colorPtr + 12,
                    ),
                    "Falha na leitura da cor do texto.",
                  );
                  const rgba: [number, number, number, number] = [
                    n.pdfium.getValue(colorPtr, "i32"),
                    n.pdfium.getValue(colorPtr + 4, "i32"),
                    n.pdfium.getValue(colorPtr + 8, "i32"),
                    n.pdfium.getValue(colorPtr + 12, "i32"),
                  ];
                  this.check(
                    n.FPDFPageObj_SetFillColor(replacement, rgba[0], rgba[1], rgba[2], rgba[3]),
                    "Falha na cor do texto.",
                  );
                  this.check(
                    n.FPDFPageObj_GetStrokeColor(
                      object,
                      colorPtr,
                      colorPtr + 4,
                      colorPtr + 8,
                      colorPtr + 12,
                    ),
                    "Falha na leitura do contorno do texto.",
                  );
                  const stroke: [number, number, number, number] = [
                    n.pdfium.getValue(colorPtr, "i32"),
                    n.pdfium.getValue(colorPtr + 4, "i32"),
                    n.pdfium.getValue(colorPtr + 8, "i32"),
                    n.pdfium.getValue(colorPtr + 12, "i32"),
                  ];
                  this.check(
                    n.FPDFPageObj_SetStrokeColor(
                      replacement,
                      stroke[0],
                      stroke[1],
                      stroke[2],
                      stroke[3],
                    ),
                    "Falha ao preservar a cor do contorno do texto.",
                  );
                  const [width] = this.floats(1, (p) => n.FPDFPageObj_GetStrokeWidth(object, p));
                  this.check(
                    n.FPDFPageObj_SetStrokeWidth(replacement, width),
                    "Falha ao preservar a espessura do contorno do texto.",
                  );
                } finally {
                  this.free(colorPtr);
                }
                const textPtr = this.alloc((op.text.length + 1) * 2);
                try {
                  n.pdfium.stringToUTF16(op.text, textPtr, (op.text.length + 1) * 2);
                  this.check(
                    n.FPDFText_SetText(replacement, textPtr),
                    "Não foi possível substituir o texto.",
                  );
                } finally {
                  this.free(textPtr);
                }
                this.check(
                  n.FPDFPage_InsertObjectAtIndex(page, replacement, op.object),
                  "Falha na inserção do texto substituto.",
                );
                replacement = 0; // Page owns the object after insertion.
                this.check(
                  n.FPDFPage_RemoveObject(page, object),
                  "Falha na remoção do texto original.",
                );
                n.FPDFPageObj_Destroy(object);
              } finally {
                if (replacement) n.FPDFPageObj_Destroy(replacement);
                if (font) n.FPDFFont_Close(font);
                this.free(fontPtr);
              }
            }
          }
          this.check(
            n.FPDFPage_GenerateContent(page),
            "Não foi possível regravar o conteúdo da página.",
          );
        });
      if (stripHiddenData || ops.some((op) => op.kind === "redact")) {
        const strip = (object: number, depth: number): void => {
          if (depth > 50)
            throw new Error("Estrutura de conteúdo profunda demais para sanitização segura.");
          for (let i = this.native.FPDFPageObj_CountMarks(object) - 1; i >= 0; i--)
            this.check(
              this.native.FPDFPageObj_RemoveMark(
                object,
                this.native.FPDFPageObj_GetMark(object, i),
              ),
              "Não foi possível remover texto alternativo oculto.",
            );
          if (this.native.FPDFPageObj_GetType(object) === 5)
            for (let i = 0; i < this.native.FPDFFormObj_CountObjects(object); i++)
              strip(this.native.FPDFFormObj_GetObject(object, i), depth + 1);
        };
        for (let i = 0; i < this.native.FPDF_GetPageCount(doc); i++)
          this.withPage(doc, i, (page) => {
            for (let j = 0; j < this.native.FPDFPage_CountObjects(page); j++)
              strip(this.native.FPDFPage_GetObject(page, j), 0);
            this.check(
              this.native.FPDFPage_GenerateContent(page),
              "Falha ao remover marcações ocultas.",
            );
          });
      }
      return this.save(doc);
    });
  }
  textDocument(
    bytes: Uint8Array,
    options: { password?: string; includeAnnotations: boolean; styles?: boolean; layout?: boolean },
    progress?: (page: number, total: number) => void,
  ): TextDocument {
    const n = this.native;
    const styleFor = (textPage: number, index: number): NonNullable<PdfGlyph["style"]> => {
      const object = n.FPDFText_GetTextObject(textPage, index),
        cached = styleCache.get(object);
      if (object && cached) return cached;
      const size = n.FPDFText_GetFontSize(textPage, index);
      const length = n.FPDFText_GetFontInfo(textPage, index, 0, 0, 0);
      if (!length || length > 4096)
        return { size: size > 0 ? size : 11, bold: false, italic: false };
      const buffer = this.alloc(length),
        flags = this.alloc(4);
      try {
        this.check(
          n.FPDFText_GetFontInfo(textPage, index, buffer, length, flags) === length,
          "Não foi possível ler a fonte do texto.",
        );
        const family = new TextDecoder().decode(
          n.pdfium.HEAPU8.subarray(buffer, buffer + length - 1),
        );
        const fontFlags = n.pdfium.getValue(flags, "i32"),
          weight = n.FPDFText_GetFontWeight(textPage, index);
        const value = {
          family: family.slice(0, 512),
          size: size > 0 ? size : 11,
          bold:
            weight >= 600 ||
            !!(fontFlags & 0x40000) ||
            /(?:^|[-\s])(?:Semi)?Bold|Black|Heavy|Demi/i.test(family),
          italic: !!(fontFlags & 64) || /Italic|Oblique/i.test(family),
        };
        if (object) styleCache.set(object, value);
        return value;
      } finally {
        this.free(buffer);
        this.free(flags);
      }
    };
    const styleCache = new Map<number, NonNullable<PdfGlyph["style"]>>();
    return this.withDocument(bytes, options.password ?? "", (doc) => {
      const total = n.FPDF_GetPageCount(doc);
      const pages: TextDocument["pages"] = [];
      let documentCharacters = 0;
      for (let index = 0; index < total; index++) {
        try {
          pages.push(
            this.withPage(doc, index, (page) => {
              if (options.includeAnnotations)
                for (let i = n.FPDFPage_GetAnnotCount(page) - 1; i >= 0; i--) {
                  const annot = n.FPDFPage_GetAnnot(page, i);
                  if (!annot) continue;
                  try {
                    const subtype = n.FPDFAnnot_GetSubtype(annot);
                    if (subtype === 1 || subtype === 2) continue; // Notes are indexed by their model; links have no text appearance.
                    if (!n.FPDFAnnot_GetAP(annot, 0, 0, 0)) continue;
                    this.check(
                      n.EPDFAnnot_Flatten(page, annot),
                      "Não foi possível indexar a aparência de uma anotação.",
                    );
                  } finally {
                    n.FPDFPage_CloseAnnot(annot);
                  }
                }
              const [left, bottom, right, top] = this.floats(
                4,
                (p) =>
                  n.FPDFPage_GetCropBox(page, p, p + 4, p + 8, p + 12) ||
                  n.FPDFPage_GetMediaBox(page, p, p + 4, p + 8, p + 12),
              );
              const rotation = n.FPDFPage_GetRotation(page) * 90;
              if (rotation !== 0 && rotation !== 90 && rotation !== 180 && rotation !== 270)
                throw new Error("Rotação inválida na indexação.");
              const crop = { x: left, y: bottom, w: right - left, h: top - bottom };
              const textPage = n.FPDFText_LoadPage(page);
              this.check(textPage, "Não foi possível extrair o texto da página.");
              const pointer = this.alloc(32);
              try {
                const count = n.FPDFText_CountChars(textPage);
                documentCharacters += count;
                if (count < 0 || documentCharacters > 2_000_000)
                  throw new Error(
                    "Documento acima do limite de 2 milhões de caracteres por índice.",
                  );
                const glyphs: PdfGlyph[] = [];
                styleCache.clear();
                let missingUnicode = 0;
                for (let charIndex = 0; charIndex < count; charIndex++) {
                  const unicode = n.FPDFText_GetUnicode(textPage, charIndex);
                  if (!unicode || unicode > 0x10ffff || (unicode >= 0xd800 && unicode <= 0xdfff))
                    missingUnicode++;
                  const text =
                    unicode && unicode <= 0x10ffff && !(unicode >= 0xd800 && unicode <= 0xdfff)
                      ? String.fromCodePoint(unicode)
                      : "�";
                  if (/\s/u.test(text)) {
                    glyphs.push({ text });
                    continue;
                  }
                  this.check(
                    n.FPDFText_GetCharBox(
                      textPage,
                      charIndex,
                      pointer,
                      pointer + 8,
                      pointer + 16,
                      pointer + 24,
                    ),
                    "Não foi possível localizar um caractere da página.",
                  );
                  const l = n.pdfium.getValue(pointer, "double"),
                    r = n.pdfium.getValue(pointer + 8, "double");
                  const b = n.pdfium.getValue(pointer + 16, "double"),
                    t = n.pdfium.getValue(pointer + 24, "double");
                  const a = pdfToView(rotation, crop, l, b),
                    z = pdfToView(rotation, crop, r, t);
                  const glyph: PdfGlyph = {
                    text,
                    box: {
                      x: Math.min(a[0], z[0]),
                      y: Math.min(a[1], z[1]),
                      w: Math.abs(z[0] - a[0]),
                      h: Math.abs(z[1] - a[1]),
                    },
                  };
                  if (options.styles) glyph.style = styleFor(textPage, charIndex);
                  if (options.layout) {
                    const nativeAngle = n.FPDFText_GetCharAngle(textPage, charIndex);
                    this.check(
                      Number.isFinite(nativeAngle) && nativeAngle >= 0,
                      "Não foi possível ler a orientação do caractere.",
                    );
                    glyph.angle = (((rotation + (nativeAngle * 180) / Math.PI) % 360) + 360) % 360;
                    this.check(
                      n.FPDFText_GetLooseCharBox(textPage, charIndex, pointer),
                      "Não foi possível ler a célula tipográfica do caractere.",
                    );
                    const left = n.pdfium.getValue(pointer, "float"),
                      top = n.pdfium.getValue(pointer + 4, "float");
                    const right = n.pdfium.getValue(pointer + 8, "float"),
                      bottom = n.pdfium.getValue(pointer + 12, "float");
                    const first = pdfToView(rotation, crop, left, bottom),
                      last = pdfToView(rotation, crop, right, top);
                    glyph.layoutBox = {
                      x: Math.min(first[0], last[0]),
                      y: Math.min(first[1], last[1]),
                      w: Math.abs(last[0] - first[0]),
                      h: Math.abs(last[1] - first[1]),
                    };
                  }
                  glyphs.push(glyph);
                }
                return { index, glyphs, missingUnicode };
              } finally {
                this.free(pointer);
                n.FPDFText_ClosePage(textPage);
              }
            }),
          );
        } catch (error) {
          pages.push({
            index,
            glyphs: [],
            missingUnicode: 0,
            error: error instanceof Error ? error.message : "Falha na extração da página.",
          });
        }
        progress?.(index + 1, total);
      }
      return { pages };
    });
  }

  /** Render only this image through the page renderer, preserving its clip and visible CropBox. */
  visibleImage(
    bytes: Uint8Array,
    pageIndex: number,
    objectIndex: number,
    scale = 2,
  ): { width: number; height: number; pixels: Uint8Array; box: Box } | null {
    if (!Number.isFinite(scale) || scale <= 0 || scale > 4)
      throw new Error("Escala de imagem visível inválida.");
    const n = this.native;
    return this.withDocument(bytes, "", (doc) => {
      const geometry = this.withPage(doc, pageIndex, (page) => {
        if (
          !Number.isInteger(objectIndex) ||
          objectIndex < 0 ||
          objectIndex >= n.FPDFPage_CountObjects(page)
        )
          throw new Error("Imagem inexistente.");
        const object = n.FPDFPage_GetObject(page, objectIndex);
        if (n.FPDFPageObj_GetType(object) !== 3)
          throw new Error("O objeto escolhido não é uma imagem.");
        const dimensions = this.alloc(8);
        try {
          this.check(
            n.FPDFImageObj_GetImagePixelSize(object, dimensions, dimensions + 4),
            "Não foi possível verificar o tamanho da imagem.",
          );
          const width = n.pdfium.getValue(dimensions, "i32"),
            height = n.pdfium.getValue(dimensions + 4, "i32");
          if (
            width < 1 ||
            height < 1 ||
            width > 16384 ||
            height > 16384 ||
            width * height > 50_000_000
          )
            throw new Error("Imagem acima do limite de dimensões/pixels.");
        } finally {
          this.free(dimensions);
        }
        const [left, bottom, right, top] = this.floats(
            4,
            (p) =>
              n.FPDFPage_GetCropBox(page, p, p + 4, p + 8, p + 12) ||
              n.FPDFPage_GetMediaBox(page, p, p + 4, p + 8, p + 12),
          ),
          bounds = this.floats(4, (p) => n.FPDFPageObj_GetBounds(object, p, p + 4, p + 8, p + 12)),
          rotation = n.FPDFPage_GetRotation(page) * 90;
        if (rotation !== 0 && rotation !== 90 && rotation !== 180 && rotation !== 270)
          throw new Error("Rotação de imagem inválida.");
        const crop = { x: left, y: bottom, w: right - left, h: top - bottom },
          a = pdfToView(rotation, crop, bounds[0], bounds[1]),
          b = pdfToView(rotation, crop, bounds[2], bounds[3]),
          pageWidth = n.FPDF_GetPageWidthF(page),
          pageHeight = n.FPDF_GetPageHeightF(page);
        if (
          ![pageWidth, pageHeight].every(
            (value) => Number.isFinite(value) && value > 0 && value <= 16000,
          )
        )
          throw new Error("Página acima do perfil local de imagem visível.");
        const x = Math.max(0, Math.min(a[0], b[0])),
          y = Math.max(0, Math.min(a[1], b[1])),
          endX = Math.min(pageWidth, Math.max(a[0], b[0])),
          endY = Math.min(pageHeight, Math.max(a[1], b[1]));
        if (endX <= x || endY <= y) return null;
        const fullWidth = Math.ceil(pageWidth * scale),
          fullHeight = Math.ceil(pageHeight * scale),
          leftPixel = Math.ceil((x * fullWidth) / pageWidth),
          topPixel = Math.ceil((y * fullHeight) / pageHeight),
          endPixelX = Math.floor((endX * fullWidth) / pageWidth),
          endPixelY = Math.floor((endY * fullHeight) / pageHeight),
          width = endPixelX - leftPixel,
          height = endPixelY - topPixel;
        if (width < 1 || height < 1)
          throw new Error("A parte visível da imagem é menor que um pixel no perfil de conversão.");
        if (width > 16384 || height > 16384 || width * height > 50_000_000)
          throw new Error("Imagem visível excede o limite de pixels.");
        for (let index = n.FPDFPage_CountObjects(page) - 1; index >= 0; index--)
          if (index !== objectIndex) {
            const removed = n.FPDFPage_GetObject(page, index);
            this.check(
              n.FPDFPage_RemoveObject(page, removed),
              "Não foi possível isolar a imagem na página privada.",
            );
            n.FPDFPageObj_Destroy(removed);
          }
        this.check(n.FPDFPage_GenerateContent(page), "Não foi possível preparar a imagem visível.");
        return {
          width,
          height,
          fullWidth,
          fullHeight,
          leftPixel,
          topPixel,
          box: {
            x: (leftPixel * pageWidth) / fullWidth,
            y: (topPixel * pageHeight) / fullHeight,
            w: (width * pageWidth) / fullWidth,
            h: (height * pageHeight) / fullHeight,
          },
        };
      });
      if (!geometry) return null;
      return this.withPage(doc, pageIndex, (page) => {
        const { width, height } = geometry,
          pointer = this.alloc(width * height * 4);
        let bitmap = 0;
        try {
          bitmap = n.FPDFBitmap_CreateEx(width, height, 4, pointer, width * 4);
          this.check(bitmap, "Não foi possível preparar o bitmap da imagem.");
          this.check(
            n.FPDFBitmap_FillRect(bitmap, 0, 0, width, height, 0),
            "Não foi possível preparar o fundo transparente.",
          );
          n.FPDF_RenderPageBitmap(
            bitmap,
            page,
            -geometry.leftPixel,
            -geometry.topPixel,
            geometry.fullWidth,
            geometry.fullHeight,
            0,
            0,
          );
          const heap = n.pdfium.HEAPU8;
          if (pointer + width * height * 4 > heap.length)
            throw new Error("Imagem fora dos limites da memória local.");
          const sample = new DataView(heap.buffer, heap.byteOffset, heap.byteLength),
            pixels = new Uint8Array(width * height * 4);
          for (let at = 0; at < pixels.length; at += 4) {
            pixels[at] = sample.getUint8(pointer + at + 2);
            pixels[at + 1] = sample.getUint8(pointer + at + 1);
            pixels[at + 2] = sample.getUint8(pointer + at);
            pixels[at + 3] = sample.getUint8(pointer + at + 3);
          }
          return { width, height, pixels, box: geometry.box };
        } finally {
          if (bitmap) n.FPDFBitmap_Destroy(bitmap);
          this.free(pointer);
        }
      });
    });
  }
  imagePixels(
    bytes: Uint8Array,
    pageIndex: number,
    objectIndex: number,
    rendered = false,
  ): { width: number; height: number; pixels: Uint8Array } {
    const n = this.native;
    return this.withDocument(bytes, "", (doc) =>
      this.withPage(doc, pageIndex, (page) => {
        if (objectIndex < 0 || objectIndex >= n.FPDFPage_CountObjects(page))
          throw new Error("Imagem inexistente.");
        const object = n.FPDFPage_GetObject(page, objectIndex);
        this.check(n.FPDFPageObj_GetType(object) === 3, "O objeto não é uma imagem.");
        const dimensions = this.alloc(8);
        let intrinsicWidth = 0,
          intrinsicHeight = 0;
        try {
          this.check(
            n.FPDFImageObj_GetImagePixelSize(object, dimensions, dimensions + 4),
            "Não foi possível verificar o tamanho da imagem.",
          );
          const width = n.pdfium.getValue(dimensions, "i32"),
            height = n.pdfium.getValue(dimensions + 4, "i32");
          intrinsicWidth = width;
          intrinsicHeight = height;
          if (
            width < 1 ||
            height < 1 ||
            width > 16384 ||
            height > 16384 ||
            width * height > 50_000_000
          )
            throw new Error("Imagem acima do limite de dimensões/pixels.");
        } finally {
          this.free(dimensions);
        }
        if (rendered) {
          const [left, bottom, right, top] = this.floats(4, (pointer) =>
            n.FPDFPageObj_GetBounds(object, pointer, pointer + 4, pointer + 8, pointer + 12),
          );
          const width = Math.ceil((right - left) * 2),
            height = Math.ceil((top - bottom) * 2);
          if (
            width < 1 ||
            height < 1 ||
            width > 16384 ||
            height > 16384 ||
            width * height > 50_000_000
          )
            throw new Error("Imagem transformada excede os limites de exportação.");
          n.FPDFPageObj_Transform(object, 2, 0, 0, 2, 0, 0);
        }
        if (!rendered) {
          // GetBitmap ignores image masks. Canonical pixel placement keeps the mask at intrinsic resolution.
          // Page-object opacity belongs to the placement and must not be baked into reusable pixels.
          const color = this.alloc(16);
          try {
            // PDFium returns false for an implicit color state; its PDF default is black.
            const explicit = n.FPDFPageObj_GetFillColor(
              object,
              color,
              color + 4,
              color + 8,
              color + 12,
            );
            this.check(
              n.FPDFPageObj_SetFillColor(
                object,
                explicit ? n.pdfium.getValue(color, "i32") : 0,
                explicit ? n.pdfium.getValue(color + 4, "i32") : 0,
                explicit ? n.pdfium.getValue(color + 8, "i32") : 0,
                255,
              ),
              "Não foi possível separar a opacidade da imagem.",
            );
          } finally {
            this.free(color);
          }
          const matrix = this.alloc(24);
          try {
            [intrinsicWidth, 0, 0, intrinsicHeight, 0, 0].forEach((value, index) => {
              n.pdfium.setValue(matrix + index * 4, value, "float");
            });
            this.check(
              n.FPDFPageObj_SetMatrix(object, matrix),
              "Não foi possível preparar os pixels com transparência.",
            );
          } finally {
            this.free(matrix);
          }
        }
        const bitmap = n.FPDFImageObj_GetRenderedBitmap(doc, page, object);
        this.check(bitmap, "Não foi possível extrair a imagem.");
        try {
          const width = n.FPDFBitmap_GetWidth(bitmap),
            height = n.FPDFBitmap_GetHeight(bitmap);
          if (
            width < 1 ||
            height < 1 ||
            width > 16384 ||
            height > 16384 ||
            width * height > 50_000_000
          )
            throw new Error("Imagem acima do limite de 50 megapixels.");
          const format = n.FPDFBitmap_GetFormat(bitmap),
            stride = n.FPDFBitmap_GetStride(bitmap);
          if (![1, 2, 3, 4].includes(format))
            throw new Error("Formato de bitmap PDF não suportado.");
          const channels = format === 1 ? 1 : format === 2 ? 3 : 4;
          const ptr = n.FPDFBitmap_GetBuffer(bitmap);
          const source = n.pdfium.HEAPU8;
          if (
            !Number.isSafeInteger(ptr) ||
            ptr <= 0 ||
            !Number.isSafeInteger(stride) ||
            stride < width * channels ||
            ptr + (height - 1) * stride + width * channels > source.length
          )
            throw new Error("Buffer de bitmap PDF inválido ou fora da memória disponível.");
          const pixels = new Uint8Array(width * height * 4),
            sample = new DataView(source.buffer, source.byteOffset, source.byteLength);
          for (let y = 0; y < height; y++)
            for (let x = 0; x < width; x++) {
              const input = ptr + y * stride + x * channels,
                output = (y * width + x) * 4;
              pixels[output] = sample.getUint8(input + (channels === 1 ? 0 : 2));
              pixels[output + 1] = sample.getUint8(input + (channels === 1 ? 0 : 1));
              pixels[output + 2] = sample.getUint8(input);
              pixels[output + 3] = format === 4 ? sample.getUint8(input + 3) : 255;
            }
          return { width, height, pixels };
        } finally {
          n.FPDFBitmap_Destroy(bitmap);
        }
      }),
    );
  }
}
