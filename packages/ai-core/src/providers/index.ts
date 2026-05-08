import { createAnthropic as createAnthropicSDK } from "@ai-sdk/anthropic";
import { createOpenAI as createOpenAISDK } from "@ai-sdk/openai";
import {
  createOpenRouter as createOpenRouterSDK,
  type OpenRouterProviderSettings,
} from "@openrouter/ai-sdk-provider";

export type AnthropicProviderConfig = {
  apiKey: string;
  baseURL?: string;
  headers?: Record<string, string>;
};

export type OpenAIProviderConfig = {
  apiKey: string;
  baseURL?: string;
  organization?: string;
  project?: string;
  headers?: Record<string, string>;
};

export type OpenRouterProviderConfig = {
  apiKey: string;
  baseURL?: string;
  compatibility?: OpenRouterProviderSettings["compatibility"];
  /**
   * OpenRouter usa `HTTP-Referer` e `X-OpenRouter-Title` para atribuição/leaderboard.
   * Apps passam via `lib/env.ts` (`OPENROUTER_HTTP_REFERER`/`OPENROUTER_X_TITLE`).
   */
  headers?: Record<string, string>;
  /** Atalho oficial do provider para `X-OpenRouter-Title`. */
  appName?: string;
  /** Atalho oficial do provider para `HTTP-Referer`. */
  appUrl?: string;
  /** Body extra aplicado a todas as requests deste provider. */
  extraBody?: OpenRouterProviderSettings["extraBody"];
  /** BYOK opcional para provider routing no OpenRouter. */
  apiKeys?: NonNullable<OpenRouterProviderSettings["api_keys"]>;
};

/**
 * Cria um provider Anthropic do AI SDK compatível com Mastra v1 com `apiKey` explícito.
 *
 * Diferente do `import { anthropic } from "@ai-sdk/anthropic"`, este wrapper
 * NÃO depende de `process.env.ANTHROPIC_API_KEY` — o app injeta via
 * `lib/env.ts`. Isso mantém o package ai-core puro e testável.
 *
 * Uso:
 * ```ts
 * const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });
 * new Agent({ name: "x", model: anthropic("claude-opus-4-7"), ... });
 * ```
 */
export function createAnthropic(config: AnthropicProviderConfig) {
  return createAnthropicSDK({
    apiKey: config.apiKey,
    ...(config.baseURL ? { baseURL: config.baseURL } : {}),
    ...(config.headers ? { headers: config.headers } : {}),
  });
}

/**
 * Cria um provider OpenAI do AI SDK compatível com Mastra v1 com `apiKey` explícito.
 *
 * Mesma motivação de `createAnthropic` — apiKey injetado, sem `process.env`.
 */
export function createOpenAI(config: OpenAIProviderConfig) {
  return createOpenAISDK({
    apiKey: config.apiKey,
    ...(config.baseURL ? { baseURL: config.baseURL } : {}),
    ...(config.organization ? { organization: config.organization } : {}),
    ...(config.project ? { project: config.project } : {}),
    ...(config.headers ? { headers: config.headers } : {}),
  });
}

/**
 * Cria um provider OpenRouter do AI SDK com `apiKey` injetado.
 *
 * OpenRouter é o gateway unificado de modelos do projeto: chat (text/vision),
 * structured output, web search (`openrouter.tools.webSearch`) e Whisper
 * transcription via `/audio/transcriptions` OpenAI-compatible. IDs de modelo
 * são prefixados pelo provider de origem (ex.: `openai/gpt-4o-mini`,
 * `anthropic/claude-3.5-sonnet`, `openai/whisper-1`).
 *
 * Para transcrição via Whisper, prefira reusar `createOpenAI({ baseURL })` —
 * OpenRouter expõe o endpoint `/audio/transcriptions` no mesmo shape OpenAI,
 * então `experimental_transcribe` funciona sem rewrite.
 */
export function createOpenRouter(config: OpenRouterProviderConfig) {
  return createOpenRouterSDK({
    apiKey: config.apiKey,
    ...(config.baseURL ? { baseURL: config.baseURL } : {}),
    ...(config.compatibility ? { compatibility: config.compatibility } : {}),
    ...(config.headers ? { headers: config.headers } : {}),
    ...(config.appName ? { appName: config.appName } : {}),
    ...(config.appUrl ? { appUrl: config.appUrl } : {}),
    ...(config.extraBody ? { extraBody: config.extraBody } : {}),
    ...(config.apiKeys ? { api_keys: config.apiKeys } : {}),
  });
}
