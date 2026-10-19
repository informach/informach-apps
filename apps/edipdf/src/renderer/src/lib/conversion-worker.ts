import wasmUrl from "@embedpdf/pdfium/pdfium.wasm?url";
import { conversionRequestSchema, conversionResultSchema } from "@shared/conversion-format";
import type { ImagePixels } from "@shared/engine-contracts";
import { LocalPdfEngine } from "@shared/local-engine";
import type { Rotation } from "@shared/model";
import { exportDocx } from "@shared/office-export";
import { importDocx, importXlsx, spreadsheetDocument } from "@shared/office-import";
import { renderOfficePdf } from "@shared/office-render";
import { importRtf } from "@shared/office-rtf";
import { exportOdt } from "@shared/open-document/export";
import { importOds } from "@shared/open-document/spreadsheet";
import { importOdt } from "@shared/open-document/text";
import { pdfToOffice, pdfToPlainText } from "@shared/pdf-to-office";
import { cropPresentationPicture } from "@shared/presentation/crop-picture";
import { exportOdp } from "@shared/presentation/odp-export";
import { importOdp } from "@shared/presentation/odp-import";
import { officeFlowPresentation } from "@shared/presentation/office-flow";
import { exportPptx } from "@shared/presentation/pptx-export";
import { importPptx } from "@shared/presentation/pptx-import";
import { preparePresentation } from "@shared/presentation/render";
import { exportRtf } from "@shared/rtf-export";
import { exportPdfTable } from "@shared/table-export";
import { tiffToPdf } from "@shared/tiff";
import { pdfToTiff } from "@shared/tiff-export";

const encodePicture = async (
  image: ImagePixels,
  rotation: Rotation = 0,
): Promise<Uint8Array<ArrayBuffer>> => {
  const source = new OffscreenCanvas(image.width, image.height),
    context = source.getContext("2d");
  if (!context) throw new Error("Não foi possível preparar uma imagem da conversão.");
  context.putImageData(
    new ImageData(new Uint8ClampedArray(image.pixels), image.width, image.height),
    0,
    0,
  );
  const canvas = new OffscreenCanvas(
      rotation % 180 ? image.height : image.width,
      rotation % 180 ? image.width : image.height,
    ),
    target = canvas.getContext("2d");
  if (!target) throw new Error("Não foi possível orientar a imagem da conversão.");
  target.translate(canvas.width / 2, canvas.height / 2);
  target.rotate((rotation * Math.PI) / 180);
  target.drawImage(source, -image.width / 2, -image.height / 2);
  return new Uint8Array(await (await canvas.convertToBlob({ type: "image/png" })).arrayBuffer());
};
let enginePromise: Promise<LocalPdfEngine> | undefined;
function engineForConversion(): Promise<LocalPdfEngine> {
  enginePromise ??= (async () => {
    const response = await fetch(wasmUrl);
    if (!response.ok) throw new Error("Motor PDF local indisponível.");
    return LocalPdfEngine.create(new Uint8Array(await response.arrayBuffer()));
  })();
  return enginePromise;
}

