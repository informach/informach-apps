import { randomUUID } from "node:crypto";
import { mkdtemp, open, realpath, rm, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import postgres from "postgres";
import { comBancoRestaurado, FalhaDoClusterIsolado } from "./cluster-isolado";
import { ambienteNativo, FalhaDaFerramentaNativa, ferramentaNativa } from "./ferramentas-nativas";
import { FalhaDosGlobaisPostgres } from "./globais-postgres";
import { FalhaDeInventario, inventariarBackup } from "./inventario";

const AMBIENTE = "174b2cb0-e1cd-410c-8764-d913e3af18d3";
const PROJETO = "f4da4285-5b98-48b5-b03e-5be02f4e7c56";

class FalhaDeEnsaio extends Error {
  constructor(readonly codigo: string) {
    super(codigo);
    this.name = "FalhaDeEnsaio";
  }
}

function origemAutorizada(): { url: URL; fixture: boolean } {
  if (process.platform !== "linux" || process.argv.length !== 2)
    throw new FalhaDeEnsaio("EXECUCAO_NAO_SUPORTADA");
  let url: URL;
  try {
    url = new URL(process.env.RECREIO_BACKUP_DATABASE_URL ?? "");
  } catch {
    throw new FalhaDeEnsaio("ORIGEM_INVALIDA");
  }
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.username ||
    !url.password ||
    url.pathname.length < 2 ||
    url.hash
  )
    throw new FalhaDeEnsaio("ORIGEM_INVALIDA");
  const fixture =
    process.env.CI === "true" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const producao =
    process.env.RAILWAY_PROJECT_ID === PROJETO &&
    process.env.RAILWAY_ENVIRONMENT_ID === AMBIENTE &&
    process.env.RECREIO_BACKUP_ENSAIO === "1" &&
    /^[a-z0-9-]+\.railway\.internal$/.test(url.hostname);
  if (!fixture && !producao) throw new FalhaDeEnsaio("ORIGEM_FORA_DO_ESCOPO");
  const ssl = fixture ? "disable" : "require";
  if (
    [...url.searchParams.keys()].some((chave) => chave !== "sslmode") ||
    (url.searchParams.has("sslmode") && url.searchParams.get("sslmode") !== ssl)
  )
    throw new FalhaDeEnsaio("OPCOES_DA_ORIGEM_NAO_SUPORTADAS");
  url.searchParams.set("sslmode", fixture ? "disable" : "require");
  return { url, fixture };
}

