// Wrap fino sobre o endpoint `/audio/transcriptions` do OpenRouter.
// Cobre qualquer modelo STT OpenAI-style exposto pelo gateway:
// `openai/whisper-1`, `openai/whisper-large-v3`, `openai/gpt-4o-transcribe`,
// `openai/gpt-4o-mini-transcribe`, e variantes de outros providers
// (`groq/whisper-large-v3-turbo` etc).
//
// OpenRouter exige `Content-Type: application/json` com o áudio em base64
// dentro de `input_audio: { data, format }`. NÃO aceita multipart/form-data
// (formato canônico OpenAI) — confirmado lendo o SDK oficial
// (`@openrouter/sdk` `src/funcs/sttCreateTranscription.ts` + `STTRequest`).
// Tentar multipart gera "No number after minus sign in JSON at position 1"
// porque o backend tenta parsear o `--boundary...` como JSON.
//
// IMPORTANTE: A request schema do OpenRouter aceita apenas `model`,
// `input_audio`, `language`, `temperature` e `provider`. Campos extras no
// topo (ex.: `prompt`) são silenciosamente descartados pelo gateway. Para
// passar `prompt` ao decoder upstream, use o canal `provider.options.<slug>`
// (passthrough específico por provider) — este helper faz isso automaticamente
// derivando o slug do `model` (`openai/gpt-4o-transcribe` → `openai`).
//
// Frame-agnostic, sem `import "server-only"` para permitir teste com vitest;
// na prática só roda em route handlers Node (`runtime: "nodejs"`).

const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
// Default atualizado em 2026-05 — Whisper-1 e Whisper-large-v3 mostraram
// regressão em palavras isoladas pt-BR em produção (ex.: cozya). Família
// GPT-4o-transcribe substitui ambos com qualidade superior e custo similar.
// Apps podem override via `input.model` para `openai/whisper-large-v3` ou
// outro STT da família OpenAI-compat se preferir.
const DEFAULT_MODEL = "openai/gpt-4o-transcribe";

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
  /**
   * Modelo de transcrição. Default `openai/gpt-4o-transcribe` (GPT-4o family,
   * não Whisper — substancialmente melhor em pt-BR para clipes curtos e
   * palavras isoladas). Override para `openai/whisper-large-v3`,
   * `groq/whisper-large-v3-turbo`, etc., se o caso justificar.
   */
  model?: string;
  /** Headers opcionais, como `HTTP-Referer` e `X-OpenRouter-Title` para atribuição. */
  headers?: Record<string, string>;
  /**
   * Container do áudio (ex.: `webm`, `mp3`, `wav`). Para Blob, é inferido de
   * `audio.type` se omitido (com fallback para `webm`).
   */
  format?: string;
  /**
   * Texto opcional que guia a transcrição. Em Whisper é lista de keywords
   * (~244 tokens); em `gpt-4o-transcribe`/`gpt-4o-mini-transcribe` é texto
   * livre (pode incluir frases descritivas).
   *
   * Roteado via `provider.options.<slug>.prompt` — canal documentado pelo
   * OpenRouter para passar parâmetros provider-específicos. O slug é
   * inferido automaticamente do `model` (`openai/gpt-4o-transcribe` →
   * slug `openai`). Passar no topo do body NÃO funciona — OpenRouter
   * descarta silenciosamente campos fora da schema.
   */
  prompt?: string;
  /**
   * Sampling temperature para a transcrição. Para STT, `0` é a escolha
   * canônica (reduz alucinação e variabilidade entre chamadas idênticas).
   * Omitir mantém o default do modelo.
   */
  temperature?: number;
  /** Optional caller cancellation; every transcription also has a 90-second deadline. */
  signal?: AbortSignal;
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
  const model = input.model ?? DEFAULT_MODEL;
  const providerSlug = inferProviderSlug(model);

  const response = await fetch(`${baseURL}/audio/transcriptions`, {
    method: "POST",
    signal: input.signal
      ? AbortSignal.any([input.signal, AbortSignal.timeout(90_000)])
      : AbortSignal.timeout(90_000),
    headers: {
      ...(input.headers ?? {}),
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      input_audio: { data, format },
      model,
      ...(input.language ? { language: input.language } : {}),
      ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
      ...(input.prompt
        ? { provider: { options: { [providerSlug]: { prompt: input.prompt } } } }
        : {}),
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

/**
 * Extrai o slug do provider a partir do model ID prefixado pelo OpenRouter.
 * `openai/gpt-4o-transcribe` → `"openai"`, `groq/whisper-large-v3-turbo` →
 * `"groq"`. Quando o ID não tem `/`, devolve o próprio ID (fallback raro).
 */
function inferProviderSlug(model: string): string {
  const idx = model.indexOf("/");
  return idx === -1 ? model : model.slice(0, idx);
}

function durationFromUsage(usage: unknown): number | undefined {
  if (!usage || typeof usage !== "object") return undefined;
  const seconds = (usage as { seconds?: unknown }).seconds;
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0
    ? seconds
    : undefined;
}
