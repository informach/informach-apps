import type postgres from "postgres";
import { comArquivosPrivadosDoBackup } from "./arquivos-privados";
import { FalhaDaFerramentaNativa } from "./ferramentas-nativas";
import { conferirInventarios, inventariarBackup } from "./inventario";
import { exigirBancoPrivadoDeRecuperacao } from "./normalizar-fotografias";
import { exigir } from "./provas-arquivos";
import {
  type ArquivoDeSchemaPrivado,
  FalhaDoSchemaPrivado,
  type FerramentasNativasDeSchema,
} from "./schema-nativo-privado";
import { serializarSchemaRecreioPrivado } from "./serializar-schema-privado";

/** Native, private staging proof. The third cluster models the current shared
 * target; importing here never replaces its globals or admits public traffic.
 * The source's name is restored and the imported staging schema is removed. */
export async function provarEstagioNativoPrivado(
  fonte: postgres.Sql,
  atual: postgres.Sql,
  origem: FerramentasNativasDeSchema,
  destino: FerramentasNativasDeSchema,
) {
  let etapa = "INICIO";
  await exigirBancoPrivadoDeRecuperacao(fonte);
  await exigirBancoPrivadoDeRecuperacao(atual);
  const inventario = (s: postgres.Sql) =>
    s.begin("isolation level repeatable read read only", inventariarBackup);
  const antes = await inventario(fonte),
    globais = await inventario(atual);
  const tabelas = antes.tabelas.filter((t) => t.schema === "recreio");
  exigir(tabelas.length > 0, `SCHEMA_ESTAGIO_${etapa}`);
  const [raiz] = await atual.unsafe<{ ausente: boolean }[]>(
    "select to_regnamespace('recreio') is null as ausente",
  );
  exigir(raiz?.ausente, `SCHEMA_ESTAGIO_${etapa}`);
  return comArquivosPrivadosDoBackup(async ({ dump }) => {
    etapa = "DUMP";
    const prova = await serializarSchemaRecreioPrivado(fonte, origem, dump);
    conferirInventarios(antes, await inventario(fonte));
    conferirInventarios(globais, await inventario(atual));
    async function recusar(fn: () => Promise<unknown>, codigo: FalhaDoSchemaPrivado["codigo"]) {
      let recusou = false;
      try {
        await fn();
      } catch (e) {
        if (!(e instanceof FalhaDoSchemaPrivado) || e.codigo !== codigo) throw e;
        recusou = true;
      }
      exigir(recusou, `SCHEMA_ESTAGIO_${etapa}`);
    }
    etapa = "COPIA";
    await recusar(() => origem.importar(prova), "DESTINO");
    await recusar(() => destino.importar({ ...prova }), "EXPIRADO");
    etapa = "CORRUPCAO";
    const byte = Buffer.alloc(1);
    await dump.read(byte, 0, 1, 0);
    const original = byte[0];
    exigir(original !== undefined, `SCHEMA_ESTAGIO_${etapa}`);
    byte[0] = original ^ 0xff;
    await dump.write(byte, 0, 1, 0);
    try {
      await recusar(() => destino.importar(prova), "ARQUIVO");
    } finally {
      byte[0] = original;
      await dump.write(byte, 0, 1, 0);
      byte.fill(0);
    }
    conferirInventarios(globais, await inventario(atual));

    // The harness owns a max:1 SQL pool. A manually bounded transaction keeps
    // a real conflicting lock while pg_restore uses its independent socket.
    // Cancel only its observed native backend while it waits on the lock;
    // pg_restore resets server timeouts itself. The whole import must roll back.
    etapa = "CANCELAMENTO";
    await atual.unsafe("begin");
    let rollback = false;
    const cancelamento = new AbortController();
    let importacao: Promise<unknown> | undefined;
    let terminou = false;
    try {
      await atual.unsafe("set local transaction_timeout='15000ms'");
      await atual.unsafe("lock table core.users in access exclusive mode");
      importacao = destino.importar(prova, cancelamento.signal).then(
        () => {
          terminou = true;
          return { ok: true as const };
        },
        (erro: unknown) => {
          terminou = true;
          return { ok: false as const, erro };
        },
      );
      const fim = performance.now() + 5000;
      let cancelou = false;
      while (performance.now() < fim && !cancelou && !terminou) {
        await atual.unsafe("select pg_stat_clear_snapshot()");
        const alvos = await atual.unsafe<
          { pid: number }[]
        >(`select pid from pg_catalog.pg_stat_activity
          where datname=current_database() and usename=current_user and pid<>pg_backend_pid()
            and application_name='recreio-schema-privado' and wait_event_type='Lock'`);
        exigir(alvos.length <= 1, `SCHEMA_ESTAGIO_${etapa}`);
        if (alvos[0]) {
          const [r] = await atual.unsafe<{ cancelado: boolean }[]>(
            "select pg_cancel_backend($1) as cancelado",
            [alvos[0].pid],
          );
          cancelou = r?.cancelado === true;
        } else await new Promise((resolve) => setTimeout(resolve, 25));
      }
      exigir(cancelou, `SCHEMA_ESTAGIO_${etapa}`);
      const r = await importacao;
      rollback =
        typeof r === "object" &&
        r !== null &&
        "ok" in r &&
        !r.ok &&
        "erro" in r &&
        r.erro instanceof FalhaDaFerramentaNativa &&
        r.erro.codigo === "FERRAMENTA_FALHOU";
    } finally {
      cancelamento.abort();
      await atual.unsafe("rollback");
      await importacao;
    }
    etapa = "ROLLBACK";
    exigir(rollback, `SCHEMA_ESTAGIO_${etapa}`);
    conferirInventarios(globais, await inventario(atual));

    let criado: string | undefined;
    let resultado: { ok: true } | { ok: false; erro: unknown };
    try {
      etapa = "IMPORTACAO";
      const r = await destino.importar(prova);
      exigir(!r.trafegoAutorizado && r.sha256 === prova.sha256, `SCHEMA_ESTAGIO_${etapa}`);
      const [n] = await atual.unsafe<{ oid: string }[]>(
        "select oid::text as oid from pg_catalog.pg_namespace where nspname=$1",
        [prova.schema],
      );
      exigir(n && /^[0-9]+$/.test(n.oid), `SCHEMA_ESTAGIO_${etapa}`);
      criado = n.oid;
      const depois = await inventario(atual);
      etapa = "CONTEUDO";
      const importadas = depois.tabelas
        .filter((t) => t.schema === prova.schema)
        .map((t) => ({ ...t, schema: "recreio" }));
      exigir(JSON.stringify(importadas) === JSON.stringify(tabelas), `SCHEMA_ESTAGIO_${etapa}`);
      exigir(
        JSON.stringify(depois.tabelas.filter((t) => t.schema !== prova.schema)) ===
          JSON.stringify(globais.tabelas),
        `SCHEMA_ESTAGIO_${etapa}`,
      );
      etapa = "REPETICAO";
      const conferido = await inventario(atual);
      await recusar(() => destino.importar(prova), "DESTINO");
      conferirInventarios(conferido, await inventario(atual));
      resultado = { ok: true };
    } catch (erro) {
      resultado = { ok: false, erro };
    }
    try {
      etapa = "LIMPEZA";
      if (criado) await removerEstagio(atual, prova, criado);
    } catch (erro) {
      throw new AggregateError(
        [erro, ...(!resultado.ok ? [resultado.erro] : [])],
        "Private staging cleanup failed",
      );
    }
    if (!resultado.ok) throw resultado.erro;
    conferirInventarios(globais, await inventario(atual));
    conferirInventarios(antes, await inventario(fonte));
    etapa = "EXPIRACAO";
    origem.encerrar();
    await recusar(() => destino.importar(prova), "EXPIRADO");
    return {
      privateSchemaNativeDumpVerified: true,
      privateSchemaNativeImportVerified: true,
      privateSchemaImportedTables: tabelas.length,
      privateSchemaCurrentGlobalsPreserved: true,
      privateSchemaSourceNameRestored: true,
      privateSchemaCopyAndDestinationRefused: true,
      privateSchemaCorruptionRefused: true,
      privateSchemaImportRollbackVerified: true,
      privateSchemaScopeExpired: true,
      privateSchemaStageRemoved: true,
      privateSelectivePublicationProven: false,
    };
  });
}

async function removerEstagio(atual: postgres.Sql, prova: ArquivoDeSchemaPrivado, oid: string) {
  await atual.begin(async (tx) => {
    await tx.unsafe("set local statement_timeout='5000ms'");
    await tx.unsafe("set local transaction_timeout='15000ms'");
    await tx.unsafe("set local client_min_messages='warning'");
    const [seguro] = await tx.unsafe<{ valido: boolean }[]>(
      `select n.oid::text=$2 as valido
      from pg_catalog.pg_namespace n where n.nspname=$1 and not exists(
        select 1 from pg_catalog.pg_constraint c join pg_catalog.pg_class t on t.oid=c.conrelid
        join pg_catalog.pg_class r on r.oid=c.confrelid
        where c.contype='f' and r.relnamespace=n.oid and t.relnamespace<>n.oid)`,
      [prova.schema, oid],
    );
    exigir(
      seguro?.valido && /^recreio_stage_[a-f0-9]{24}$/.test(prova.schema),
      "SCHEMA_ESTAGIO_LIMPEZA",
    );
    await tx.unsafe(`drop schema "${prova.schema}" cascade`);
  });
}
