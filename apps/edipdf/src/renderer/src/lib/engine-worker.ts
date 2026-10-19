import wasmUrl from "@embedpdf/pdfium/pdfium.wasm?url";
import {
  type ImagePixels,
  PdfEngineError,
  type PdfInspection,
  type TextDocument,
} from "@shared/engine-contracts";
import { engineRequestSchema } from "@shared/engine-protocol";
import {
  listFormOccurrences,
  mergeEditedFormContent,
  prepareFormContent,
  transformFormContent,
} from "@shared/form-content";
import type { FormContentInspection } from "@shared/form-content-format";
import { cropPdfImage } from "@shared/image-crop";
import { LocalPdfEngine } from "@shared/local-engine";
import { addOcrLayer } from "@shared/ocr";
import { clearOcrBookkeeping } from "@shared/ocr-bookkeeping";
import { REDACTION_SANITIZE, sanitizePdf } from "@shared/pdf-sanitize";

self.onmessage = async (event: MessageEvent<unknown>) => {
  try {
    const request = engineRequestSchema.parse(event.data);
    if (request.kind === "ocr") {
      self.postMessage({
        ok: true,
        value: await addOcrLayer(request.bytes, request.pages, request.font),
      });
      return;
    }
    const response = await fetch(wasmUrl);
    if (!response.ok) throw new Error("O motor PDF local está indisponível.");
    const engine = await LocalPdfEngine.create(new Uint8Array(await response.arrayBuffer()));
    let value: Uint8Array | PdfInspection | ImagePixels | TextDocument | FormContentInspection;
    switch (request.kind) {
      case "cropImage": {
        const input = await clearOcrBookkeeping(request.bytes, [request.page]);
        if (request.occurrence === undefined) {
          value = await cropPdfImage(engine, input, request.page, request.object, request.crop);
        } else {
          const prepared = await prepareFormContent(input, request.page, request.occurrence),
            cropped = await cropPdfImage(engine, prepared.bytes, 0, request.object, request.crop);
          value = await mergeEditedFormContent(input, request.page, request.occurrence, cropped);
        }
        break;
      }
      case "inspectForm": {
        const occurrences = await listFormOccurrences(request.bytes, request.page),
          source = engine.inspect(request.bytes),
          roots = source.pages[request.page]?.objects;
        if (
          !roots ||
          roots.length !== occurrences.length ||
          roots.some(
            (root, index) =>
              root.type !== 5 ||
              root.matrix.some(
                (value, at) => Math.abs(value - (occurrences[index]?.matrix[at] ?? NaN)) > 0.001,
              ),
          )
        )
          throw new Error("As ocorrências deste grupo não puderam ser associadas com segurança.");
        const prepared = await prepareFormContent(request.bytes, request.page, request.occurrence);
        value = {
          bytes: prepared.bytes,
          inspection: engine.inspect(prepared.bytes),
          sourceSignatures: source.signatures,
        };
        break;
      }
      case "transformForm":
        value = await transformFormContent(
          engine,
          await clearOcrBookkeeping(request.bytes, [request.page]),
          request.page,
          request.occurrence,
          request.operation,
        );
        break;
      case "inspect":
        value = engine.inspect(request.bytes);
        break;
      case "text":
        value = engine.textDocument(request.bytes, request, (page, total) =>
          self.postMessage({ progress: { page, total } }),
        );
        break;
      case "extractImage": {
        const prepared =
          request.occurrence === undefined
            ? null
            : await prepareFormContent(request.bytes, request.page, request.occurrence);
        value = engine.imagePixels(
          prepared?.bytes ?? request.bytes,
          prepared ? 0 : request.page,
          request.object,
          request.rendered,
        );
        break;
      }
      case "decrypt":
        value = engine.decrypt(request.bytes, request.password);
        break;
      case "encrypt":
        value = engine.encrypt(request.bytes, request.security);
        break;
      case "sanitize": {
        const bytes = await sanitizePdf(request.bytes, request.options);
        value = await sanitizePdf(
          engine.transform(bytes, [], request.options.hiddenData),
          request.options,
        );
        break;
      }
      case "transform": {
        const redact = request.operations.some((op) => op.kind === "redact");
        const bytes = redact
          ? await sanitizePdf(request.bytes, REDACTION_SANITIZE)
          : await clearOcrBookkeeping(
              request.bytes,
              request.operations.map((operation) => operation.page),
            );
        const transformed = engine.transform(bytes, request.operations);
        value = redact ? await sanitizePdf(transformed, REDACTION_SANITIZE) : transformed;
        break;
      }
    }
    self.postMessage({ ok: true, value });
  } catch (error) {
    self.postMessage({
      ok: false,
      code: error instanceof PdfEngineError ? error.code : "operation",
      error: error instanceof Error ? error.message : "Falha no motor PDF local.",
    });
  }
};
