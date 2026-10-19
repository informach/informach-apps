import {
  embedParagraphFont,
  paragraphRequiredText,
  validateParagraphInk,
} from "@shared/paragraph-font";
import { layoutParagraph } from "@shared/paragraph-layout";
import { paragraphWorkerRequestSchema } from "@shared/paragraph-worker-format";
import { PDFDocument } from "pdf-lib";

self.onmessage = (event: MessageEvent<unknown>) => {
  void (async () => {
    const request = paragraphWorkerRequestSchema.parse(event.data),
      pdf = await PDFDocument.create();
    const font = await embedParagraphFont(
      pdf,
      request.font,
      paragraphRequiredText(request.annotation),
    );
    const layout = layoutParagraph(request.annotation, font);
    validateParagraphInk(request.annotation, layout, request.font);
    self.postMessage({ ok: true, layout });
  })().catch((failure: unknown) =>
    self.postMessage({
      ok: false,
      error: (failure instanceof Error ? failure.message : "Falha na composição de texto.").slice(
        0,
        2000,
      ),
    }),
  );
};
