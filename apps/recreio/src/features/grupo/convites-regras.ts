import { z } from "zod";
import { NovoPerfilSchema } from "@/features/perfis/regras";

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

export const AceiteDeGrupoSchema = z.strictObject({
  conviteId: z.uuid(),
  declaroMaioridade: z.literal(true),
  versaoDaDeclaracao: z.literal(VERSAO_DA_DECLARACAO_ADULTA),
  entendoCobrancaPropria: z.literal(true),
  cobrir: z.boolean(),
  perfil: z.discriminatedUnion("tipo", [
    z.strictObject({
      tipo: z.literal("existente"),
      versao: z.number().int().min(1).max(2147483645),
    }),
    z.strictObject({ tipo: z.literal("novo"), dados: NovoPerfilSchema }),
  ]),
});
export type AceiteDeGrupo = z.infer<typeof AceiteDeGrupoSchema>;
