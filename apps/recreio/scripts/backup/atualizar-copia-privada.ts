import { isDeepStrictEqual } from "node:util";
import { migrateOwnedCopyWithVerifiedHistory } from "@informach/db/migration-chain";
import postgres from "postgres";
import { z } from "zod";
import { conferirClienteDaCopiaPrivada } from "./conexao-privada";
import {
  conferirInventarios,
  type InventarioDoBackup,
  inventariarBackup,
  resumirCamposOriginaisDoRecreio,
} from "./inventario";
import { exigirBancoPrivadoDeRecuperacao } from "./normalizar-fotografias";

export class FalhaDoUpgradePrivado extends Error {
  constructor(
    readonly codigo:
      | "EXECUCAO_OCUPADA"
      | "CATALOGO_INVALIDO"
      | "DADOS_ALHEIOS_ALTERADOS"
      | "DADOS_ORIGINAIS_ALTERADOS"
      | "GLOBAIS_ALTERADOS"
      | "UPGRADE_NAO_CONFIRMADO",
    causa?: unknown,
  ) {
    super(codigo, { cause: causa });
  }
}
const ocupadas = new WeakSet<postgres.Sql>();
const MIGRATIONS_FOLDER = "/opt/recreio/migrations";

/** Inventory is compared again BEFORE any upgrade. Only the actual private
 * Unix-socket destination can be migrated. A separate owned client prevents
 * Drizzle's date/JSON parser changes from affecting the raw inventory reader.
 * No DATABASE_URL, source pool, seed, live service or public traffic is used. */
export async function atualizarCopiaPrivada(config: {
  copia: postgres.Sql;
  inventarioOriginal: InventarioDoBackup;
}) {
  const { copia } = config;
  if (ocupadas.has(copia)) throw new FalhaDoUpgradePrivado("EXECUCAO_OCUPADA");
  ocupadas.add(copia);
  try {
    const { opcoes } = await conferirClienteDaCopiaPrivada(copia);
    const antes = await copia.begin("isolation level repeatable read read only", async (tx) => {
      await tx`set local statement_timeout='15s'`;
      const inventario = await inventariarBackup(tx);
      conferirInventarios(config.inventarioOriginal, inventario);
      const tabelas = await tx.unsafe<{ nome: string; campos: unknown }[]>(`
        select c.relname as nome,jsonb_agg(a.attname order by a.attnum) as campos
        from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
        join pg_catalog.pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
        where n.nspname='recreio' and c.relkind='r' group by c.oid,c.relname order by c.relname limit 1025`);
      if (tabelas.length === 0 || tabelas.length > 1024)
        throw new FalhaDoUpgradePrivado("CATALOGO_INVALIDO");
      const projecoes: {
        nome: string;
        campos: string[];
        resumo: Awaited<ReturnType<typeof resumirCamposOriginaisDoRecreio>>;
      }[] = [];
      for (const t of tabelas) {
        const campos = z.array(z.string().min(1)).min(1).max(1600).parse(t.campos);
        projecoes.push({
          nome: t.nome,
          campos,
          resumo: await resumirCamposOriginaisDoRecreio(tx, t.nome, campos),
        });
      }
      return { inventario, projecoes };
    });
    // The inspection transaction has committed, releasing its ACCESS SHARE
    // locks before Drizzle needs to ALTER the original tables.
    const migracao = postgres({
      ...opcoes,
      max: 1,
      prepare: false,
      connect_timeout: 10,
      idle_timeout: 1,
      // The default driver prints raw multi-line notice objects. Operational
      // output is JSONL and must never include SQL identifiers or messages.
      onnotice: (aviso) => {
        console.log(
          JSON.stringify({
            fase: "upgrade_copia_privada",
            avisoPostgres:
              typeof aviso.code === "string" && /^[0-9A-Z]{5}$/.test(aviso.code)
                ? aviso.code
                : "NATIVE_NOTICE",
          }),
        );
      },
      connection: {
        application_name: "recreio-private-copy-migrator",
        lock_timeout: 2000,
        statement_timeout: 60000,
        transaction_timeout: 300000,
      },
    });
    let resultado:
      | { ok: true; valor: Awaited<ReturnType<typeof migrateOwnedCopyWithVerifiedHistory>> }
      | { ok: false; erro: unknown };
    try {
      await exigirBancoPrivadoDeRecuperacao(migracao);
      resultado = {
        ok: true,
        valor: await migrateOwnedCopyWithVerifiedHistory({
          connection: migracao,
          migrationsFolder: MIGRATIONS_FOLDER,
        }),
      };
    } catch (erro) {
      resultado = { ok: false, erro };
    }
    try {
      await migracao.end({ timeout: 5 });
    } catch (erro) {
      resultado = {
        ok: false,
        erro: resultado.ok
          ? erro
          : new AggregateError([resultado.erro, erro], "PRIVATE_UPGRADE_AND_CLIENT_CLEANUP_FAILED"),
      };
    }
    if (!resultado.ok) throw resultado.erro;
    const depois = await copia.begin("isolation level repeatable read read only", async (tx) => {
      await tx`set local statement_timeout='15s'`;
      const inventario = await inventariarBackup(tx);
      const alheias = (i: InventarioDoBackup) =>
        i.tabelas.filter((t) => t.schema !== "recreio" && t.schema !== "drizzle");
      if (!isDeepStrictEqual(alheias(antes.inventario), alheias(inventario)))
        throw new FalhaDoUpgradePrivado("DADOS_ALHEIOS_ALTERADOS");
      if (
        !isDeepStrictEqual(antes.inventario.globais, inventario.globais) ||
        !isDeepStrictEqual(antes.inventario.banco, inventario.banco)
      )
        throw new FalhaDoUpgradePrivado("GLOBAIS_ALTERADOS");
      for (const t of antes.projecoes)
        if (
          !isDeepStrictEqual(t.resumo, await resumirCamposOriginaisDoRecreio(tx, t.nome, t.campos))
        )
          throw new FalhaDoUpgradePrivado("DADOS_ORIGINAIS_ALTERADOS");
      return inventario;
    });
    return {
      ...resultado.valor,
      inventoryComparedBeforeUpgrade: true as const,
      originalRecreioColumnValuesPreserved: true as const,
      unrelatedTableDataPreserved: true as const,
      globalsPreserved: true as const,
      tablesBefore: antes.inventario.tabelas.length,
      tablesAfter: depois.tabelas.length,
      sourceDatabaseMutated: false as const,
      trafficAuthorized: false as const,
    };
  } finally {
    ocupadas.delete(copia);
  }
}
