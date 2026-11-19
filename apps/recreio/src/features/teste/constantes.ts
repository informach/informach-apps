/** Condições do experimento, separadas da assinatura e da verificação externa de idade. */
export const VERSAO_DO_TESTE = "teste-2026-11-18-v1";
export const DURACAO_DO_TESTE_MS = {
  "48h": 48 * 60 * 60 * 1000,
  "7d": 168 * 60 * 60 * 1000,
} as const;
export type CoorteDoTeste = keyof typeof DURACAO_DO_TESTE_MS;
