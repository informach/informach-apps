import { compressPdf, compressToTarget } from "@shared/compress";
import { z } from "zod";
import { canvasReencode } from "./image-reencode";

const requestSchema = z.strictObject({
  bytes: z
    .instanceof(Uint8Array)
    .refine((bytes) => bytes.length > 0 && bytes.length <= 512 * 1024 * 1024),
  level: z.enum(["light", "balanced", "strong"]),
  target: z
    .number()
    .int()
    .min(1024)
    .max(512 * 1024 * 1024)
    .optional(),
});
self.onmessage = async (event: MessageEvent<unknown>) => {
  try {
    const { bytes, level, target } = requestSchema.parse(event.data);
    const result =
      target === undefined
        ? await compressPdf(bytes, level, canvasReencode, (done, images) =>
            self.postMessage({ progress: { attempt: 1, total: 1, done, images } }),
          )
        : await compressToTarget(
            bytes,
            target,
            level,
            canvasReencode,
            (attempt, total, done, images) =>
              self.postMessage({ progress: { attempt, total, done, images } }),
          );
    self.postMessage({
      ok: true,
      bytes: result.bytes.length < bytes.length ? result.bytes : bytes,
      targetMet: target === undefined || result.bytes.length <= target,
      warnings: result.warnings,
      pages: result.pages,
    });
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : "Falha na compactação local.",
    });
  }
};
