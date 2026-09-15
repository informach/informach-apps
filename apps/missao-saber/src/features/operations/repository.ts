import "server-only";
import { checkSchemaReadiness, db, sql } from "@informach/db";

export async function databaseReady() {
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout = '3000ms'`);
    await tx.execute(sql`select 1 from missao_saber.families limit 0`);
  });
}

/**
 * O banco está pelo menos tão novo quanto este build?
 *
 * Alcançar o banco não basta: o migrator é um service separado, e um app
 * publicado antes da migração encontra a tabela de pé e a coluna faltando.
 */
export function schemaReady() {
  return checkSchemaReadiness();
}
