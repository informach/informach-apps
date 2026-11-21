import { createHash } from "node:crypto";
import type { FileHandle } from "node:fs/promises";
import type postgres from "postgres";
import { ambienteNativo, ferramentaNativa } from "./ferramentas-nativas";
import { exigirBancoPrivadoDeRecuperacao } from "./normalizar-fotografias";

export class FalhaDoSchemaPrivado extends Error {
  constructor(readonly codigo: "ESCOPO" | "ARQUIVO" | "DESTINO" | "EXPIRADO") {
    super(`recreio.private_schema.${codigo}`);
  }
}
export type ArquivoDeSchemaPrivado = Readonly<{
  formato: "recreio-schema-privado-v1";
  schema: string;
  sha256: string;
  bytes: number;
  trafegoAutorizado: false;
}>;
type Origem = { host: string; port: number; username: string; password: string; database: string };
const provas = new WeakMap<
  ArquivoDeSchemaPrivado,
  {
    arquivo: FileHandle;
    dev: bigint;
    ino: bigint;
    source: string;
    ativo: () => boolean;
    vence: number;
  }
>();
const nomeValido = (nome: string) => /^recreio_stage_[a-f0-9]{24}$/.test(nome);
const MAX_BYTES = 1024 ** 3;

async function conferirArquivo(arquivo: FileHandle, vazio = false) {
  const stat = await arquivo.stat({ bigint: true });
  if (
    !stat.isFile() ||
    stat.nlink !== 1n ||
    typeof process.getuid !== "function" ||
    stat.uid !== BigInt(process.getuid()) ||
    (stat.mode & 0o077n) !== 0n ||
    stat.size < (vazio ? 0n : 5n) ||
    stat.size > BigInt(MAX_BYTES) ||
    (vazio && stat.size !== 0n)
  )
    throw new FalhaDoSchemaPrivado("ARQUIVO");
  return stat;
}
async function resumo(arquivo: FileHandle) {
  const stat = await conferirArquivo(arquivo),
    hash = createHash("sha256"),
    buffer = Buffer.alloc(128 * 1024);
  const fim = performance.now() + 30000;
  let posicao = 0;
  try {
    while (posicao < Number(stat.size)) {
      if (performance.now() >= fim) throw new FalhaDoSchemaPrivado("ARQUIVO");
      const { bytesRead } = await arquivo.read(
        buffer,
        0,
        Math.min(buffer.length, Number(stat.size) - posicao),
        posicao,
      );
      if (!bytesRead || (posicao === 0 && buffer.toString("ascii", 0, 5) !== "PGDMP"))
        throw new FalhaDoSchemaPrivado("ARQUIVO");
      hash.update(buffer.subarray(0, bytesRead));
      posicao += bytesRead;
    }
    const depois = await conferirArquivo(arquivo);
    if (
      stat.dev !== depois.dev ||
      stat.ino !== depois.ino ||
      stat.size !== depois.size ||
      stat.mtimeNs !== depois.mtimeNs
    )
      throw new FalhaDoSchemaPrivado("ARQUIVO");
    return { stat: depois, sha256: hash.digest("hex"), bytes: posicao };
  } finally {
    buffer.fill(0);
  }
}

/** Created by the native cluster owner after the authenticated full restore.
 * The password stays in this closure and child environment. Only a generated
 * staging schema is accepted; no public/shared destination or arbitrary dump
 * can be admitted through the export token. Closing the cluster expires it. */
