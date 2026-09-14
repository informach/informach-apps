import "server-only";
import { db, sql } from "@informach/db";

export async function databaseReady() {
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout = '3000ms'`);
    await tx.execute(sql`select 1 from missao_saber.families limit 0`);
  });
}
