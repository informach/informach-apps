// Wrap fino sobre `experimental_transcribe` do AI SDK + provider OpenAI.
// Frame-agnostic, sem `import "server-only"` para permitir teste com vitest;
// na prática só roda em route handlers Node (ver `runtime: "nodejs"` nos apps).

import { experimental_transcribe } from "ai";
import { createOpenAI } from "./providers";

export type TranscribeAudioModel = "whisper-1";

export type TranscribeAudioInput = {
  /** OpenAI API key — injetado pelo app via `lib/env.ts`, nunca lido de process.env aqui. */
  openaiApiKey: string;
  /**
   * Áudio em qualquer formato suportado pelo Whisper (webm/ogg/mp4/mp3/wav).
   * Blob é normalizado para `Uint8Array` antes de descer para o AI SDK.
   */
  audio: Uint8Array | ArrayBuffer | Blob;
  /** Hint de idioma ISO-639-1 (ex.: "pt"). Melhora precisão e latência. */
  language?: string;
  /** Modelo de transcrição. Default `whisper-1`. */
  model?: TranscribeAudioModel;
};

export type TranscribeAudioResult = {
  /** Texto transcrito. */
  text: string;
  /** Duração detectada em segundos, quando o provider devolver. */
  durationInSeconds?: number;
  /** Idioma detectado pelo provider (ISO-639-1), quando disponível. */
  language?: string;
};

/**
 * Transcreve um áudio em texto via OpenAI Whisper. Função pura — não toca
 * billing, auth ou rate-limit. O caller (route handler do app) faz o gating
 * Pro/rate-limit e envolve a chamada em `withCredits`.
 */
export async function transcribeAudio(input: TranscribeAudioInput): Promise<TranscribeAudioResult> {
  const openai = createOpenAI({ apiKey: input.openaiApiKey });
  const audio = await normalizeAudio(input.audio);
  const result = await experimental_transcribe({
    model: openai.transcription(input.model ?? "whisper-1"),
    audio,
    ...(input.language ? { providerOptions: { openai: { language: input.language } } } : {}),
  });
  return {
    text: result.text,
    durationInSeconds: result.durationInSeconds,
    language: result.language,
  };
}

async function normalizeAudio(
  input: Uint8Array | ArrayBuffer | Blob,
): Promise<Uint8Array | ArrayBuffer> {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return input;
  return new Uint8Array(await input.arrayBuffer());
}
