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
export const AprovacaoParentalDeConviteSchema = z.strictObject({
  conviteId: UuidSchema,
  perfilId: PerfilIdSchema,
  versaoDaPolitica: z.int().min(1).max(2147483646),
  confirmo: z.literal(true),
});
export const AprovacaoDoMundoParaConviteSchema = z.strictObject({
  conviteId: UuidSchema,
  versaoDaGestao: z.int().min(1).max(2147483646),
  confirmo: z.literal(true),
});
