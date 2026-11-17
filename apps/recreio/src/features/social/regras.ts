import { PerfilIdSchema } from "@informach/recreio";
import { z } from "zod";

export const PRAZO_DO_CODIGO_DE_AMIGO_MS = 30 * 60_000;
export const PRAZO_DO_PEDIDO_DE_AMIZADE_MS = 72 * 60 * 60_000;
export const LIMITE_DE_PEDIDOS_SOCIAIS = 20;
export const LIMITE_DE_AMIGOS = 100;
export const CodigoDeAmigoSchema = z
  .string()
  .max(48)
  .transform((v) => v.trim().toUpperCase().replace(/[\s-]/g, ""))
  .pipe(z.string().regex(/^[A-HJ-NP-Z2-9]{12}$/));
export const NovoPedidoDeAmizadeSchema = z.strictObject({
  codigo: CodigoDeAmigoSchema,
  pedidoId: z.uuid(),
});
export type NovoPedidoDeAmizade = z.infer<typeof NovoPedidoDeAmizadeSchema>;
export const AprovacaoDeAmizadeSchema = z.strictObject({
  pedidoId: z.uuid(),
  perfilId: PerfilIdSchema,
  versao: z.number().int().min(1).max(2147483646),
});
export type AprovacaoDeAmizade = z.infer<typeof AprovacaoDeAmizadeSchema>;
export const ProtecaoDeContatoSchema = z.strictObject({
  perfilId: PerfilIdSchema,
  bloqueado: z.boolean(),
  silenciado: z.boolean(),
});
export type ProtecaoDeContato = z.infer<typeof ProtecaoDeContatoSchema>;
