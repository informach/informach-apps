import { z } from "zod";
import { MundoIdSchema, PerfilIdSchema, UuidSchema } from "../dominio/ids";

export const NovoConviteDirigidoSchema = z.strictObject({
  mundoId: MundoIdSchema,
  perfilId: PerfilIdSchema,
  pedidoId: UuidSchema,
  /** Opaco; somente o servidor pode comparar com a participação já atribuída ao emissor. */
  participacao: z.string().max(64).nullable().default(null),
});
export type NovoConviteDirigido = z.infer<typeof NovoConviteDirigidoSchema>;
export const RespostaAConviteDirigidoSchema = z.strictObject({
  conviteId: UuidSchema,
  acao: z.enum(["aceitar", "recusar", "revogar"]),
});
export const ConviteDirigidoSchema = z.strictObject({
  conviteId: UuidSchema,
  mundoId: MundoIdSchema,
  jogo: z.string().min(1).max(64),
  estado: z.enum(["pending", "accepted", "declined", "revoked", "expired"]),
  expiraEm: z.iso.datetime(),
  aguardaMundo: z.boolean(),
  aguardaOrigem: z.boolean(),
  aguardaDestino: z.boolean(),
});
export type ConviteDirigido = z.infer<typeof ConviteDirigidoSchema>;
export const ConsultaDeConvitesDirigidosSchema = z
  .strictObject({
    aposEm: z.iso.datetime().optional(),
    aposId: UuidSchema.optional(),
  })
  .refine((p) => (p.aposEm === undefined) === (p.aposId === undefined));
export const CaixaDeConvitesDirigidosSchema = z.strictObject({
  convites: z
    .array(
      ConviteDirigidoSchema.pick({
        conviteId: true,
        mundoId: true,
        jogo: true,
        estado: true,
        expiraEm: true,
      }).extend({
        perfilId: PerfilIdSchema,
        direcao: z.enum(["enviado", "recebido"]),
        criadoEm: z.iso.datetime(),
      }),
    )
    .max(10),
  proximo: z.strictObject({ em: z.iso.datetime(), id: UuidSchema }).nullable(),
});
export type CaixaDeConvitesDirigidos = z.infer<typeof CaixaDeConvitesDirigidosSchema>;
export const MutacaoDeConviteDirigidoSchema = z.discriminatedUnion("operacao", [
  NovoConviteDirigidoSchema.extend({ operacao: z.literal("emitir") }),
  RespostaAConviteDirigidoSchema.extend({ operacao: z.literal("responder") }),
  z.strictObject({ operacao: z.literal("consultar"), conviteId: UuidSchema }),
]);
export interface ConvitesDirigidosDoPerfil {
  listar(apos?: { em: string; id: string }): Promise<CaixaDeConvitesDirigidos>;
  consultar(conviteId: string): Promise<ConviteDirigido>;
  /** Conservar pedidoId após resposta perdida; nenhum envio tem retry automático. */
  emitir(pedido: z.input<typeof NovoConviteDirigidoSchema>): Promise<ConviteDirigido>;
  responder(conviteId: string, acao: "aceitar" | "recusar" | "revogar"): Promise<ConviteDirigido>;
}
export const AprovacaoParentalDeConviteSchema = z.strictObject({
  conviteId: UuidSchema,
  perfilId: PerfilIdSchema,
  versaoDaPolitica: z.int().min(1).max(2147483646),
  confirmo: z.literal(true),
});
export const EncerramentoParentalDeConviteSchema = z.strictObject({
  conviteId: UuidSchema,
  perfilId: PerfilIdSchema,
  confirmo: z.literal(true),
});
export const AprovacaoDoMundoParaConviteSchema = z.strictObject({
  conviteId: UuidSchema,
  versaoDaGestao: z.int().min(1).max(2147483646),
  confirmo: z.literal(true),
});
