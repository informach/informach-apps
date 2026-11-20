import type { FileHandle } from "node:fs/promises";
import { lstat, mkdtemp, open, realpath, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

const NOMES = [
  "dump",
  "inventario",
  "fotografia",
  "composto",
  "cifrado",
  "readback",
  "recuperado",
  "aberto",
] as const;
export type ArquivosPrivadosDoBackup = Readonly<Record<(typeof NOMES)[number], FileHandle>>;
export class FalhaDosArquivosPrivados extends Error {
  constructor(
    readonly codigo: "AMBIENTE" | "DIRETORIO" | "ARQUIVO" | "LIMPEZA",
    cause?: unknown,
  ) {
    super(`recreio.backup_files.${codigo}`, { cause });
  }
}

/** One owned directory, fixed names and fresh handles for each capture or
 * reconciliation. No caller path, reopening of an existing output, truncation,
 * source credentials, or cleanup outside the verified /tmp child is allowed. */
export async function comArquivosPrivadosDoBackup<T>(
  executar: (arquivos: ArquivosPrivadosDoBackup) => Promise<T>,
): Promise<T> {
  if (process.platform !== "linux" || typeof process.getuid !== "function")
    throw new FalhaDosArquivosPrivados("AMBIENTE");
  const uid = process.getuid();
  const criado = await mkdtemp("/tmp/recreio-job-");
  const handles: FileHandle[] = [];
  let identidade: { dev: bigint; ino: bigint } | undefined;
  let resultado: { ok: true; valor: T } | { ok: false; erro: unknown };
  try {
    const absoluto = await realpath(criado),
      meta = await lstat(criado, { bigint: true });
    if (
      absoluto !== criado ||
      dirname(absoluto) !== "/tmp" ||
      !/^recreio-job-[A-Za-z0-9]+$/.test(basename(absoluto)) ||
      !meta.isDirectory() ||
      meta.isSymbolicLink() ||
      meta.uid !== BigInt(uid) ||
      (meta.mode & 0o077n) !== 0n
    )
      throw new FalhaDosArquivosPrivados("DIRETORIO");
    identidade = { dev: meta.dev, ino: meta.ino };
    const criar = async (nome: (typeof NOMES)[number]) => {
      const h = await open(join(criado, nome), "wx", 0o600);
      handles.push(h);
      const f = await h.stat({ bigint: true });
      if (
        !f.isFile() ||
        f.nlink !== 1n ||
        f.size !== 0n ||
        f.uid !== BigInt(uid) ||
        (f.mode & 0o077n) !== 0n
      )
        throw new FalhaDosArquivosPrivados("ARQUIVO");
      return h;
    };
    const arquivos = Object.freeze({
      dump: await criar("dump"),
      inventario: await criar("inventario"),
      fotografia: await criar("fotografia"),
      composto: await criar("composto"),
      cifrado: await criar("cifrado"),
      readback: await criar("readback"),
      recuperado: await criar("recuperado"),
      aberto: await criar("aberto"),
    });
    resultado = { ok: true, valor: await executar(arquivos) };
  } catch (erro) {
    resultado = { ok: false, erro };
  }
  const fechamentos = await Promise.allSettled(handles.map((h) => h.close()));
  let limpeza: unknown;
  try {
    const atual = await lstat(criado, { bigint: true });
    if (
      !identidade ||
      atual.dev !== identidade.dev ||
      atual.ino !== identidade.ino ||
      !atual.isDirectory() ||
      atual.isSymbolicLink() ||
      (await realpath(criado)) !== criado ||
      dirname(criado) !== "/tmp" ||
      !/^recreio-job-[A-Za-z0-9]+$/.test(basename(criado))
    )
      throw new FalhaDosArquivosPrivados("DIRETORIO");
    await rm(criado, { recursive: true });
  } catch (erro) {
    limpeza = erro;
  }
  if (limpeza || fechamentos.some((r) => r.status === "rejected")) {
    const causas = [
      ...fechamentos.filter((r) => r.status === "rejected").map((r) => r.reason),
      ...(limpeza ? [limpeza] : []),
      ...(!resultado.ok ? [resultado.erro] : []),
    ];
    throw new FalhaDosArquivosPrivados(
      "LIMPEZA",
      new AggregateError(causas, "BACKUP_OWNED_FILES_CLEANUP_FAILED"),
    );
  }
  if (!resultado.ok) throw resultado.erro;
  return resultado.valor;
}