export async function criarFerramentasNativasDeSchema(copia: postgres.Sql, origem: Origem) {
  const local = await exigirBancoPrivadoDeRecuperacao(copia);
  const [operador] = await copia.unsafe<{ nome: string }[]>("select current_user::text as nome");
  if (
    local.socket !== origem.host ||
    local.banco !== origem.database ||
    origem.port !== 55432 ||
    operador?.nome !== origem.username ||
    !/^[A-Za-z0-9_-]{43}$/.test(origem.password)
  )
    throw new FalhaDoSchemaPrivado("ESCOPO");
  const host = origem.host,
    database = origem.database,
    username = origem.username;
  let ativo = true,
    senha = origem.password;
  const identidade = `${host}/${database}`;
  async function conferir() {
    if (!ativo) throw new FalhaDoSchemaPrivado("EXPIRADO");
    const atual = await exigirBancoPrivadoDeRecuperacao(copia);
    if (atual.socket !== host || atual.banco !== database) throw new FalhaDoSchemaPrivado("ESCOPO");
  }
  const ambiente = () =>
    ambienteNativo({
      PGHOST: host,
      PGPORT: "55432",
      PGDATABASE: database,
      PGUSER: username,
      PGPASSWORD: senha,
      PGSSLMODE: "disable",
      PGCONNECT_TIMEOUT: "5",
      PGAPPNAME: "recreio-schema-privado",
    });
  return Object.freeze({
    async exportar(schema: string, arquivo: FileHandle): Promise<ArquivoDeSchemaPrivado> {
      await conferir();
      if (!nomeValido(schema)) throw new FalhaDoSchemaPrivado("ESCOPO");
      const [existe] = await copia.unsafe<{ existe: boolean }[]>(
        "select to_regnamespace($1) is not null as existe",
        [schema],
      );
      if (!existe?.existe) throw new FalhaDoSchemaPrivado("ESCOPO");
      await conferirArquivo(arquivo, true);
      await ferramentaNativa(
        "pg_dump",
        [
          "--format=custom",
          "--no-owner",
          "--no-privileges",
          "--no-password",
          "--strict-names",
          "--schema",
          schema,
          "--dbname",
          database,
          "--file",
          "/proc/self/fd/1",
        ],
        ambiente(),
        { saida: arquivo.fd, signal: AbortSignal.timeout(60000) },
      );
      await conferir();
      const r = await resumo(arquivo);
      const prova = Object.freeze({
        formato: "recreio-schema-privado-v1" as const,
        schema,
        sha256: r.sha256,
        bytes: r.bytes,
        trafegoAutorizado: false as const,
      });
      provas.set(prova, {
        arquivo,
        dev: r.stat.dev,
        ino: r.stat.ino,
        source: identidade,
        ativo: () => ativo,
        vence: performance.now() + 120000,
      });
      return prova;
    },
    async importar(prova: ArquivoDeSchemaPrivado, signal?: AbortSignal) {
      await conferir();
      const admitida = provas.get(prova);
      if (!admitida?.ativo() || performance.now() >= admitida.vence)
        throw new FalhaDoSchemaPrivado("EXPIRADO");
      if (admitida.source === identidade || !nomeValido(prova.schema))
        throw new FalhaDoSchemaPrivado("DESTINO");
      const [existe] = await copia.unsafe<{ existe: boolean }[]>(
        "select to_regnamespace($1) is not null as existe",
        [prova.schema],
      );
      if (existe?.existe !== false) throw new FalhaDoSchemaPrivado("DESTINO");
      const r = await resumo(admitida.arquivo);
      if (
        r.stat.dev !== admitida.dev ||
        r.stat.ino !== admitida.ino ||
        r.sha256 !== prova.sha256 ||
        r.bytes !== prova.bytes
      )
        throw new FalhaDoSchemaPrivado("ARQUIVO");
      // The opaque token admits only our unchanged native one-schema dump.
      // pg_restore -n excludes entries without a namespace, including CREATE
      // SCHEMA. Restore this already scoped archive so its root is created in
      // the same transaction as its tables/data/constraints; no --clean/-C.
      await ferramentaNativa(
        "pg_restore",
        [
          "--exit-on-error",
          "--single-transaction",
          "--no-owner",
          "--no-privileges",
          "--no-password",
          "--dbname",
          database,
          "/proc/self/fd/0",
        ],
        ambiente(),
        {
          entrada: admitida.arquivo.fd,
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(60000)])
            : AbortSignal.timeout(60000),
        },
      );
      await conferir();
      if (!admitida.ativo() || performance.now() >= admitida.vence)
        throw new FalhaDoSchemaPrivado("EXPIRADO");
      return Object.freeze({
        schema: prova.schema,
        sha256: prova.sha256,
        bytes: prova.bytes,
        trafegoAutorizado: false as const,
      });
    },
    encerrar() {
      ativo = false;
      senha = "";
    },
  });
}
export type FerramentasNativasDeSchema = Awaited<
  ReturnType<typeof criarFerramentasNativasDeSchema>
>;
