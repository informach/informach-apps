import { createAnthropic as createAnthropicSDK } from "@ai-sdk/anthropic";
import { createOpenAI as createOpenAISDK } from "@ai-sdk/openai";

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

/**
 * Cria um provider Anthropic do AI SDK v5 com `apiKey` explícito.
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
 * Cria um provider OpenAI do AI SDK v5 com `apiKey` explícito.
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
