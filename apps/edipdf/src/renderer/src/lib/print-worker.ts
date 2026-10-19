import { printSettingsSchema } from "@shared/print-format";
import { imposePrintPdf } from "@shared/print-layout";
import { z } from "zod";

const requestSchema = z.strictObject({
  bytes: z
    .instanceof(Uint8Array)
    .refine((bytes) => bytes.length > 0 && bytes.length <= 64 * 1024 * 1024),
  settings: printSettingsSchema,
});
self.onmessage = async (event: MessageEvent<unknown>) => {
  try {
    const request = requestSchema.parse(event.data);
    self.postMessage({ ok: true, result: await imposePrintPdf(request.bytes, request.settings) });
  } catch (failure) {
    self.postMessage({
      ok: false,
      error: failure instanceof Error ? failure.message : "Falha ao compor impressão.",
    });
  }
};
