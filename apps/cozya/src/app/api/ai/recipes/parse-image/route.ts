import { z } from "zod";
import { withAiRouteGuards } from "@/features/ai/_shared";
import { aiErrorResponse } from "@/features/ai/errors";
import { runAiOperation } from "@/features/ai/idempotency";
import { parseRecipeFromImage } from "@/features/ai/parse-recipe-image-service";
import { recipeResponse } from "@/features/ai/recipe-output";
import { logger } from "@/lib/logger";
import { contentLengthExceeds, RequestTooLargeError, readLimitedJson } from "@/lib/request-size";

export const runtime = "nodejs";

// Base64 inflates ~33%; 5 MB raw ≈ 7 MB string + the data URL prefix. We give
// ourselves a small margin (8 MB) so a legitimate 5 MB JPEG doesn't get cut.
const MAX_DATA_URL_CHARS = 8_000_000;
const MAX_IMAGE_REQUEST_BYTES = MAX_DATA_URL_CHARS + 1024;

const requestSchema = z.object({
  imageDataUrl: z
    .string()
    .max(MAX_DATA_URL_CHARS)
    .regex(/^data:image\/(jpeg|png|webp);base64,/, "Formato de imagem não suportado"),
});

export async function POST(request: Request): Promise<Response> {
  const guard = await withAiRouteGuards({ errorScope: "cozya.parse_image" });
  if (!guard.ok) return guard.response;
  const { userId } = guard;

  let imageDataUrl: string;
  try {
    if (contentLengthExceeds(request, MAX_IMAGE_REQUEST_BYTES)) {
      return Response.json({ code: "IMAGE_TOO_LARGE" }, { status: 413 });
    }
    const json = await readLimitedJson(request, MAX_IMAGE_REQUEST_BYTES);
    const parsed = requestSchema.safeParse(json);
    if (!parsed.success) {
      return Response.json({ code: "INVALID_IMAGE" }, { status: 400 });
    }
    imageDataUrl = parsed.data.imageDataUrl;
  } catch (err) {
    if (err instanceof RequestTooLargeError) return aiErrorResponse(err);
    logger.warn(
      { userId, error: err instanceof Error ? err.name : "UnknownError" },
      "cozya.parse_image.parse_failed",
    );
    return Response.json({ code: "INVALID_IMAGE" }, { status: 400 });
  }

  return runAiOperation(request, userId, JSON.stringify({ imageDataUrl }), async () => {
    try {
      const result = await parseRecipeFromImage({ userId, imageDataUrl });
      if (!result.isValidRecipe) {
        return Response.json({
          isValidRecipe: false,
          reason: result.reason ?? "Não consegui identificar uma receita nesta foto.",
        });
      }
      return Response.json(recipeResponse(result, "image"));
    } catch (err) {
      if (err instanceof RequestTooLargeError) return aiErrorResponse(err);
      logger.error(
        { userId, error: err instanceof Error ? err.name : "UnknownError" },
        "cozya.parse_image.failed",
      );
      return aiErrorResponse(err, "PARSE_FAILED");
    }
  });
}
