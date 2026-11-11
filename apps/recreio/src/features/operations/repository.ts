import "server-only";
import { checkSchemaReadiness } from "@informach/db";

/**
 * O banco está pelo menos tão novo quanto este build?
 *
 * Alcançar o banco não basta: o migrator é um service separado, e um app
 * publicado antes da migração encontra a tabela de pé e a coluna faltando.
 * A consulta já tem `statement_timeout` curto e devolve `unreachable` quando o
 * banco não responde. Ainda não existe schema `recreio`, então nenhuma tabela
 * do app é sondada aqui.
 */
export function schemaReady() {
  return checkSchemaReadiness();
}