async function principal(): Promise<void> {
  process.umask(0o077);
  const { url, fixture } = origemAutorizada();
  delete process.env.RECREIO_BACKUP_DATABASE_URL;
  const inicio = performance.now();
  const operacao = randomUUID();
  const diretorio = await mkdtemp("/tmp/recreio-backup-");
  const absoluto = await realpath(diretorio);
  if (dirname(absoluto) !== "/tmp" || !/^recreio-backup-[a-zA-Z0-9]+$/.test(basename(absoluto)))
    throw new FalhaDeEnsaio("DIRETORIO_FORA_DO_ESCOPO");
  const arquivo = join(absoluto, "origem.dump");
  let fase = "origem";
  let destinoLimpo = true;
  let temporariosRemovidos = false;
  let origem: postgres.Sql | undefined;
  let resultado: Record<string, number | string | boolean> | undefined;
  let falha: unknown;
  console.log(JSON.stringify({ operacao, fase, estado: "iniciado" }));
  try {
    origem = postgres(url.href, {
      max: 1,
      prepare: false,
      ssl: fixture ? false : "require",
      connect_timeout: 15,
      idle_timeout: 1,
    });
    const preparado = await origem.begin(
      "isolation level repeatable read read only",
      async (tx) => {
        await tx`set local statement_timeout='15000ms'`;
        const [material] = await tx<
          { mundos: number; fotografias: number; id: string; instante: string }[]
        >`select
        (select count(*)::int from recreio.spaces) as mundos,
        (select count(*)::int from recreio.space_snapshots) as fotografias,
        pg_export_snapshot() as id, statement_timestamp()::text as instante`;
        if (!material || material.mundos < 1 || material.fotografias < 1)
          throw new FalhaDeEnsaio("MUNDO_PERSISTIDO_AUSENTE");
        const snapshot = material;
        if (!/^[A-Fa-f0-9-]+$/.test(snapshot.id)) throw new FalhaDeEnsaio("SNAPSHOT_INVALIDO");
        const instante = snapshot.instante;
        const inventario = await inventariarBackup(tx);
        if (
          Math.floor(inventario.versao / 10000) !== 18 ||
          inventario.banco.datlocprovider !== "c" ||
          inventario.banco.datctype !== inventario.banco.datcollate ||
          inventario.banco.encoding !== "UTF8"
        )
          throw new FalhaDeEnsaio("VERSAO_OU_LOCALE_NAO_SUPORTADO");
        fase = "backup";
        const inicioDoBackup = performance.now();
        const saida = await open(arquivo, "wx", 0o600);
        try {
          await ferramentaNativa(
            "pg_dump",
            ["--format=custom", `--snapshot=${snapshot.id}`],
            ambienteNativo({
              PGHOST: url.hostname.replace(/^\[|\]$/g, ""),
              PGPORT: url.port || "5432",
              PGUSER: decodeURIComponent(url.username),
              PGPASSWORD: decodeURIComponent(url.password),
              PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
              PGSSLMODE: fixture ? "disable" : "require",
              PGCONNECT_TIMEOUT: "15",
              PGOPTIONS: "-c default_transaction_read_only=on -c lock_timeout=2000",
            }),
            { saida: saida.fd },
          );
        } finally {
          await saida.close();
        }
        const backupMs = Math.round(performance.now() - inicioDoBackup);
        const bytes = (await stat(arquivo)).size;
        return { inventario, instante, backupMs, bytes };
      },
    );
    await origem.end({ timeout: 5 });
    origem = undefined;
    const { inventario: fatos, instante, backupMs, bytes } = preparado;
    if (bytes === 0) throw new FalhaDeEnsaio("BACKUP_AUSENTE");
    fase = "restaurar_cluster_isolado";
    destinoLimpo = false;
    const entrada = await open(arquivo, "r");
    let restauracao: Awaited<ReturnType<typeof comBancoRestaurado>>;
    try {
      // O helper abre o descritor herdado com offset próprio.
      await entrada.read(Buffer.alloc(1), 0, 1, null);
      restauracao = await comBancoRestaurado({ dump: entrada, inventario: fatos });
      destinoLimpo = restauracao.temporariosRemovidos;
    } finally {
      await entrada.close();
    }
    resultado = {
      operacao,
      ok: true,
      snapshotEm: instante,
      backupMs,
      restauracaoMs: restauracao.restauracaoMs,
      bytes,
      tabelas: fatos.tabelas.length,
      linhas: fatos.tabelas.reduce((s, t) => s + t.resumo.linhas, 0),
      versao: fatos.versao,
      conteudoIdentico: true,
      estruturaIdentica: true,
      globaisIdenticos: true,
      papeis: fatos.globais.papeis.length,
      participacoesEmPapeis: fatos.globais.membros.length,
    };
  } catch (erro) {
    if (erro instanceof FalhaDoClusterIsolado) destinoLimpo = erro.temporariosRemovidos;
    falha = erro;
  } finally {
    const encerramentos = await Promise.allSettled([origem?.end({ timeout: 5 })]);
    if (encerramentos.some((r) => r.status === "rejected"))
      falha ??= new FalhaDeEnsaio("CONEXAO_NAO_ENCERRADA");
    try {
      // O caminho absoluto foi conferido antes de criar qualquer arquivo.
      if ((await realpath(absoluto)) !== absoluto || dirname(absoluto) !== "/tmp") {
        falha ??= new FalhaDeEnsaio("LIMPEZA_FORA_DO_ESCOPO");
      } else {
        await rm(absoluto, { recursive: true });
        temporariosRemovidos = true;
      }
    } catch (erro) {
      falha ??= erro;
    }
  }
  temporariosRemovidos = temporariosRemovidos && destinoLimpo;
  if (falha || !resultado) {
    const codigo =
      falha instanceof FalhaDeEnsaio ||
      falha instanceof FalhaDeInventario ||
      falha instanceof FalhaDosGlobaisPostgres ||
      falha instanceof FalhaDoClusterIsolado ||
      falha instanceof FalhaDaFerramentaNativa
        ? falha.codigo
        : "ENSAIO_NAO_CONFIRMADO";
    console.error(JSON.stringify({ operacao, ok: false, fase, codigo, temporariosRemovidos }));
    process.exitCode = 1;
    return;
  }
  console.log(
    JSON.stringify({
      ...resultado,
      temporariosRemovidos,
      totalMs: Math.round(performance.now() - inicio),
    }),
  );
}

void principal().catch((erro: unknown) => {
  const codigo = erro instanceof FalhaDeEnsaio ? erro.codigo : "PREPARACAO_NAO_CONFIRMADA";
  console.error(JSON.stringify({ ok: false, codigo }));
  process.exitCode = 1;
});
