import "server-only";
import { checkSchemaReadiness, db, sql } from "@informach/db";

/** Sonda barata: o schema do Recreio responde, sem ler linha nenhuma. */
export async function databaseReady() {
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout = '3000ms'`);
    const [capacidade] = await tx.execute<{ transaction_timeout: string | null }>(
      sql`select current_setting('transaction_timeout', true) as transaction_timeout`,
    );
    if (capacidade?.transaction_timeout == null)
      throw new Error("PostgreSQL sem transaction_timeout; Recreio exige PostgreSQL 17+");
    await tx.execute(sql`select 1 from recreio.profiles limit 0`);
  });
}

/**
 * O banco está pelo menos tão novo quanto este build?
 *
 * Alcançar o banco não basta: o migrator é um service separado, e um app
 * publicado antes da migração encontra a tabela de pé e a coluna faltando.
 * A consulta já tem `statement_timeout` curto e devolve `unreachable` quando o
 * banco não responde.
 */
export function schemaReady() {
  return checkSchemaReadiness();
}
