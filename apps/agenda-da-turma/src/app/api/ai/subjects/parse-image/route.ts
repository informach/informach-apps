import { z } from "zod";
import { jsonUtf8, withAiRouteGuards } from "@/features/ai/_shared";
import { parseSubjectsFromImage } from "@/features/ai/parse-subjects-image-service";
import { logger } from "@/lib/logger";
import { RequestBodyTooLargeError, readJsonWithSizeLimit } from "@/lib/request-size";

export const runtime = "nodejs";

// Base64 inflates ~33%; 5 MB raw ≈ 7 MB string + data URL prefix. Margem
// pequena (8 MB chars) pra uma JPEG legítima de 5 MB caber.
const MAX_DATA_URL_CHARS = 8_000_000;
const MAX_IMAGE_REQUEST_BYTES = MAX_DATA_URL_CHARS + 1024;

const requestSchema = z.object({
  imageDataUrl: z
    .string()
    .max(MAX_DATA_URL_CHARS)
    .regex(/^data:image\/(jpeg|png|webp);base64,/, "Formato de imagem não suportado"),
});

export async function POST(request: Request): Promise<Response> {
  const guard = await withAiRouteGuards({ errorScope: "agenda.parse_image" });
  if (!guard.ok) return guard.response;
  const { userId } = guard;

  let imageDataUrl: string;
  try {
    const json = await readJsonWithSizeLimit(request, MAX_IMAGE_REQUEST_BYTES);
    const parsed = requestSchema.safeParse(json);
    if (!parsed.success) {
      return jsonUtf8({ code: "INVALID_IMAGE" }, { status: 400 });
    }
    imageDataUrl = parsed.data.imageDataUrl;
  } catch (err) {
    if (err instanceof RequestBodyTooLargeError) {
      return jsonUtf8({ code: "IMAGE_TOO_LARGE" }, { status: 413 });
    }
    logger.warn(
      { userId, error: err instanceof Error ? err.message : String(err) },
      "agenda.parse_image.parse_failed",
    );
    return jsonUtf8({ code: "INVALID_IMAGE" }, { status: 400 });
  }

  try {
    const result = await parseSubjectsFromImage({ userId, imageDataUrl });
    if (!result.isValidInput) {
      return jsonUtf8({
        isValidInput: false,
        reason: result.reason ?? "Não consegui identificar matérias nesta imagem.",
      });
    }
    return jsonUtf8({
      isValidInput: true,
      subjects: result.subjects,
    });
  } catch (err) {
    logger.error(
      { userId, error: err instanceof Error ? err.message : String(err) },
      "agenda.parse_image.failed",
    );
    return jsonUtf8({ code: "PARSE_FAILED" }, { status: 502 });
  }
}
