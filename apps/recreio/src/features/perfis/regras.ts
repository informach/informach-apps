import { APELIDO } from "@informach/recreio";
import { z } from "zod";
import { AVATARES } from "./avatares";

/**
 * Validação do perfil na fronteira. Os limites do apelido são os do domínio
 * (`APELIDO`, em `@informach/recreio`), os mesmos que a tabela confere.
 */

/** O banco conta caracteres, não unidades UTF-16: um emoji vale um. */
function caracteres(texto: string): number {
  return [...texto].length;
}

/** Caractere de controle que não é espaço em branco (tabulação e quebra de linha viram espaço). */
function temControle(texto: string): boolean {
  return [...texto].some((caractere) => /\p{Cc}/u.test(caractere) && !/\s/u.test(caractere));
}

/**
 * Apelido como a pessoa quer ser chamada nos jogos. Espaços das pontas saem e
 * os do meio viram um só; caracteres de controle são recusados.
 */
export const ApelidoSchema = z
  .string()
  .max(200)
  .refine((valor) => !temControle(valor))
  .transform((valor) => valor.normalize("NFC").replace(/\s+/gu, " ").trim())
  .refine((valor) => caracteres(valor) >= APELIDO.min && caracteres(valor) <= APELIDO.max);

export const NovoPerfilSchema = z.strictObject({
  apelido: ApelidoSchema,
  avatar: z.enum(AVATARES),
});
export type NovoPerfil = z.infer<typeof NovoPerfilSchema>;
