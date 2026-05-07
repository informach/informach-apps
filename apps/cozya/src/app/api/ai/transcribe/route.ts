import { transcribeRecipeAudio } from "@/features/ai/transcribe-service";
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

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_PREFIX = "audio/";

export async function POST(request: Request): Promise<Response> {
  if (!env.OPENAI_API_KEY) {
    logger.error({}, "cozya.transcribe.openai_key_missing");
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

  let audioBlob: Blob;
  try {
    const form = await request.formData();
    const audio = form.get("audio");
    if (!(audio instanceof Blob)) {
      return Response.json({ code: "INVALID_AUDIO" }, { status: 400 });
    }
    if (audio.size === 0) {
      return Response.json({ code: "EMPTY_AUDIO" }, { status: 400 });
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      return Response.json({ code: "AUDIO_TOO_LARGE" }, { status: 413 });
    }
    if (audio.type && !audio.type.startsWith(ALLOWED_MIME_PREFIX)) {
      return Response.json({ code: "UNSUPPORTED_AUDIO_TYPE" }, { status: 415 });
    }
    audioBlob = audio;
  } catch (err) {
    logger.warn(
      { userId, error: err instanceof Error ? err.message : String(err) },
      "cozya.transcribe.parse_failed",
    );
    return Response.json({ code: "INVALID_AUDIO" }, { status: 400 });
  }

  try {
    const result = await transcribeRecipeAudio({ userId, audio: audioBlob });
    return Response.json({ text: result.text });
  } catch (err) {
    logger.error(
      { userId, error: err instanceof Error ? err.message : String(err) },
      "cozya.transcribe.failed",
    );
    return Response.json({ code: "TRANSCRIBE_FAILED" }, { status: 502 });
  }
}
