import { z } from "zod";
import { aiFailure, jsonUtf8, withAiRouteGuards } from "@/features/ai/_shared";
import { parseSubjectsFromVoice } from "@/features/ai/parse-subjects-voice-service";
import { aiCostAcceptanceSchema } from "@/features/notices/schemas";
import { logger } from "@/lib/logger";
import { RequestBodyTooLargeError, readJsonWithSizeLimit } from "@/lib/request-size";

export const runtime = "nodejs";
// gpt-4o-mini text parse leva 3–15s. Conservador a 60s pra ser consistente.
export const maxDuration = 60;

const MAX_TRANSCRIPT_CHARS = 5000;
const MAX_TRANSCRIPT_REQUEST_BYTES = 32 * 1024;

const requestSchema = z.object({
  profileId: z.string().uuid(),
  acceptedCost: aiCostAcceptanceSchema,
  transcript: z.string().trim().min(1, "Transcript vazio").max(MAX_TRANSCRIPT_CHARS),
});

export async function POST(request: Request): Promise<Response> {
  const guard = await withAiRouteGuards({ request, errorScope: "agenda.parse_voice" });
  if (!guard.ok) return guard.response;
  const { userId } = guard;

  let input: z.infer<typeof requestSchema>;
  try {
    const json = await readJsonWithSizeLimit(request, MAX_TRANSCRIPT_REQUEST_BYTES);
    const parsed = requestSchema.safeParse(json);
    if (!parsed.success) {
      return jsonUtf8({ code: "INVALID_TRANSCRIPT" }, { status: 400 });
    }
    input = parsed.data;
  } catch (err) {
    if (err instanceof RequestBodyTooLargeError) {
      return jsonUtf8({ code: "INVALID_TRANSCRIPT" }, { status: 413 });
    }
    logger.warn({ userId, error: "AI_REQUEST_FAILED" }, "agenda.parse_voice.parse_failed");
    return jsonUtf8({ code: "INVALID_TRANSCRIPT" }, { status: 400 });
  }

  try {
    const result = await parseSubjectsFromVoice({ actor: guard.actor, ...input });
    if (!result.isValidInput) {
      return jsonUtf8({
        isValidInput: false,
        reason: result.reason ?? "Não identifiquei matérias na sua fala.",
      });
    }
    return jsonUtf8({
      isValidInput: true,
      subjects: result.subjects,
    });
  } catch (err) {
    logger.error({ userId, error: "AI_REQUEST_FAILED" }, "agenda.parse_voice.failed");
    return aiFailure(err, "PARSE_FAILED");
  }
}
