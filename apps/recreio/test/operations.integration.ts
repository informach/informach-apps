import { db, sql } from "@informach/db";
import { expect, it } from "vitest";
import { databaseReady } from "@/features/operations/repository";

// O CI geral executa este contrato em PG 16 e 18, em bancos descartáveis.
it("prontidao exige o limite nativo de transacao disponivel desde PostgreSQL 17", async () => {
  const [servidor] = await db.execute<{ versao: number }>(
    sql`select current_setting('server_version_num')::integer as versao`,
  );
  if (!servidor) throw new Error("Banco sem versao");
  if (servidor.versao < 170000) {
    await expect(databaseReady()).rejects.toThrow("Recreio exige PostgreSQL 17+");
  } else {
    await expect(databaseReady()).resolves.toBeUndefined();
    await db.transaction(async (tx) => {
      await tx.execute(sql`set local transaction_timeout = '15s'`);
      const [limite] = await tx.execute<{ valor: string }>(
        sql`select current_setting('transaction_timeout') as valor`,
      );
      expect(limite?.valor).toBe("15s");
    });
  }
});
