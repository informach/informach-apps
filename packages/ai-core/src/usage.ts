import type { TokenUsage } from "./types";

/**
 * Normaliza shapes de usage emitidos pelos providers AI SDK em uma struct
 * `TokenUsage` interna. Aceita os dois shapes que aparecem hoje no monorepo:
 *
 * - AI SDK v5+ (atual): `{ inputTokens, outputTokens, totalTokens }`
 * - Legado/Mastra histórico: `{ promptTokens, completionTokens, totalTokens }`
 *
 * Falta de campo, valores não-numéricos ou negativos viram 0 (e não throw),
 * porque os recorders/billing já validam invariantes (`computeCreditsFromUsage`
 * exige `total = prompt + completion` e inteiros não-negativos). Esta função
 * apenas garante o shape — a validação fica nos consumers.
 */
export function normalizeUsage(raw: unknown): TokenUsage {
  const u = (raw ?? {}) as Record<string, unknown>;
  const promptTokens = numberOr(u.inputTokens ?? u.promptTokens, 0);
  const completionTokens = numberOr(u.outputTokens ?? u.completionTokens, 0);
  const totalTokens = numberOr(u.totalTokens, promptTokens + completionTokens);
  return { promptTokens, completionTokens, totalTokens };
}

function numberOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback;
}
