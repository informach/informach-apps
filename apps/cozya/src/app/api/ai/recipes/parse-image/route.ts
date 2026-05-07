import { z } from "zod";
import { parseRecipeFromImage } from "@/features/ai/parse-recipe-image-service";
import { billing } from "@/features/billing/service";
import { getServerSession } from "@/lib/auth";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  aiInvokeKey,
  COZYA_RATE_LIMITS,
  enforceRateLimit,
  RateLimitedError,
} from "@/lib/rate-limit";

export const runtime = "nodejs";

// Base64 inflates ~33%; 5 MB raw ≈ 7 MB string + the data URL prefix. We give
// ourselves a small margin (8 MB) so a legitimate 5 MB JPEG doesn't get cut.
const MAX_DATA_URL_CHARS = 8_000_000;

const requestSchema = z.object({
  imageDataUrl: z
    .string()
    .max(MAX_DATA_URL_CHARS)
    .regex(/^data:image\/(jpeg|png|webp);base64,/, "Formato de imagem não suportado"),
});

export async function POST(request: Request): Promise<Response> {
  if (!env.OPENAI_API_KEY) {
    logger.error({}, "cozya.parse_image.openai_key_missing");
    return Response.json({ code: "AI_DISABLED" }, { status: 503 });
  }

  const session = await getServerSession();
  if (!session?.user) {
    return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
  }
  const userId = session.user.id;
  const subject = { type: "user" as const, id: userId };

  try {
    await enforceRateLimit({
      key: aiInvokeKey(userId),
      ...COZYA_RATE_LIMITS.AI_INVOKE_PER_HOUR,
    });
  } catch (err) {
    if (err instanceof RateLimitedError) {
      return Response.json(
        { code: "RATE_LIMITED", retryAfter: err.retryAfterSeconds },
        { status: 429, headers: { "Retry-After": String(err.retryAfterSeconds) } },
      );
    }
    throw err;
  }

  const isPro = await billing.hasProSubscription(subject);
  if (!isPro) {
    return Response.json({ code: "SUBSCRIPTION_REQUIRED" }, { status: 403 });
  }

  let imageDataUrl: string;
  try {
    const json = (await request.json().catch(() => null)) as unknown;
    const parsed = requestSchema.safeParse(json);
    if (!parsed.success) {
      return Response.json({ code: "INVALID_IMAGE" }, { status: 400 });
    }
    imageDataUrl = parsed.data.imageDataUrl;
  } catch (err) {
    logger.warn(
      { userId, error: err instanceof Error ? err.message : String(err) },
      "cozya.parse_image.parse_failed",
    );
    return Response.json({ code: "INVALID_IMAGE" }, { status: 400 });
  }

  try {
    const result = await parseRecipeFromImage({ userId, imageDataUrl });
    if (!result.isValidRecipe) {
      return Response.json({
        isValidRecipe: false,
        reason: result.reason ?? "Não consegui identificar uma receita nesta foto.",
      });
    }
    return Response.json({
      isValidRecipe: true,
      recipe: {
        name: result.name ?? "",
        ingredients: result.ingredients ?? "",
        preparation: result.preparation ?? "",
        finishing: result.finishing ?? "",
      },
    });
  } catch (err) {
    logger.error(
      { userId, error: err instanceof Error ? err.message : String(err) },
      "cozya.parse_image.failed",
    );
    return Response.json({ code: "PARSE_FAILED" }, { status: 502 });
  }
}
