export const CANCEL_REASONS = [
  "too_expensive",
  "missing_features",
  "not_using",
  "switching_tool",
  "temporary",
  "other",
] as const;

export type CancelReason = (typeof CANCEL_REASONS)[number];

export const CANCEL_REASON_LABELS: Record<CancelReason, string> = {
  too_expensive: "Preço",
  missing_features: "Faltam recursos",
  not_using: "Não estou usando",
  switching_tool: "Vou usar outra ferramenta",
  temporary: "Pausa temporária",
  other: "Outro motivo",
};
