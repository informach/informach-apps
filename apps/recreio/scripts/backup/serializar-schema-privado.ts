import { randomBytes } from "node:crypto";
import type { FileHandle } from "node:fs/promises";
import type postgres from "postgres";
import { conferirCapacidadesRestauradas } from "./normalizar-capacidades";
import { exigirBancoPrivadoDeRecuperacao } from "./normalizar-fotografias";
import {
  type ArquivoDeSchemaPrivado,
  FalhaDoSchemaPrivado,
  type FerramentasNativasDeSchema,
} from "./schema-nativo-privado";

/** Quarantined staging archive only. PostgreSQL, rather than a SQL-text
 * replacement, translates internal references when the schema is renamed.
 * The original private name is restored even if pg_dump fails. Nothing here
 * settles current financial facts, publishes a schema or reopens traffic. */
export async function serializarSchemaRecreioPrivado(
  copia: postgres.Sql,
  ferramentas: FerramentasNativasDeSchema,
  arquivo: FileHandle,
) {
  await exigirBancoPrivadoDeRecuperacao(copia);
  const schema = `recreio_stage_${randomBytes(12).toString("hex")}`;
  const oid = await copia.begin(async (tx) => {
    await tx.unsafe("set local statement_timeout='5000ms'");
    await tx.unsafe("set local lock_timeout='2000ms'");
    await tx.unsafe("set local transaction_timeout='15000ms'");
    await conferirCapacidadesRestauradas(tx);
    const [perfil] = await tx.unsafe<{ oid: string; exports: number; invalido: boolean }[]>(`select
      n.oid::text as oid,(select count(*)::int from recreio.personal_exports) as exports,
      exists(select 1 from pg_catalog.pg_constraint c
        join pg_catalog.pg_class t on t.oid=c.conrelid
        join pg_catalog.pg_class r on r.oid=c.confrelid
        where c.contype='f' and r.relnamespace=n.oid and t.relnamespace<>n.oid)
      or exists(select 1 from pg_catalog.pg_proc p where p.pronamespace=n.oid)
      or exists(select 1 from pg_catalog.pg_event_trigger where evtenabled<>'D') as invalido
      from pg_catalog.pg_namespace n where n.nspname='recreio'`);
    if (!perfil || !/^[0-9]+$/.test(perfil.oid) || perfil.exports !== 0 || perfil.invalido)
      throw new FalhaDoSchemaPrivado("ESCOPO");
    await tx.unsafe(`alter schema recreio rename to "${schema}"`);
    return perfil.oid;
  });
  let resultado: { ok: true; prova: ArquivoDeSchemaPrivado } | { ok: false; erro: unknown };
  try {
    resultado = { ok: true, prova: await ferramentas.exportar(schema, arquivo) };
  } catch (erro) {
    resultado = { ok: false, erro };
  }
  try {
    await copia.begin(async (tx) => {
      await tx.unsafe("set local statement_timeout='5000ms'");
      await tx.unsafe("set local lock_timeout='2000ms'");
      await tx.unsafe("set local transaction_timeout='15000ms'");
      const [existe] = await tx.unsafe<{ oid: string; anteriorAusente: boolean }[]>(
        `select oid::text as oid,
        to_regnamespace('recreio') is null as "anteriorAusente" from pg_catalog.pg_namespace where nspname=$1`,
        [schema],
      );
      if (existe?.oid !== oid || !existe.anteriorAusente) throw new FalhaDoSchemaPrivado("ESCOPO");
      await tx.unsafe(`alter schema "${schema}" rename to recreio`);
    });
  } catch (erro) {
    throw new AggregateError(
      [erro, ...(!resultado.ok ? [resultado.erro] : [])],
      "Private schema name restoration failed",
    );
  }
  if (!resultado.ok) throw resultado.erro;
  return resultado.prova;
}
