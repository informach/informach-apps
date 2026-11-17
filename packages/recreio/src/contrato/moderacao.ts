import { z } from "zod";
import { PerfilIdSchema, UuidSchema } from "../dominio/ids";

const base = z.strictObject({
  comandoId: UuidSchema,
  protocolo: UuidSchema,
  versaoDoCaso: z.int().min(1).max(2147483646),
});
const motivo = z.enum([
  "risco_confirmado",
  "medida_preventiva",
  "recurso_procedente",
  "correcao_operacional",
]);
export const ComandoDeModeracaoSchema = z.discriminatedUnion("operacao", [
  base.extend({ operacao: z.literal("analisar") }),
  base.extend({
    operacao: z.literal("concluir"),
    decisao: z.enum(["sem_elementos", "medida_aplicada", "duplicada"]),
  }),
  base.extend({
    operacao: z.literal("suspender_perfil"),
    perfilId: PerfilIdSchema,
    versaoDoPerfil: z.int().min(1).max(2147483646),
    motivo,
  }),
  base.extend({
    operacao: z.literal("reativar_perfil"),
    perfilId: PerfilIdSchema,
    versaoDoPerfil: z.int().min(1).max(2147483646),
    motivo,
  }),
  base.extend({
    operacao: z.literal("desfazer_amizade"),
    revisaoDaAmizade: z.int().min(1).max(2147483646),
    motivo,
  }),
  base.extend({ operacao: z.literal("invalidar_convite"), conviteId: UuidSchema, motivo }),
  base.extend({
    operacao: z.literal("responder_recurso"),
    perfilId: PerfilIdSchema,
    versaoDoPerfil: z.int().min(1).max(2147483646),
    versaoDaRestricao: z.int().min(1).max(2147483646),
    decisao: z.enum(["manter", "reativar"]),
    motivo,
  }),
]);
export type ComandoDeModeracao = z.infer<typeof ComandoDeModeracaoSchema>;
export const ReciboDeModeracaoSchema = z.strictObject({
  comandoId: UuidSchema,
  protocolo: UuidSchema,
  versaoDoCaso: z.int().positive(),
  operacao: z.enum([
    "analisar",
    "concluir",
    "suspender_perfil",
    "reativar_perfil",
    "desfazer_amizade",
    "invalidar_convite",
    "responder_recurso",
  ]),
  repetido: z.boolean(),
});
export type ReciboDeModeracao = z.infer<typeof ReciboDeModeracaoSchema>;
