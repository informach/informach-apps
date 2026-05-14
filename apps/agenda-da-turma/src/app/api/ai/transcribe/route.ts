import { jsonUtf8, withAiRouteGuards } from "@/features/ai/_shared";
import { transcribeSubjectsAudio } from "@/features/ai/transcribe-subjects-service";
import { logger } from "@/lib/logger";
import { RequestBodyTooLargeError, readFormDataWithSizeLimit } from "@/lib/request-size";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_AUDIO_REQUEST_BYTES = MAX_AUDIO_BYTES + 1024 * 1024;
const ALLOWED_MIME_PREFIX = "audio/";

/**
 * Endpoint genérico de transcrição (OpenRouter `/audio/transcriptions`
 * via wrapper `transcribeAudio`). Hoje só consumido pelo fluxo de "cadastrar
 * matérias por voz" — quando outra feature de voz aparecer, este endpoint
 * pode servir tudo (rate-limit + Pro gate compartilhados via `withAiRouteGuards`).
 */
export async function POST(request: Request): Promise<Response> {
  const guard = await withAiRouteGuards({ errorScope: "agenda.transcribe" });
  if (!guard.ok) return guard.response;
  const { userId } = guard;

  let audioBlob: Blob;
  try {
    const form = await readFormDataWithSizeLimit(request, MAX_AUDIO_REQUEST_BYTES);
    const audio = form.get("audio");
    if (!(audio instanceof Blob)) {
      return jsonUtf8({ code: "INVALID_AUDIO" }, { status: 400 });
    }
    if (audio.size === 0) {
      return jsonUtf8({ code: "EMPTY_AUDIO" }, { status: 400 });
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      return jsonUtf8({ code: "AUDIO_TOO_LARGE" }, { status: 413 });
    }
    if (audio.type && !audio.type.startsWith(ALLOWED_MIME_PREFIX)) {
      return jsonUtf8({ code: "UNSUPPORTED_AUDIO_TYPE" }, { status: 415 });
    }
    audioBlob = audio;
  } catch (err) {
    if (err instanceof RequestBodyTooLargeError) {
      return jsonUtf8({ code: "AUDIO_TOO_LARGE" }, { status: 413 });
    }
    logger.warn(
      { userId, error: err instanceof Error ? err.message : String(err) },
      "agenda.transcribe.parse_failed",
    );
    return jsonUtf8({ code: "INVALID_AUDIO" }, { status: 400 });
  }

  try {
    const result = await transcribeSubjectsAudio({ userId, audio: audioBlob });
    return jsonUtf8({ text: result.text });
  } catch (err) {
    logger.error(
      { userId, error: err instanceof Error ? err.message : String(err) },
      "agenda.transcribe.failed",
    );
    return jsonUtf8({ code: "TRANSCRIBE_FAILED" }, { status: 502 });
  }
}
