import { z } from "zod";
import { PerfilIdSchema, UuidSchema } from "../dominio/ids";

/** Catálogo fechado; nenhuma mensagem, foto ou dado pessoal é aceito como evidência do cliente. */
export const CategoriaDeDenunciaSchema = z.enum([
  "contato_indesejado",
  "assedio",
  "conteudo_inadequado",
  "dados_pessoais",
  "ameaca",
  "outro",
]);
export type CategoriaDeDenuncia = z.infer<typeof CategoriaDeDenunciaSchema>;
export const DenunciaDeContatoSchema = z.strictObject({
  perfilId: PerfilIdSchema,
  denunciaId: UuidSchema,
  categoria: CategoriaDeDenunciaSchema,
});
export type DenunciaDeContato = z.infer<typeof DenunciaDeContatoSchema>;
export const DenunciaRecebidaSchema = z.strictObject({
  protocolo: UuidSchema,
  repetida: z.boolean(),
});
export type DenunciaRecebida = z.infer<typeof DenunciaRecebidaSchema>;
export const RecursoDaRestricaoSchema = z.strictObject({
  perfilId: PerfilIdSchema,
  recursoId: UuidSchema,
  versaoDoPerfil: z.int().min(1).max(2147483646),
});
export type RecursoDaRestricao = z.infer<typeof RecursoDaRestricaoSchema>;
export const RecursoRecebidoSchema = z.strictObject({
  protocolo: UuidSchema,
  repetido: z.boolean(),
});
export type RecursoRecebido = z.infer<typeof RecursoRecebidoSchema>;
export const RevisaoDeDenunciaSchema = z.strictObject({
  protocolo: UuidSchema,
  versaoDoCaso: z.int().min(1).max(2147483646),
  recursoId: UuidSchema,
});
export type RevisaoDeDenuncia = z.infer<typeof RevisaoDeDenunciaSchema>;
export const ConsultaDeDenunciasSchema = z.strictObject({ protocolo: UuidSchema.optional() });
export const AcompanhamentoDeDenunciasSchema = z.strictObject({
  perfilId: PerfilIdSchema,
  denuncias: z
    .array(
      z.strictObject({
        protocolo: UuidSchema,
        categoria: CategoriaDeDenunciaSchema,
        situacao: z.enum(["aberta", "em_analise", "resolvida", "recurso", "encerrada"]),
        revisao: z.int().positive(),
        decisao: z.enum(["sem_elementos", "medida_aplicada", "duplicada"]).nullable(),
        recebidaEm: z.iso.datetime(),
        atualizadaEm: z.iso.datetime(),
        recursoEm: z.iso.datetime().nullable(),
        podePedirRevisao: z.boolean(),
        prazoParaRevisao: z.iso.datetime().nullable(),
      }),
    )
    .max(10),
});
export type AcompanhamentoDeDenuncias = z.infer<typeof AcompanhamentoDeDenunciasSchema>;
