import { jsonUtf8, withAiRouteGuards } from "@/features/ai/_shared";
import { transcribeActivitiesAudio } from "@/features/ai/transcribe-activities-service";
import { logger } from "@/lib/logger";
import { RequestBodyTooLargeError, readFormDataWithSizeLimit } from "@/lib/request-size";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_AUDIO_REQUEST_BYTES = MAX_AUDIO_BYTES + 1024 * 1024;
const ALLOWED_MIME_PREFIX = "audio/";

/**
 * Transcrição de áudio para o fluxo de "cadastrar atividade por voz".
 * Endpoint dedicado (separado de `/api/ai/transcribe` usado por matérias)
 * porque o glossário do prompt é específico de atividades — provas,
 * trabalhos, dias da semana, etc. Mesmo modelo (`openai/gpt-4o-transcribe`)
 * mas billing key distinta (`agenda.activities.transcribe_audio`) garante
 * que o credit ledger fica granular por feature.
 */
export async function POST(request: Request): Promise<Response> {
  const guard = await withAiRouteGuards({ errorScope: "agenda.activities.transcribe" });
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
      "agenda.activities.transcribe.parse_failed",
    );
    return jsonUtf8({ code: "INVALID_AUDIO" }, { status: 400 });
  }

  try {
    const result = await transcribeActivitiesAudio({ userId, audio: audioBlob });
    return jsonUtf8({ text: result.text });
  } catch (err) {
    logger.error(
      { userId, error: err instanceof Error ? err.message : String(err) },
      "agenda.activities.transcribe.failed",
    );
    return jsonUtf8({ code: "TRANSCRIBE_FAILED" }, { status: 502 });
  }
}
