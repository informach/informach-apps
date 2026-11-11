import { AiOperationError } from "@informach/ai-core/operations";
import { NoSubjectsFoundError } from "./subject-result";
import "server-only";
import { InsufficientCreditsError } from "@informach/billing";
import { FamilyError } from "@informach/family";
import { agendaAuthority } from "@/features/family/context";
import { getServerSession } from "@/lib/auth";
import { env } from "@/lib/env";
import {
  AGENDA_RATE_LIMITS,
  aiInvokeKey,
  enforceRateLimit,
  RateLimitedError,
} from "@/lib/rate-limit";
export function jsonUtf8(body: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), { ...init, headers });
}
/** Authentication, verified adult, selected family and CSRF; wallet checks current child grants atomically. */
export async function withAiRouteGuards(opts: { request: Request; errorScope: string }) {
  if (opts.request.headers.get("origin") !== new URL(env.NEXT_PUBLIC_APP_URL).origin)
    return { ok: false as const, response: jsonUtf8({ code: "FORBIDDEN" }, { status: 403 }) };
  if (!env.OPENROUTER_API_KEY)
    return { ok: false as const, response: jsonUtf8({ code: "AI_DISABLED" }, { status: 503 }) };
  const session = await getServerSession();
  if (!session?.user)
    return { ok: false as const, response: jsonUtf8({ code: "UNAUTHORIZED" }, { status: 401 }) };
  if (!session.user.emailVerified)
    return { ok: false as const, response: jsonUtf8({ code: "VERIFY_EMAIL" }, { status: 403 }) };
  try {
    await enforceRateLimit({
      key: aiInvokeKey(session.user.id),
      ...AGENDA_RATE_LIMITS.AI_INVOKE_PER_HOUR,
    });
  } catch (error) {
    if (error instanceof RateLimitedError)
      return {
        ok: false as const,
        response: jsonUtf8(
          { code: "RATE_LIMITED", retryAfter: error.retryAfterSeconds },
          { status: 429, headers: { "Retry-After": String(error.retryAfterSeconds) } },
        ),
      };
    throw error;
  }
  // API responses never redirect a fetch to an HTML family selector.
  try {
    const actor = await agendaAuthority(session.user.id);
    return { ok: true as const, userId: session.user.id, actor };
  } catch {
    return {
      ok: false as const,
      response: jsonUtf8({ code: "FAMILY_CONTEXT_REQUIRED" }, { status: 409 }),
    };
  }
}
export function aiFailure(error: unknown, fallback: string) {
  if (error instanceof AiOperationError) return jsonUtf8({ code: error.code }, { status: 409 });
  if (error instanceof NoSubjectsFoundError)
    return jsonUtf8({ isValidInput: false, reason: error.reason });
  if (error instanceof InsufficientCreditsError)
    return jsonUtf8({ code: "INSUFFICIENT_CREDITS" }, { status: 402 });
  if (error instanceof FamilyError) return jsonUtf8({ code: "FORBIDDEN" }, { status: 403 });
  if (error instanceof Error && error.message === "AI_PRICE_CHANGED")
    return jsonUtf8({ code: "AI_PRICE_CHANGED" }, { status: 409 });
  if (
    error instanceof Error &&
    [
      "INVALID_AUDIO",
      "AUDIO_TOO_LONG",
      "INVALID_IMAGE",
      "INVALID_ATTACHMENT",
      "INVALID_TRANSCRIPT",
    ].includes(error.message)
  )
    return jsonUtf8({ code: error.message }, { status: 400 });
  return jsonUtf8({ code: fallback }, { status: 502 });
}
