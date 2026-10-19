import { buildPdf } from "@shared/build";
import {
  documentBuildRequestSchema,
  documentBuildResponseSchema,
} from "@shared/document-build-format";

self.onmessage = async (event: MessageEvent<unknown>) => {
  try {
    const input = documentBuildRequestSchema.parse(event.data),
      bytes = await buildPdf(input);
    if (!(bytes.buffer instanceof ArrayBuffer))
      throw new Error("Buffer de saída PDF não transferível.");
    self.postMessage(documentBuildResponseSchema.parse({ ok: true, bytes }), {
      transfer: [bytes.buffer],
    });
  } catch (failure) {
    self.postMessage({
      ok: false,
      error: failure instanceof Error ? failure.message : "Falha ao compor o PDF local.",
    });
  }
};