self.onmessage = async (event: MessageEvent<unknown>) => {
  try {
    const request = conversionRequestSchema.parse(event.data);
    if (request.kind === "pptx-to-pdf" || request.kind === "odp-to-pdf") {
      self.postMessage({ progress: "Lendo slides e estilos locais…" });
      const document =
        request.kind === "odp-to-pdf"
          ? importOdp(request.bytes, request.title)
          : await importPptx(request.bytes, request.title, async (bytes, format, crop) =>
              cropPresentationPicture(bytes, format, crop, await engineForConversion(), (pixels) =>
                encodePicture(pixels, 0),
              ),
            );
      const result = await preparePresentation(document, request.fonts);
      self.postMessage({
        ok: true,
        value: conversionResultSchema.parse({
          bytes: result.pdf,
          pdf: result.pdf,
          pages: document.slides.length,
          warnings: result.warnings,
          extension: "pdf",
        }),
      });
      return;
    }
    if (request.kind === "tiff-to-pdf") {
      const result = await tiffToPdf(request.bytes, (page, total) =>
        self.postMessage({ progress: `Convertendo página TIFF ${page} de ${total}…` }),
      );
      self.postMessage({
        ok: true,
        value: conversionResultSchema.parse({ ...result, pdf: result.bytes, extension: "pdf" }),
      });
      return;
    }
    if (
      request.kind === "docx-to-pdf" ||
      request.kind === "xlsx-to-pdf" ||
      request.kind === "rtf-to-pdf" ||
      request.kind === "odt-to-pdf" ||
      request.kind === "ods-to-pdf"
    ) {
      const document =
        request.kind === "docx-to-pdf"
          ? importDocx(request.bytes, request.title)
          : request.kind === "rtf-to-pdf"
            ? importRtf(request.bytes, request.title)
            : request.kind === "odt-to-pdf"
              ? importOdt(request.bytes, request.title)
              : spreadsheetDocument(
                  request.kind === "ods-to-pdf"
                    ? importOds(request.bytes)
                    : importXlsx(request.bytes),
                  request.title,
                );
      self.postMessage({ progress: "Gerando PDF local…" });
      const result = await renderOfficePdf(document, request.fonts);
      self.postMessage({
        ok: true,
        value: conversionResultSchema.parse({ ...result, pdf: result.bytes, extension: "pdf" }),
      });
      return;
    }
    const engine = await engineForConversion();
    if (["pdf-to-xlsx", "pdf-to-ods", "pdf-to-csv", "pdf-to-table-json"].includes(request.kind)) {
      if (!request.table)
        throw new Error("Defina página, área e colunas antes de extrair a tabela.");
      const format =
        request.kind === "pdf-to-xlsx"
          ? "xlsx"
          : request.kind === "pdf-to-ods"
            ? "ods"
            : request.kind === "pdf-to-csv"
              ? "csv"
              : "json";
      const result = await exportPdfTable(
        request.bytes,
        request.title,
        engine,
        request.table,
        format,
        (page, total) => self.postMessage({ progress: `Lendo página ${page} de ${total}…` }),
      );
      self.postMessage({ ok: true, value: conversionResultSchema.parse(result) });
      return;
    }
    if (request.kind === "pdf-to-tiff") {
      const result = await pdfToTiff(request.bytes, engine, request.dpi, (page, total) =>
        self.postMessage({ progress: `Exportando página TIFF ${page} de ${total}…` }),
      );
      self.postMessage({
        ok: true,
        value: conversionResultSchema.parse({ ...result, pdf: request.bytes, extension: "tif" }),
      });
      return;
    }
    if (request.kind === "pdf-to-txt") {
      const result = pdfToPlainText(request.bytes, engine, (page, total) =>
        self.postMessage({ progress: `Lendo página ${page} de ${total}…` }),
      );
      self.postMessage({
        ok: true,
        value: conversionResultSchema.parse({ ...result, pdf: request.bytes, extension: "txt" }),
      });
      return;
    }
    const document = await pdfToOffice(
      request.bytes,
      request.title,
      engine,
      encodePicture,
      (page, total) => self.postMessage({ progress: `Lendo página ${page} de ${total}…` }),
    );
    self.postMessage({ progress: "Preparando arquivo editável e prévia de fluxo…" });
    if (request.kind === "pdf-to-pptx" || request.kind === "pdf-to-odp") {
      const presentation = await preparePresentation(
        await officeFlowPresentation(document, request.fonts),
        request.fonts,
      );
      const output =
        request.kind === "pdf-to-pptx"
          ? await exportPptx(presentation)
          : {
              bytes: exportOdp(presentation, request.fonts, request.fontLicense),
              warnings: presentation.warnings,
            };
      self.postMessage({
        ok: true,
        value: conversionResultSchema.parse({
          bytes: output.bytes,
          pdf: presentation.pdf,
          pages: presentation.document.slides.length,
          warnings: output.warnings,
          extension: request.kind === "pdf-to-pptx" ? "pptx" : "odp",
        }),
      });
      return;
    }
    const preview = await renderOfficePdf(document, request.fonts);
    if (request.kind === "pdf-to-rtf") {
      const output = exportRtf(document);
      self.postMessage({
        ok: true,
        value: conversionResultSchema.parse({
          bytes: output.bytes,
          pdf: preview.bytes,
          pages: preview.pages,
          warnings: [...new Set([...preview.warnings, ...output.warnings])],
          extension: "rtf",
        }),
      });
      return;
    }
    const output =
      request.kind === "pdf-to-odt"
        ? exportOdt(document, request.fonts, request.fontLicense)
        : exportDocx(document, request.fonts, request.fontLicense);
    self.postMessage({
      ok: true,
      value: conversionResultSchema.parse({
        bytes: output,
        pdf: preview.bytes,
        pages: preview.pages,
        warnings: preview.warnings,
        extension: request.kind === "pdf-to-odt" ? "odt" : "docx",
      }),
    });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : "Falha na conversão local.",
    });
  }
};
