// Wrap fino sobre o endpoint `/audio/transcriptions` do OpenRouter (Whisper).
//
// OpenRouter exige `Content-Type: application/json` com o áudio em base64
// dentro de `input_audio: { data, format }`. NÃO aceita multipart/form-data
// (formato canônico OpenAI) — confirmado lendo o SDK oficial
// (`@openrouter/sdk` `src/funcs/sttCreateTranscription.ts` + `STTRequest`).
// Tentar multipart gera "No number after minus sign in JSON at position 1"
// porque o backend tenta parsear o `--boundary...` como JSON.
//
// Frame-agnostic, sem `import "server-only"` para permitir teste com vitest;
// na prática só roda em route handlers Node (`runtime: "nodejs"`).

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_MODEL = "openai/whisper-1";

export type TranscribeAudioInput = {
  /** OpenRouter API key — injetado pelo app via `lib/env.ts`, nunca lido de `process.env` aqui. */
  apiKey: string;
  /** BaseURL do gateway. Default `https://openrouter.ai/api/v1`. */
  baseURL?: string;
  /**
   * Áudio em qualquer formato suportado pelo Whisper (webm/ogg/mp4/mp3/wav).
   * Blob preserva o `type` (ex.: `audio/webm`) para inferir `format`;
   * `Uint8Array`/`ArrayBuffer` exigem `format` explícito.
   */
  audio: Uint8Array | ArrayBuffer | Blob;
  /** Hint de idioma ISO-639-1 (ex.: "pt"). Melhora precisão e latência. */
  language?: string;
  /** Modelo de transcrição. Default `openai/whisper-1`. */
  model?: string;
  /** Headers opcionais, como `HTTP-Referer` e `X-OpenRouter-Title` para atribuição. */
  headers?: Record<string, string>;
  /**
   * Container do áudio (ex.: `webm`, `mp3`, `wav`). Para Blob, é inferido de
   * `audio.type` se omitido (com fallback para `webm`).
   */
  format?: string;
  /**
   * Texto opcional que guia a transcrição (~244 tokens). Em Whisper-1 e
   * Whisper-large-v3 é interpretado como lista de keywords/contexto que
   * "pré-aquece" o decoder — útil para vocabulário específico (ingredientes
   * culinários, nomes próprios, jargão técnico).
   *
   * Não está documentado na request schema do OpenRouter mas é repassado
   * para o upstream OpenAI-compatible. Se o gateway ignorar, é no-op.
   */
  prompt?: string;
};

export type TranscribeAudioResult = {
  /** Texto transcrito. */
  text: string;
  /** Duração reportada pelo OpenRouter em `usage.seconds`, quando disponível. */
  durationInSeconds?: number;
};

/**
 * Transcreve um áudio em texto via OpenRouter. Função pura — não toca
 * billing, auth ou rate-limit. O caller (route handler do app) faz o gating
 * Pro/rate-limit e envolve a chamada em `withCredits`.
 */
export async function transcribeAudio(input: TranscribeAudioInput): Promise<TranscribeAudioResult> {
  const baseURL = stripTrailingSlash(input.baseURL ?? DEFAULT_BASE_URL);
  const bytes = await toUint8Array(input.audio);
  const data = bytesToBase64(bytes);
  const format = input.format ?? inferFormatFromBlob(input.audio) ?? "webm";

  const response = await fetch(`${baseURL}/audio/transcriptions`, {
    method: "POST",
    headers: {
      ...(input.headers ?? {}),
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      input_audio: { data, format },
      model: input.model ?? DEFAULT_MODEL,
      ...(input.language ? { language: input.language } : {}),
      ...(input.prompt ? { prompt: input.prompt } : {}),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(
      `OpenRouter transcription failed (${response.status}): ${errorBody.slice(0, 500)}`,
    );
  }

  const json = (await response.json()) as { text?: unknown; usage?: unknown };
  if (typeof json.text !== "string") {
    throw new Error("OpenRouter transcription response missing 'text' field");
  }
  const durationInSeconds = durationFromUsage(json.usage);
  return durationInSeconds === undefined
    ? { text: json.text }
    : { text: json.text, durationInSeconds };
}

/**
 * Tenta extrair o container (webm/mp3/etc) do MIME type do Blob.
 * `audio/webm;codecs=opus` → `webm`. Retorna undefined para tipos vazios.
 */
function inferFormatFromBlob(audio: Uint8Array | ArrayBuffer | Blob): string | undefined {
  if (!(audio instanceof Blob)) return undefined;
  if (!audio.type) return undefined;
  const mime = audio.type.split(";")[0]?.trim();
  if (!mime) return undefined;
  const ext = mime.split("/")[1]?.trim();
  return ext || undefined;
}

async function toUint8Array(audio: Uint8Array | ArrayBuffer | Blob): Promise<Uint8Array> {
  if (audio instanceof Uint8Array) return audio;
  if (audio instanceof ArrayBuffer) return new Uint8Array(audio);
  return new Uint8Array(await audio.arrayBuffer());
}

function bytesToBase64(bytes: Uint8Array): string {
  // Node ≥18 — route handlers do cozya rodam com `runtime: "nodejs"`.
  return Buffer.from(bytes).toString("base64");
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function durationFromUsage(usage: unknown): number | undefined {
  if (!usage || typeof usage !== "object") return undefined;
  const seconds = (usage as { seconds?: unknown }).seconds;
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0
    ? seconds
    : undefined;
}
