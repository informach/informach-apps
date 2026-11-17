import { handleTranscription } from "@/features/ai/transcribe-route";
export const runtime = "nodejs";
export const maxDuration = 60;
export function POST(request: Request) {
  return handleTranscription(request, "subjects");
}
