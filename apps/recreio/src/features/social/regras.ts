import { PerfilIdSchema } from "@informach/recreio";
import { z } from "zod";

export const PRAZO_DO_CODIGO_DE_AMIGO_MS = 30 * 60_000;
export const PRAZO_DO_PEDIDO_DE_AMIZADE_MS = 72 * 60 * 60_000;
export const LIMITE_DE_PEDIDOS_SOCIAIS = 20;
export const LIMITE_DE_AMIGOS = 100;
export {
  CodigoDeAmigoSchema,
  type NovoPedidoDeAmizade,
  NovoPedidoDeAmizadeSchema,
  type ProtecaoDeContato,
  ProtecaoDeContatoSchema,
} from "@informach/recreio/contrato";
export const AprovacaoDeAmizadeSchema = z.strictObject({
  pedidoId: z.uuid(),
  perfilId: PerfilIdSchema,
  versao: z.number().int().min(1).max(2147483646),
});
export type AprovacaoDeAmizade = z.infer<typeof AprovacaoDeAmizadeSchema>;
export const RenovacaoDeAmizadeSchema = AprovacaoDeAmizadeSchema.extend({
  revisaoDaAmizade: z.number().int().min(1).max(2147483646),
  confirmoAmizade: z.literal(true),
});
export type RenovacaoDeAmizade = z.infer<typeof RenovacaoDeAmizadeSchema>;
