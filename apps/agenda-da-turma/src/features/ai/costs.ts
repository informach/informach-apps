/** Same accepted ceiling in the UI and on the server. Prices reviewed 2026-11-10. */
export const AGENDA_AI_TARIFF = "2026-11-10-v1";
export const AGENDA_AI_LIMITS = {
  outputTokens: 4096,
  contextTokens: 128000,
  // UTF-8 byte bounds include instructions, schema, context and protocol framing.
  fixedPromptBytes: 20000,
  imageTokens: 3000,
  timeoutMs: 70000,
} as const;
export type AiCostAcceptance = { version: string; maxCredits: number };
export function usdToCredits(usd: number) {
  if (!Number.isFinite(usd) || usd < 0) throw new Error("INVALID_AI_COST");
  return Math.max(1, Math.ceil((usd * 6 * 1.3) / 0.05));
}
export function noticeCostQuote(input: {
  text: string;
  attachment?: { dataUrl: string } | null;
}): AiCostAcceptance {
  const pdf = input.attachment?.dataUrl.startsWith("data:application/pdf;");
  const inputTokens = pdf
    ? AGENDA_AI_LIMITS.contextTokens
    : AGENDA_AI_LIMITS.fixedPromptBytes +
      new TextEncoder().encode(input.text).length +
      (input.attachment ? AGENDA_AI_LIMITS.imageTokens : 0);
  // PDF budget includes the entire model context; native processing has no extra OCR charge.
  return {
    version: AGENDA_AI_TARIFF,
    maxCredits: usdToCredits((inputTokens * 2.5 + AGENDA_AI_LIMITS.outputTokens * 10) / 1_000_000),
  };
}
export function assertCostAcceptance(accepted: AiCostAcceptance, quote: AiCostAcceptance) {
  if (accepted.version !== quote.version || accepted.maxCredits !== quote.maxCredits)
    throw new Error("AI_PRICE_CHANGED");
}
/** Missing or malformed provider usage is not fabricated as a one-credit call. */
export function actualNoticeCredits(raw: unknown) {
  const usage = raw as { inputTokens?: unknown; outputTokens?: unknown } | undefined;
  const input = usage?.inputTokens,
    output = usage?.outputTokens;
  if (
    typeof input !== "number" ||
    typeof output !== "number" ||
    !Number.isSafeInteger(input) ||
    !Number.isSafeInteger(output) ||
    input < 0 ||
    output < 1 ||
    input > AGENDA_AI_LIMITS.contextTokens ||
    output > AGENDA_AI_LIMITS.outputTokens
  )
    throw new Error("INVALID_AI_USAGE");
  return usdToCredits((input * 2.5 + output * 10) / 1_000_000);
}

export const SPEECH_COST = { version: AGENDA_AI_TARIFF, maxCredits: 2 } as const;
export const SUBJECT_TEXT_COST = { version: AGENDA_AI_TARIFF, maxCredits: 2 } as const;
export const SUBJECT_IMAGE_COST = {
  version: AGENDA_AI_TARIFF,
  maxCredits: usdToCredits(
    (AGENDA_AI_LIMITS.fixedPromptBytes * 2.5 + 3000 * 2.5 + AGENDA_AI_LIMITS.outputTokens * 10) /
      1_000_000,
  ),
} as const;
export function actualSubjectTextCredits(raw: unknown) {
  const usage = raw as { inputTokens?: unknown; outputTokens?: unknown } | undefined;
  const input = usage?.inputTokens,
    output = usage?.outputTokens;
  if (
    typeof input !== "number" ||
    typeof output !== "number" ||
    !Number.isSafeInteger(input) ||
    !Number.isSafeInteger(output) ||
    input < 0 ||
    output < 1 ||
    input > 40000 ||
    output > AGENDA_AI_LIMITS.outputTokens
  )
    throw new Error("INVALID_AI_USAGE");
  return usdToCredits((input * 0.15 + output * 0.6) / 1_000_000);
}

/** Published duration tariff; provider price variation is borne by Compasso. */
export function speechCredits(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 120)
    throw new Error("INVALID_SPEECH_DURATION");
  return Math.ceil(seconds / 60);
}
