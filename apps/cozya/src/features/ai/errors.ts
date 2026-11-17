import { AiOperationError } from "@informach/ai-core/operations";
import { InvalidVisionImageError } from "@informach/ai-core/vision-image";
import { WebParticipationError } from "@informach/auth/web-participation";
import { InsufficientCreditsError } from "@informach/billing";
import { FamilyError } from "@informach/family";
import { RequestTooLargeError } from "@/lib/request-size";

export class NoRecipeResultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoRecipeResultError";
  }
}

export function aiErrorResponse(error: unknown, fallback = "AI_FAILED"): Response {
  if (error instanceof WebParticipationError)
    return Response.json(
      { code: "OPERATION_EXPIRED" },
      { status: 410, headers: { "Cache-Control": "no-store" } },
    );
  if (error instanceof InvalidVisionImageError)
    return Response.json({ code: "INVALID_IMAGE" }, { status: 400 });
  if (error instanceof FamilyError)
    return Response.json({ code: "FAMILY_ACCESS_DENIED" }, { status: 403 });
  if (error instanceof AiOperationError)
    return Response.json(
      { code: error.code },
      { status: error.code === "AI_RESULT_EXPIRED" ? 410 : 409 },
    );
  if (error instanceof Error && error.message === "AI_PRICE_CHANGED")
    return Response.json({ code: "AI_PRICE_CHANGED" }, { status: 409 });
  if (
    error instanceof Error &&
    ["INVALID_AUDIO", "AUDIO_TOO_LONG", "AI_CONTEXT_TOO_LARGE"].includes(error.message)
  )
    return Response.json({ code: error.message }, { status: 400 });
  if (error instanceof InsufficientCreditsError)
    return Response.json({ code: "INSUFFICIENT_CREDITS" }, { status: 402 });
  if (error instanceof RequestTooLargeError)
    return Response.json({ code: "REQUEST_TOO_LARGE" }, { status: 413 });
  if (error instanceof NoRecipeResultError)
    return Response.json({ isValidRecipe: false, reason: error.message, charged: false });
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError"))
    return Response.json({ code: "AI_TIMEOUT" }, { status: 504 });
  return Response.json({ code: fallback }, { status: 502 });
}
