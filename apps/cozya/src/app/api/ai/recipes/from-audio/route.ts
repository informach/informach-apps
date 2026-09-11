import { withAiRouteGuards } from "@/features/ai/_shared";
import { recipeFromAudio } from "@/features/ai/audio-recipe-service";
import { aiErrorResponse } from "@/features/ai/errors";
import { runAiOperation } from "@/features/ai/idempotency";
import { recipeResponse } from "@/features/ai/recipe-output";
import { RequestTooLargeError, readLimitedFormData } from "@/lib/request-size";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const guard = await withAiRouteGuards({ errorScope: "cozya.from_audio" });
  if (!guard.ok) return guard.response;
  let form: FormData;
  try {
    form = await readLimitedFormData(request, 11 * 1024 * 1024);
  } catch (error) {
    return error instanceof RequestTooLargeError
      ? aiErrorResponse(error)
      : Response.json({ code: "INVALID_AUDIO" }, { status: 400 });
  }
  const audio = form.get("audio");
  const mode = form.get("mode") ?? "recipe";
  if (
    !(audio instanceof Blob) ||
    audio.size === 0 ||
    !audio.type.startsWith("audio/") ||
    (mode !== "recipe" && mode !== "research")
  )
    return Response.json({ code: "INVALID_AUDIO" }, { status: 400 });
  if (audio.size > 10 * 1024 * 1024)
    return Response.json({ code: "AUDIO_TOO_LARGE" }, { status: 413 });
  return runAiOperation(request, guard.userId, new Blob([mode, audio]), async () =>
    Response.json(
      recipeResponse(
        await recipeFromAudio({ userId: guard.userId, audio, mode }),
        mode === "recipe" ? "voice" : "prompt",
      ),
    ),
  );
}
