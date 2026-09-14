import { InsufficientCreditsError } from "@informach/billing";
import { z } from "zod";
import { jsonUtf8, withAiRouteGuards } from "@/features/ai/_shared";
import { transcribeActivitiesAudio } from "@/features/ai/transcribe-activities-service";
import { findAccessibleProfile } from "@/features/family/access";
import { logger } from "@/lib/logger";
import { RequestBodyTooLargeError, readFormDataWithSizeLimit } from "@/lib/request-size";

export const runtime = "nodejs";
// OpenRouter audio transcription pode levar 10–30s. Sem maxDuration explícito,
// o Railway/Vercel mata em 10s (default antigo) e o usuário recebe 504 mudo.
export const maxDuration = 60;

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
  // `perfil` chega junto do áudio para que o titular da franquia seja a conta
  // da criança, e não quem está operando — um segundo adulto convidado usa o
  // plano da família. Sem o campo, o titular é o próprio usuário.
  const requestProfileId = new URL(request.url).searchParams.get("perfil");
  const guard = await withAiRouteGuards({
    errorScope: "agenda.activities.transcribe",
    freeTrial: "voice",
    ownerId: async (userId) => {
      if (!requestProfileId || !z.string().uuid().safeParse(requestProfileId).success)
        return userId;
      const profile = await findAccessibleProfile(userId, requestProfileId);
      return profile?.userId ?? userId;
    },
  });
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
    // Cobra da conta titular (`guard.subject`), que é onde a franquia de teste
    // foi concedida; `userId` segue sendo quem operou, para os logs.
    const result = await transcribeActivitiesAudio({
      userId: guard.subject.id,
      audio: audioBlob,
    });
    return jsonUtf8({ text: result.text });
  } catch (err) {
    // Saldo insuficiente não é falha de transcrição: "tente de novo" nunca
    // funcionaria. Acontece quando a franquia de teste foi gasta em regravações
    // antes de chegar ao teto de importações.
    if (err instanceof InsufficientCreditsError) {
      logger.info({ userId }, "agenda.activities.transcribe.insufficient_credits");
      return jsonUtf8({ code: "INSUFFICIENT_CREDITS" }, { status: 402 });
    }
    logger.error(
      { userId, error: err instanceof Error ? err.message : String(err) },
      "agenda.activities.transcribe.failed",
    );
    return jsonUtf8({ code: "TRANSCRIBE_FAILED" }, { status: 502 });
  }
}
