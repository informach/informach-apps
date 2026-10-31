import "server-only";
import { redis } from "@/lib/redis";
import { databaseReady, schemaReady } from "./repository";

/**
 * O portão de deploy. Alcançar o banco não basta: o migrator é um service
 * separado, e um app publicado antes da migração encontra a tabela de pé e uma
 * coluna faltando. `schemaReady` pergunta se o banco está pelo menos tão novo
 * quanto este build — rollback do app sem desfazer migração continua passando,
 * porque a pergunta é "atrás", nunca "diferente".
 */
export async function checkReadiness() {
  const [, cache, schema] = await Promise.all([databaseReady(), redis?.ping(), schemaReady()]);
  if (cache !== "PONG") throw new Error("Dependency unavailable");
  if (!schema.ok) throw new Error(`Schema ${schema.reason}: esperado ${schema.expected}`);
}
