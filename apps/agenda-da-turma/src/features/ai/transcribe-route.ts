import "server-only";
import { SPEECH_MAX_BYTES } from "@informach/ai-core/speech-audio";
import { z } from "zod";
import { aiCostAcceptanceSchema } from "@/features/notices/schemas";
import { RequestBodyTooLargeError, readFormDataWithSizeLimit } from "@/lib/request-size";
import { aiFailure, jsonUtf8, withAiRouteGuards } from "./_shared";
import { transcribeAgendaAudio } from "./transcribe-service";
export async function handleTranscription(request: Request, kind: "subjects" | "activities") {
  const guard = await withAiRouteGuards({ request, errorScope: `agenda.${kind}.transcribe` });
  if (!guard.ok) return guard.response;
  try {
    const form = await readFormDataWithSizeLimit(request, SPEECH_MAX_BYTES + 16384);
    const audio = form.get("audio");
    const profileId = z.string().uuid().safeParse(form.get("profileId"));
    const acceptedCost = aiCostAcceptanceSchema.safeParse(
      JSON.parse(String(form.get("acceptedCost"))),
    );
    if (
      !(audio instanceof Blob) ||
      audio.size > SPEECH_MAX_BYTES ||
      !profileId.success ||
      !acceptedCost.success
    )
      return jsonUtf8({ code: "INVALID_AUDIO" }, { status: 400 });
    return jsonUtf8(
      await transcribeAgendaAudio(
        { actor: guard.actor, profileId: profileId.data, audio, acceptedCost: acceptedCost.data },
        kind,
      ),
    );
  } catch (error) {
    if (error instanceof SyntaxError) return jsonUtf8({ code: "INVALID_INPUT" }, { status: 400 });
    if (error instanceof RequestBodyTooLargeError)
      return jsonUtf8({ code: "AUDIO_TOO_LARGE" }, { status: 413 });
    return aiFailure(error, "TRANSCRIBE_FAILED");
  }
}
