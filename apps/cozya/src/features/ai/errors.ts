import { InsufficientCreditsError } from "@informach/billing";
import { RequestTooLargeError } from "@/lib/request-size";

export class NoRecipeResultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NoRecipeResultError";
  }
}

export function aiErrorResponse(error: unknown, fallback = "AI_FAILED"): Response {
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
