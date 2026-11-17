import { z } from "zod";
import { PerfilIdSchema } from "../dominio/ids";

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
export const ProtecaoDeContatoSchema = z.strictObject({
  perfilId: PerfilIdSchema,
  bloqueado: z.boolean(),
  silenciado: z.boolean(),
});
export type ProtecaoDeContato = z.infer<typeof ProtecaoDeContatoSchema>;
export const MutacaoSocialSchema = z.discriminatedUnion("operacao", [
  z.strictObject({ operacao: z.literal("codigo") }),
  NovoPedidoDeAmizadeSchema.extend({ operacao: z.literal("pedir") }),
  z.strictObject({ operacao: z.literal("aceitar"), pedidoId: z.uuid() }),
  z.strictObject({
    operacao: z.literal("encerrar"),
    pedidoId: z.uuid(),
    acao: z.enum(["recusar", "revogar"]),
  }),
  ProtecaoDeContatoSchema.extend({ operacao: z.literal("proteger") }),
  z.strictObject({ operacao: z.literal("remover"), perfilId: PerfilIdSchema }),
]);
export const CodigoDeAmigoEmitidoSchema = z.strictObject({
  codigoId: z.uuid(),
  codigo: CodigoDeAmigoSchema,
  expiraEm: z.iso.datetime(),
});
export const PedidoDeAmizadeCriadoSchema = z.strictObject({
  pedidoId: z.uuid(),
  estado: z.enum(["pending", "accepted", "rejected", "revoked", "expired"]),
  repetido: z.boolean(),
});
export const AceiteDeAmizadeSchema = z.strictObject({
  pedidoId: z.uuid(),
  estado: z.enum(["pending", "accepted"]),
});
export const PedidoDeAmizadeEncerradoSchema = z.strictObject({
  pedidoId: z.uuid(),
  estado: z.enum(["rejected", "revoked"]),
});
export const ProtecaoSocialSalvaSchema = z.strictObject({
  bloqueado: z.boolean(),
  silenciado: z.boolean(),
});
export const AmizadeRemovidaSchema = z.strictObject({ removida: z.literal(true) });
export interface SocialDoPerfil {
  /** Código mostrado uma vez; nova emissão revoga o anterior. */
  codigo(): Promise<z.infer<typeof CodigoDeAmigoEmitidoSchema>>;
  /** Preserve pedidoId para recuperar a mesma tentativa após resposta perdida. */
  pedir(codigo: string, pedidoId: string): Promise<z.infer<typeof PedidoDeAmizadeCriadoSchema>>;
  aceitar(pedidoId: string): Promise<z.infer<typeof AceiteDeAmizadeSchema>>;
  encerrar(
    pedidoId: string,
    acao: "recusar" | "revogar",
  ): Promise<z.infer<typeof PedidoDeAmizadeEncerradoSchema>>;
  proteger(entrada: ProtecaoDeContato): Promise<z.infer<typeof ProtecaoSocialSalvaSchema>>;
  remover(perfilId: string): Promise<void>;
}
