import { randomBytes } from "node:crypto";
import { chown, type FileHandle, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import postgres from "postgres";
import { ambienteNativo, FalhaDaFerramentaNativa, ferramentaNativa } from "./ferramentas-nativas";
import {
  FalhaDosGlobaisPostgres,
  GlobaisPostgresSchema,
  recriarGlobaisPostgres,
} from "./globais-postgres";
import {
  conferirInventarios,
  FalhaDeInventario,
  type InventarioDoBackup,
  inventariarBackup,
} from "./inventario";

const PORTA = 55432;
export class FalhaDoClusterIsolado extends Error {
  constructor(
    readonly codigo:
      | "CONFIGURACAO_DO_CLUSTER"
      | "DUMP_ALTERADO"
      | "LIMPEZA_DO_CLUSTER"
      | "CLUSTER_NAO_CONFIRMADO"
      | FalhaDaFerramentaNativa["codigo"]
      | FalhaDosGlobaisPostgres["codigo"]
      | FalhaDeInventario["codigo"],
    readonly temporariosRemovidos = true,
    causa?: unknown,
  ) {
    super(codigo, { cause: causa });
  }
}
const identificador = (v: string) => `"${v.replaceAll('"', '""')}"`;
const literal = (v: string) => `'${v.replaceAll("'", "''")}'`;
/** Cluster novo, sem TCP e com senha nova. Fonte é somente um handle regular
 * já conferido e seu inventário privado. Não aceita URL da origem. Callback só
 * começa depois de restaurar/conferir; conexões e arquivos pertencem ao escopo. */
export async function comBancoRestaurado(
  pedido: { dump: FileHandle; inventario: InventarioDoBackup; signal?: AbortSignal },
  executar: (copia: postgres.Sql) => Promise<void> = async () => undefined,
) {
  const { dump, signal } = pedido;
  const inventario = structuredClone(pedido.inventario);
  if (
    process.platform !== "linux" ||
    inventario.metodo !== "recreio-inventario-v2" ||
    inventario.versao !== 180006 ||
    inventario.banco.encoding !== "UTF8" ||
    inventario.banco.datlocprovider !== "c" ||
    inventario.banco.datctype !== inventario.banco.datcollate ||
    !GlobaisPostgresSchema.safeParse(inventario.globais).success
  )
    throw new FalhaDoClusterIsolado("CONFIGURACAO_DO_CLUSTER");
  const antes = await dump.stat({ bigint: true }),
    prefixo = Buffer.alloc(5);
  try {
    const r = await dump.read(prefixo, 0, 5, 0);
    if (
      !antes.isFile() ||
      antes.nlink !== 1n ||
      (antes.mode & 0o077n) !== 0n ||
      antes.size < 5n ||
      antes.size > 4294967296n ||
      r.bytesRead !== 5 ||
      prefixo.toString("ascii") !== "PGDMP"
    )
      throw new FalhaDoClusterIsolado("CONFIGURACAO_DO_CLUSTER");
  } finally {
    prefixo.fill(0);
  }
  if (signal?.aborted) throw new FalhaDoClusterIsolado("CONFIGURACAO_DO_CLUSTER");
  const inicio = performance.now(),
    pasta = await mkdtemp("/tmp/recreio-backup-"),
    absoluto = await realpath(pasta);
  if (dirname(absoluto) !== "/tmp" || !/^recreio-backup-[a-zA-Z0-9]+$/.test(basename(absoluto)))
    throw new FalhaDoClusterIsolado("CONFIGURACAO_DO_CLUSTER", false);
  const dados = join(absoluto, "cluster"),
    arquivoDaSenha = join(absoluto, "senha"),
    senha = randomBytes(32).toString("base64url"),
    nome = `recreio_restore_${randomBytes(12).toString("hex")}`;
  let inicioSolicitado = false,
    parado = false,
    removido = false,
    controle: postgres.Sql | undefined,
    copia: postgres.Sql | undefined,
    falha: unknown,
    houveFalha = false;
  try {
    await chown(absoluto, 999, 999);
    await writeFile(arquivoDaSenha, senha, { mode: 0o600 });
    await chown(arquivoDaSenha, 999, 999);
    await ferramentaNativa(
      "gosu",
      [
        "postgres",
        "initdb",
        "-D",
        dados,
        `--username=${inventario.globais.operador}`,
        "--encoding=UTF8",
        `--locale=${inventario.banco.datcollate}`,
        "--auth=scram-sha-256",
        `--pwfile=${arquivoDaSenha}`,
      ],
      ambienteNativo(),
      { signal },
    );
    inicioSolicitado = true;
    await ferramentaNativa(
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
      { signal },
    );
    const opcoes = {
      host: absoluto,
      port: PORTA,
      username: inventario.globais.operador,
      password: senha,
      ssl: false,
      max: 1,
      prepare: false,
      connect_timeout: 15,
      idle_timeout: 1,
    };
    controle = postgres({ ...opcoes, database: "postgres" });
    await recriarGlobaisPostgres(controle, inventario.globais, absoluto, PORTA);
    await controle.unsafe(
      `create database ${identificador(nome)} template template0 encoding ${literal(inventario.banco.encoding)} locale ${literal(inventario.banco.datcollate)}`,
    );
    await controle.end({ timeout: 5 });
    controle = undefined;
    // Abrir o descritor herdado via procfs dá ao leitor seu próprio offset,
    // preservando a posição e a posse do handle do chamador.
    await ferramentaNativa(
      "pg_restore",
      ["--exit-on-error", "--no-password", "--dbname", nome, "/proc/self/fd/0"],
      ambienteNativo({
        PGHOST: absoluto,
        PGPORT: String(PORTA),
        PGUSER: inventario.globais.operador,
        PGPASSWORD: senha,
        PGSSLMODE: "disable",
        PGCONNECT_TIMEOUT: "15",
        PGPASSFILE: "/dev/null",
        PGSERVICEFILE: "/dev/null",
      }),
      { entrada: dump.fd, signal },
    );
    const depois = await dump.stat({ bigint: true });
    if (
      depois.dev !== antes.dev ||
      depois.ino !== antes.ino ||
      depois.nlink !== 1n ||
      depois.size !== antes.size ||
      depois.mtimeNs !== antes.mtimeNs ||
      depois.ctimeNs !== antes.ctimeNs
    )
      throw new FalhaDoClusterIsolado("DUMP_ALTERADO");
    copia = postgres({ ...opcoes, database: nome });
    conferirInventarios(
      inventario,
      await copia.begin("isolation level repeatable read read only", inventariarBackup),
    );
    if (signal?.aborted) throw new FalhaDoClusterIsolado("CONFIGURACAO_DO_CLUSTER");
    await executar(copia);
    if (signal?.aborted) throw new FalhaDoClusterIsolado("CONFIGURACAO_DO_CLUSTER");
  } catch (e) {
    falha = e;
    houveFalha = true;
  } finally {
    const encerramentos = await Promise.allSettled([
      controle?.end({ timeout: 5 }),
      copia?.end({ timeout: 5 }),
    ]);
    if (encerramentos.some((r) => r.status === "rejected")) {
      falha = houveFalha
        ? new AggregateError(
            [falha, new FalhaDoClusterIsolado("LIMPEZA_DO_CLUSTER")],
            "backup_cluster.connections_failed",
          )
        : new FalhaDoClusterIsolado("LIMPEZA_DO_CLUSTER");
      houveFalha = true;
    }
    try {
      if (inicioSolicitado)
        await ferramentaNativa(
          "gosu",
          ["postgres", "pg_ctl", "-D", dados, "-m", "fast", "-w", "-t", "10", "stop"],
          ambienteNativo(),
        );
      parado = true;
      if ((await realpath(absoluto)) !== absoluto || dirname(absoluto) !== "/tmp") {
        falha = houveFalha
          ? new AggregateError(
              [falha, new FalhaDoClusterIsolado("LIMPEZA_DO_CLUSTER")],
              "backup_cluster.cleanup_path_failed",
            )
          : new FalhaDoClusterIsolado("LIMPEZA_DO_CLUSTER");
        houveFalha = true;
      } else {
        await rm(absoluto, { recursive: true });
        removido = true;
      }
    } catch (e) {
      falha = houveFalha ? new AggregateError([falha, e], "backup_cluster.cleanup_failed") : e;
      houveFalha = true;
    }
  }
  if (houveFalha) {
    const codigo =
      falha instanceof FalhaDoClusterIsolado ||
      falha instanceof FalhaDaFerramentaNativa ||
      falha instanceof FalhaDosGlobaisPostgres ||
      falha instanceof FalhaDeInventario
        ? falha.codigo
        : "CLUSTER_NAO_CONFIRMADO";
    throw new FalhaDoClusterIsolado(codigo, parado && removido, falha);
  }
  if (!parado || !removido) throw new FalhaDoClusterIsolado("LIMPEZA_DO_CLUSTER");
  return {
    conteudoIdentico: true,
    estruturaIdentica: true,
    globaisIdenticos: true,
    temporariosRemovidos: true,
    restauracaoMs: Math.round(performance.now() - inicio),
    papeis: inventario.globais.papeis.length,
    participacoesEmPapeis: inventario.globais.membros.length,
  };
}
