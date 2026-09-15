import "server-only";
import { checkSchemaReadiness } from "@informach/db";

/**
 * O banco está pelo menos tão novo quanto este build?
 *
 * Fina de propósito: a comparação mora em `@informach/db` porque os três apps
 * fazem a MESMA pergunta contra o MESMO banco, e o journal do Drizzle é a
 * resposta. Aqui só existe a fronteira que o lint exige — route handler não
 * importa banco.
 */
export function schemaReady() {
  return checkSchemaReadiness();
}
