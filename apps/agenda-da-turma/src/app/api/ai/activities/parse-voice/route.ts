import { z } from "zod";
import { jsonUtf8, withAiRouteGuards } from "@/features/ai/_shared";
import { parseActivitiesFromVoice } from "@/features/ai/parse-activities-voice-service";
import { logger } from "@/lib/logger";
import { RequestBodyTooLargeError, readJsonWithSizeLimit } from "@/lib/request-size";

export const runtime = "nodejs";

const MAX_TRANSCRIPT_CHARS = 5000;
const MAX_TRANSCRIPT_REQUEST_BYTES = 32 * 1024;

const requestSchema = z.object({
  transcript: z.string().trim().min(1, "Transcript vazio").max(MAX_TRANSCRIPT_CHARS),
});

export async function POST(request: Request): Promise<Response> {
  const guard = await withAiRouteGuards({ errorScope: "agenda.activities.parse_voice" });
  if (!guard.ok) return guard.response;
  const { userId } = guard;

  let transcript: string;
  try {
    const json = await readJsonWithSizeLimit(request, MAX_TRANSCRIPT_REQUEST_BYTES);
    const parsed = requestSchema.safeParse(json);
    if (!parsed.success) {
      return jsonUtf8({ code: "INVALID_TRANSCRIPT" }, { status: 400 });
    }
    transcript = parsed.data.transcript;
  } catch (err) {
    if (err instanceof RequestBodyTooLargeError) {
      return jsonUtf8({ code: "INVALID_TRANSCRIPT" }, { status: 413 });
    }
    logger.warn(
      { userId, error: err instanceof Error ? err.message : String(err) },
      "agenda.activities.parse_voice.parse_failed",
    );
    return jsonUtf8({ code: "INVALID_TRANSCRIPT" }, { status: 400 });
  }

  try {
    const result = await parseActivitiesFromVoice({ userId, transcript });
    if (!result.isValidInput) {
      return jsonUtf8({
        isValidInput: false,
        reason: result.reason ?? "Não identifiquei atividades na sua fala.",
      });
    }
    return jsonUtf8({
      isValidInput: true,
      activities: result.activities,
      guessedTurmaId: result.guessedTurmaId,
    });
  } catch (err) {
    logger.error(
      { userId, error: err instanceof Error ? err.message : String(err) },
      "agenda.activities.parse_voice.failed",
    );
    return jsonUtf8({ code: "PARSE_FAILED" }, { status: 502 });
  }
}
