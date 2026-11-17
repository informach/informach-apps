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
