import { withAiRouteGuards } from "@/features/ai/_shared";
import { aiErrorResponse } from "@/features/ai/errors";
import { runAiOperation } from "@/features/ai/idempotency";
import { transcribeRecipeAudio } from "@/features/ai/transcribe-service";
import { logger } from "@/lib/logger";
import {
  contentLengthExceeds,
  RequestTooLargeError,
  readLimitedFormData,
} from "@/lib/request-size";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_AUDIO_REQUEST_BYTES = MAX_AUDIO_BYTES + 1024 * 1024;
const ALLOWED_MIME_PREFIX = "audio/";

export async function POST(request: Request): Promise<Response> {
  const guard = await withAiRouteGuards({ errorScope: "cozya.transcribe" });
  if (!guard.ok) return guard.response;
  const { userId } = guard;

  let audioBlob: Blob;
  try {
    if (contentLengthExceeds(request, MAX_AUDIO_REQUEST_BYTES)) {
      return Response.json({ code: "AUDIO_TOO_LARGE" }, { status: 413 });
    }
    const form = await readLimitedFormData(request, MAX_AUDIO_REQUEST_BYTES);
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
    if (err instanceof RequestTooLargeError) return aiErrorResponse(err);
    logger.warn(
      { userId, error: err instanceof Error ? err.name : "UnknownError" },
      "cozya.transcribe.parse_failed",
    );
    return Response.json({ code: "INVALID_AUDIO" }, { status: 400 });
  }

  return runAiOperation(request, userId, audioBlob, async () => {
    try {
      const result = await transcribeRecipeAudio({ userId, audio: audioBlob });
      return Response.json({ text: result.text });
    } catch (err) {
      if (err instanceof RequestTooLargeError) return aiErrorResponse(err);
      logger.error(
        { userId, error: err instanceof Error ? err.name : "UnknownError" },
        "cozya.transcribe.failed",
      );
      return aiErrorResponse(err, "TRANSCRIBE_FAILED");
    }
  });
}
