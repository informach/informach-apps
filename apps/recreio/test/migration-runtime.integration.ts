import { db, sql } from "@informach/db";
import { createMigrationClient, migrationFailure } from "@informach/db/migration-runtime";
import { expect, it } from "vitest";
import { sinal } from "./apoio";

function cliente() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Fixture sem conexão");
  return createMigrationClient(url);
}

it("o índice gerado está aplicado, pronto e válido no PostgreSQL descartável", async () => {
  const [indice] = await db.execute<{ valido: boolean; pronto: boolean; parcial: boolean }>(sql`
    select indisvalid as valido, indisready as pronto, indpred is not null as parcial
    from pg_index where indexrelid=to_regclass('recreio.recreio_space_invites_unused_expires')`);
  expect(indice).toEqual({ valido: true, pronto: true, parcial: true });
});

it("o cliente real do migrator abre a conexão com os limites operacionais", async () => {
  const migrator = cliente();
  try {
    const [limites] = await migrator`select
      extract(epoch from current_setting('lock_timeout')::interval)::int as espera,
      extract(epoch from current_setting('statement_timeout')::interval)::int as instrucao,
      current_setting('application_name') as aplicacao`;
    expect(limites).toEqual({ espera: 1, instrucao: 60, aplicacao: "informach-migrator" });
  } finally {
    await migrator.end({ timeout: 5 });
  }
});

it("DDL disputado aborta sem alteração parcial; liberar a trava permite repetir", async () => {
  const migrator = cliente();
  try {
    await db.execute(sql`create table recreio.migration_guard_target (id integer primary key)`);
    await db.execute(sql`create table recreio.migration_guard_markers (id integer primary key)`);
    const pronto = sinal<void>();
    const liberar = sinal<void>();
    const escritor = db.transaction(async (tx) => {
      await tx.execute(sql`insert into recreio.migration_guard_target values (1)`);
      pronto.concluir(undefined);
      await liberar.promessa;
    });
    void escritor.catch(pronto.recusar);
    await pronto.promessa;
    const aplicar = () =>
      migrator.begin(async (tx) => {
        await tx`insert into recreio.migration_guard_markers values (1)`;
        await tx`create index migration_guard_retry_idx on recreio.migration_guard_target(id)`;
      });
    // Protege a limpeza do fixture se o limite nativo regredir; nesse caso o teste falha.
    const protecao = setTimeout(() => liberar.concluir(undefined), 5_000);
    try {
      const erro = await aplicar().then(
        () => null,
        (failure: unknown) => failure,
      );
      expect(migrationFailure(erro)).toEqual({ code: "55P03" });
      const [estado] = await db.execute<{ marcadores: number; indice: boolean }>(sql`
        select (select count(*)::int from recreio.migration_guard_markers) as marcadores,
        to_regclass('recreio.migration_guard_retry_idx') is not null as indice`);
      expect(estado).toEqual({ marcadores: 0, indice: false });
    } finally {
      clearTimeout(protecao);
      liberar.concluir(undefined);
      await escritor;
    }
    await aplicar();
    const [estado] = await db.execute<{ marcadores: number; indice: boolean }>(sql`
      select (select count(*)::int from recreio.migration_guard_markers) as marcadores,
      to_regclass('recreio.migration_guard_retry_idx') is not null as indice`);
    expect(estado).toEqual({ marcadores: 1, indice: true });
  } finally {
    await migrator.end({ timeout: 5 });
    await db.execute(sql`drop table if exists recreio.migration_guard_target`);
    await db.execute(sql`drop table if exists recreio.migration_guard_markers`);
  }
});
