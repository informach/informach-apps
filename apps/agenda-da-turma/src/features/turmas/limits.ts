export const TURMA_CODE_LENGTH = 12;
// Sem caracteres ambíguos: 0/O, 1/I/L
export const TURMA_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const TURMA_GRADES = [
  "1ano",
  "2ano",
  "3ano",
  "4ano",
  "5ano",
  "6ano",
  "7ano",
  "8ano",
  "9ano",
] as const;
export type TurmaGrade = (typeof TURMA_GRADES)[number];
export const MIN_TURMA_YEAR = 2020;
export const MAX_TURMA_YEAR = 2099;

export const TURMA_SHIFTS = ["unspecified", "morning", "afternoon", "full_day", "evening"] as const;
export const TURMA_SHIFT_LABELS = {
  unspecified: "Não informado",
  morning: "Manhã",
  afternoon: "Tarde",
  full_day: "Integral",
  evening: "Noite",
} as const;
