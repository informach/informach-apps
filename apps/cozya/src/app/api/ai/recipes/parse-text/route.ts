import { z } from "zod";
import { parseRecipeFromText } from "@/features/ai/parse-recipe-text-service";
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

const MAX_TEXT_CHARS = 8000;

const requestSchema = z.object({
  text: z.string().trim().min(1).max(MAX_TEXT_CHARS),
});

export async function POST(request: Request): Promise<Response> {
  if (!env.OPENAI_API_KEY) {
    logger.error({}, "cozya.parse_text.openai_key_missing");
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

  let text: string;
  try {
    const json = (await request.json().catch(() => null)) as unknown;
    const parsed = requestSchema.safeParse(json);
    if (!parsed.success) {
      return Response.json({ code: "INVALID_TEXT" }, { status: 400 });
    }
    text = parsed.data.text;
  } catch (err) {
    logger.warn(
      { userId, error: err instanceof Error ? err.message : String(err) },
      "cozya.parse_text.parse_failed",
    );
    return Response.json({ code: "INVALID_TEXT" }, { status: 400 });
  }

  try {
    const result = await parseRecipeFromText({ userId, text });
    if (!result.isValidRecipe) {
      return Response.json({
        isValidRecipe: false,
        reason: result.reason ?? "O texto não parece descrever uma receita.",
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
      "cozya.parse_text.failed",
    );
    return Response.json({ code: "PARSE_FAILED" }, { status: 502 });
  }
}
