import { z } from "zod";

/** Declaração adulta desta operação; não é a responsabilidade por um menor. */
export const VERSAO_DA_DECLARACAO_ADULTA = "adulto-2026-11-17";
export const PRAZO_DO_CONVITE_MS = 72 * 60 * 60_000;
export const LIMITE_DE_CONVITES_PENDENTES = 5;
export const LIMITE_DE_CONVITES_RECEBIDOS = 20;

export const NovoConviteDeGrupoSchema = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  declaroMaioridade: z.literal(true),
  versaoDaDeclaracao: z.literal(VERSAO_DA_DECLARACAO_ADULTA),
});
export type NovoConviteDeGrupo = z.infer<typeof NovoConviteDeGrupoSchema>;
