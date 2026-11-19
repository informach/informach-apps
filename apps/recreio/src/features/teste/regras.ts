import { z } from "zod";
import { VERSAO_DA_DECLARACAO_ADULTA } from "@/features/grupo/convites-constantes";
import { VERSAO_DO_TESTE } from "./constantes";

export const ConsentimentoDoTesteSchema = z.strictObject({
  pedidoId: z.uuid(),
  souAdulto: z.literal(true),
  aceitoExperimento: z.literal(true),
  versaoDaDeclaracao: z.literal(VERSAO_DA_DECLARACAO_ADULTA),
  versaoDoTeste: z.literal(VERSAO_DO_TESTE),
});
export type ConsentimentoDoTeste = z.infer<typeof ConsentimentoDoTesteSchema>;
