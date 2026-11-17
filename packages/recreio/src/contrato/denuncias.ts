import { z } from "zod";
import { PerfilIdSchema } from "../dominio/ids";

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
  denunciaId: z.uuid(),
  categoria: CategoriaDeDenunciaSchema,
});
export type DenunciaDeContato = z.infer<typeof DenunciaDeContatoSchema>;
export const DenunciaRecebidaSchema = z.strictObject({
  protocolo: z.uuid(),
  repetida: z.boolean(),
});
export type DenunciaRecebida = z.infer<typeof DenunciaRecebidaSchema>;
export const RecursoDaRestricaoSchema = z.strictObject({
  perfilId: PerfilIdSchema,
  recursoId: z.uuid(),
  versaoDoPerfil: z.int().min(1).max(2147483646),
});
export type RecursoDaRestricao = z.infer<typeof RecursoDaRestricaoSchema>;
export const RecursoRecebidoSchema = z.strictObject({ protocolo: z.uuid(), repetido: z.boolean() });
export type RecursoRecebido = z.infer<typeof RecursoRecebidoSchema>;
export const RevisaoDeDenunciaSchema = z.strictObject({
  protocolo: z.uuid(),
  versaoDoCaso: z.int().min(1).max(2147483646),
  recursoId: z.uuid(),
});
export type RevisaoDeDenuncia = z.infer<typeof RevisaoDeDenunciaSchema>;
