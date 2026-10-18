/**
 * Claude models of the assistant inside EdiAula (Anthropic API key), the request each turn
 * sends and what a turn costs. Prices are US$ per million tokens, from Anthropic's price list
 * (October 2026); a model missing here has no cost shown.
 */

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export const EFFORTS: readonly { id: Effort; label: string }[] = [
  { id: "low", label: "Baixo (mais rápido e barato)" },
  { id: "medium", label: "Médio" },
  { id: "high", label: "Alto (padrão)" },
  { id: "xhigh", label: "Muito alto" },
  { id: "max", label: "Máximo (mais lento e caro)" },
];

export const DEFAULT_EFFORT: Effort = "high";
export const isEffort = (value: unknown): value is Effort => EFFORTS.some((e) => e.id === value);

export const DEFAULT_MODEL = "claude-opus-5-5";

export const ASSISTANT_MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5 (recomendado)" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 (econômico)" },
] as const;

/** Earlier models still served: whoever picked one keeps it, with a notice. */
export const EARLIER_MODELS = [
  { id: "claude-opus-5", label: "Claude Opus 5 (versão anterior)" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5 (versão anterior)" },
] as const;

/** Models no longer offered: a choice of one moves to its successor. */
const REPLACED: Record<string, string> = { "claude-haiku-4-5": "claude-haiku-5-5" };

export const modelLabel = (id: string): string =>
  [...ASSISTANT_MODELS, ...EARLIER_MODELS].find((m) => m.id === id)?.label ?? id;

/** The model to use for a stored choice, and what to tell the person about it. */
export function resolveModel(stored?: string): {
  model: string;
  notice?: string;
  migrated?: boolean;
} {
  if (!stored) return { model: DEFAULT_MODEL };
  const successor = REPLACED[stored];
  if (successor)
    return {
      model: successor,
      migrated: true,
      notice: `O ${stored === "claude-haiku-4-5" ? "Claude Haiku 4.5" : stored} saiu da lista; o assistente passou para o ${modelLabel(successor)}.`,
    };
  if (ASSISTANT_MODELS.some((m) => m.id === stored)) return { model: stored };
  if (EARLIER_MODELS.some((m) => m.id === stored))
    return {
      model: stored,
      notice: `Você está no ${modelLabel(stored).replace(" (versão anterior)", "")}. O Claude Opus 5.5 é mais novo e mais barato; troque quando quiser.`,
    };
  return {
    model: DEFAULT_MODEL,
    notice: `O modelo "${stored}" não está disponível; o assistente usa o Claude Opus 5.5.`,
  };
}

/** Models where the API retries a declined request on a fallback model by itself. */
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-opus-5", "claude-sonnet-5-5"]);
/** Models with server-side compaction of long conversations. */
const COMPACTION_MODELS = new Set([
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-sonnet-5-5",
  "claude-sonnet-5",
  "claude-haiku-5-5",
]);

export interface AssistantRequest {
  model: string;
  thinking: { type: "adaptive" };
  output_config: { effort: Effort };
  betas: string[];
  context_management?: { edits: { type: "compact_20260112" }[] };
  fallbacks?: "default";
}

/**
 * The model-dependent part of every request: adaptive thinking, the effort always sent (the
 * API default differs between models), compaction of long conversations and, where the API
 * offers it, the fallback model when a safety classifier declines.
 */
export function buildRequest(model: string, effort: Effort): AssistantRequest {
  const request: AssistantRequest = {
    model,
    thinking: { type: "adaptive" },
    output_config: { effort },
    betas: [],
  };
  if (COMPACTION_MODELS.has(model)) {
    request.betas.push("compact-2026-01-12");
    request.context_management = { edits: [{ type: "compact_20260112" }] };
  }
  if (FALLBACK_MODELS.has(model)) {
    request.betas.push("server-side-fallback-2026-07-01");
    request.fallbacks = "default";
  }
  return request;
}

/* ----- Cost ----- */

interface Rates {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

const PRICES: Record<string, Rates & { long?: Rates & { above: number } }> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  "claude-haiku-5-5": {
    input: 0.1,
    output: 0.5,
    cacheWrite: 0.125,
    cacheRead: 0.01,
    // Prompts above 100 thousand tokens are billed on a second price card.
    long: { above: 100_000, input: 0.5, output: 2.5, cacheWrite: 0.625, cacheRead: 0.05 },
  },
  "claude-opus-5": { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  "claude-sonnet-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  "claude-opus-4-8": { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
};

interface Counts {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

/** Usage of one response, as the API reports it (top level and per attempt). */
export interface UsageLike extends Counts {
  iterations?: readonly (Counts & { type: string; model?: string | null })[] | null;
}

function priced(model: string, c: Counts): number | undefined {
  const base = PRICES[model];
  if (!base) return undefined;
  const write = c.cache_creation_input_tokens ?? 0;
  const read = c.cache_read_input_tokens ?? 0;
  const prompt = c.input_tokens + write + read;
  const r = base.long && prompt > base.long.above ? base.long : base;
  return (
    (c.input_tokens * r.input +
      c.output_tokens * r.output +
      write * r.cacheWrite +
      read * r.cacheRead) /
    1_000_000
  );
}

const tokensOf = (c: Counts): number =>
  c.input_tokens +
  c.output_tokens +
  (c.cache_creation_input_tokens ?? 0) +
  (c.cache_read_input_tokens ?? 0);

/**
 * Tokens and US$ of one response. When the API reports attempts (a fallback model that ran, a
 * compaction), each is priced at the rates of the model that ran it.
 */
export function usageCost(model: string, usage: UsageLike): { tokens: number; usd?: number } {
  const parts = usage.iterations?.length
    ? usage.iterations.map((it) => ({ model: it.model ?? model, counts: it as Counts }))
    : [{ model, counts: usage as Counts }];
  let tokens = 0;
  let usd: number | undefined = 0;
  for (const part of parts) {
    tokens += tokensOf(part.counts);
    const cost = priced(part.model, part.counts);
    usd = usd === undefined || cost === undefined ? undefined : usd + cost;
  }
  return usd === undefined ? { tokens } : { tokens, usd };
}

/** "12,3 mil tokens · US$ 0,04" (with "cerca de" when the client only estimates the cost). */
export function usageLabel(usage: { tokens: number; usd?: number; estimated?: boolean }): string {
  const tokens =
    usage.tokens >= 1_000_000
      ? `${(usage.tokens / 1_000_000).toFixed(1).replace(".", ",")} mi tokens`
      : usage.tokens >= 1000
        ? `${(usage.tokens / 1000).toFixed(1).replace(".", ",")} mil tokens`
        : `${usage.tokens} tokens`;
  if (usage.usd === undefined) return tokens;
  const usd =
    usage.usd < 0.01 ? "menos de US$ 0,01" : `US$ ${usage.usd.toFixed(2).replace(".", ",")}`;
  return `${tokens} · ${usage.estimated && usage.usd >= 0.01 ? `cerca de ${usd}` : usd}`;
}
