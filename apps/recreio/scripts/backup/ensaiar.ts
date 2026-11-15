import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { chown, mkdtemp, open, realpath, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import postgres from "postgres";
import { conferirInventarios, FalhaDeInventario, inventariarBackup } from "./inventario";

const AMBIENTE = "174b2cb0-e1cd-410c-8764-d913e3af18d3";
const PROJETO = "f4da4285-5b98-48b5-b03e-5be02f4e7c56";
const PORTA = 55432;

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

/** Nenhuma variável da origem é herdada pelos processos do destino. */
function ambienteNativo(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return { PATH: process.env.PATH, NODE_ENV: "production", LANG: "en_US.utf8", TZ: "UTC", ...extra };
}

async function ferramenta(
  programa: string,
  argumentos: string[],
  ambiente: NodeJS.ProcessEnv,
  saida?: number,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const filho = spawn(programa, argumentos, {
      env: ambiente,
      stdio: ["ignore", saida ?? "ignore", "pipe"],
      windowsHide: true,
    });
    let aviso = false;
    let terminou = false;
    const prazo = setTimeout(() => {
      filho.kill("SIGKILL");
    }, 180_000);
    filho.stderr?.on("data", (dados: Buffer) => {
      // Erros nativos podem incluir uma linha privada. Só a classificação sai.
      if (/\bwarning\b/i.test(dados.toString("utf8"))) aviso = true;
    });
    filho.once("error", () => {
      clearTimeout(prazo);
      terminou = true;
      reject(new FalhaDeEnsaio("FERRAMENTA_INDISPONIVEL"));
    });
    filho.once("close", (codigo) => {
      clearTimeout(prazo);
      if (terminou) return;
      terminou = true;
      if (codigo !== 0) reject(new FalhaDeEnsaio("FERRAMENTA_FALHOU"));
      else if (aviso) reject(new FalhaDeEnsaio("FERRAMENTA_COM_AVISO"));
      else resolve();
    });
  });
}

function citarIdentificador(valor: string): string {
  return `"${valor.replaceAll('"', '""')}"`;
}

function citarLiteral(valor: string): string {
  return `'${valor.replaceAll("'", "''")}'`;
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
  await chown(absoluto, 999, 999);
  const dados = join(absoluto, "cluster");
  const arquivo = join(absoluto, "origem.dump");
  const senha = randomBytes(32).toString("base64url");
  const arquivoDaSenha = join(absoluto, "senha");
  const destino = `recreio_restore_${randomBytes(12).toString("hex")}`;
  let fase = "origem";
  let inicioDoClusterSolicitado = false;
  let temporariosRemovidos = false;
  let origem: postgres.Sql | undefined;
  let copia: postgres.Sql | undefined;
  let controle: postgres.Sql | undefined;
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
        const papeis = await tx<{ rolname: string }[]>`select rolname from pg_roles
        where rolname !~ '^pg_' and rolname <> 'postgres' order by rolname`;
        fase = "backup";
        const inicioDoBackup = performance.now();
        const saida = await open(arquivo, "wx", 0o600);
        try {
          await ferramenta(
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
            saida.fd,
          );
        } finally {
          await saida.close();
        }
        const backupMs = Math.round(performance.now() - inicioDoBackup);
        const bytes = (await stat(arquivo)).size;
        return { inventario, papeis, instante, backupMs, bytes };
      },
    );
    await origem.end({ timeout: 5 });
    origem = undefined;
    const { inventario: fatos, papeis, instante, backupMs, bytes } = preparado;
    if (bytes === 0) throw new FalhaDeEnsaio("BACKUP_AUSENTE");
    const inicioDaRestauracao = performance.now();
    fase = "cluster_descartavel";
    await writeFile(arquivoDaSenha, senha, { mode: 0o600 });
    await chown(arquivoDaSenha, 999, 999);
    await ferramenta(
      "gosu",
      [
        "postgres",
        "initdb",
        "-D",
        dados,
        "--username=postgres",
        "--encoding=UTF8",
        `--locale=${fatos.banco.datcollate}`,
        "--auth=scram-sha-256",
        `--pwfile=${arquivoDaSenha}`,
      ],
      ambienteNativo(),
    );
    inicioDoClusterSolicitado = true;
    await ferramenta(
      "gosu",
      [
        "postgres",
        "pg_ctl",
        "-D",
        dados,
        "-l",
        join(absoluto, "postgres.log"),
        "-w",
        "-t",
        "30",
        "-o",
        `-c listen_addresses= -c unix_socket_directories=${absoluto} -p ${PORTA} -c shared_buffers=32MB -c max_connections=8 -c max_parallel_workers=0`,
        "start",
      ],
      ambienteNativo(),
    );
    const opcoes = {
      host: absoluto,
      port: PORTA,
      username: "postgres",
      password: senha,
      ssl: false,
      max: 1,
      prepare: false,
      connect_timeout: 15,
      idle_timeout: 1,
    };
    controle = postgres({ ...opcoes, database: "postgres" });
    for (const { rolname } of papeis)
      await controle.unsafe(`create role ${citarIdentificador(rolname)} nologin`);
    await controle.unsafe(`create database ${citarIdentificador(destino)} template template0
      encoding ${citarLiteral(fatos.banco.encoding)} locale ${citarLiteral(fatos.banco.datcollate)}`);
    await controle.end({ timeout: 5 });
    controle = undefined;
    fase = "restaurar";
    await ferramenta(
      "pg_restore",
      ["--exit-on-error", "--dbname", destino, arquivo],
      ambienteNativo({
        PGHOST: absoluto,
        PGPORT: String(PORTA),
        PGUSER: "postgres",
        PGPASSWORD: senha,
        PGSSLMODE: "disable",
        PGCONNECT_TIMEOUT: "15",
      }),
    );
    fase = "conferir";
    copia = postgres({ ...opcoes, database: destino });
    const restaurado = await copia.begin(
      "isolation level repeatable read read only",
      inventariarBackup,
    );
    conferirInventarios(fatos, restaurado);
    resultado = {
      operacao,
      ok: true,
      snapshotEm: instante,
      backupMs,
      restauracaoMs: Math.round(performance.now() - inicioDaRestauracao),
      bytes,
      tabelas: fatos.tabelas.length,
      linhas: fatos.tabelas.reduce((s, t) => s + t.resumo.linhas, 0),
      versao: fatos.versao,
      conteudoIdentico: true,
      estruturaIdentica: true,
    };
  } catch (erro) {
    falha = erro;
  } finally {
    const encerramentos = await Promise.allSettled([
      origem?.end({ timeout: 5 }),
      copia?.end({ timeout: 5 }),
      controle?.end({ timeout: 5 }),
    ]);
    if (encerramentos.some((r) => r.status === "rejected"))
      falha ??= new FalhaDeEnsaio("CONEXAO_NAO_ENCERRADA");
    try {
      if (inicioDoClusterSolicitado)
        await ferramenta(
          "gosu",
          ["postgres", "pg_ctl", "-D", dados, "-m", "fast", "-w", "-t", "10", "stop"],
          ambienteNativo(),
        );
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
  if (falha || !resultado) {
    const codigo =
      falha instanceof FalhaDeEnsaio || falha instanceof FalhaDeInventario
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
