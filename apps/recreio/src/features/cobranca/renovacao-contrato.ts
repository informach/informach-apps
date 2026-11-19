import { z } from "zod";

export const VERSAO_DO_CANCELAMENTO_DA_RENOVACAO = "renovacao-2026-11-19-v1";
const id = z.uuid().transform((value) => value.toLowerCase());

/** Somente referências locais mostradas ao próprio pagante. Identidade, modo,
 * preço, datas, cliente e assinatura do provedor são reconstruídos no servidor. */
export const AceiteDoCancelamentoDaRenovacaoSchema = z.strictObject({
  pedidoId: id,
  assinaturaId: id,
  revisaoDoContrato: z.int().min(1).max(2147483647),
  confirmoCancelamentoDaRenovacao: z.literal(true),
  versaoDasCondicoes: z.literal(VERSAO_DO_CANCELAMENTO_DA_RENOVACAO),
});
export type AceiteDoCancelamentoDaRenovacao = z.infer<typeof AceiteDoCancelamentoDaRenovacaoSchema>;

export const ConsultaDoCancelamentoDaRenovacaoSchema = z.strictObject({ pedidoId: id });
