import { createHash, randomBytes } from "node:crypto";
import type { FileHandle } from "node:fs/promises";
import { realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname } from "node:path";

/** Somente ferramentas de qualificação; não é domínio/entrada do serviço. */
export class FalhaDaProva extends Error {
  constructor(readonly codigo: string) {
    super(codigo);
  }
}
export function exigir(sim: unknown, codigo: string): asserts sim {
  if (!sim) throw new FalhaDaProva(codigo);
}
export async function gravarSintetico(h: FileHandle, tamanho: number) {
  exigir(
    Number.isSafeInteger(tamanho) && tamanho > 0 && tamanho <= 512 * 1024 * 1024,
    "TAMANHO_FORA_DO_ESCOPO",
  );
  const bloco = randomBytes(64 * 1024),
    hash = createHash("sha256");
  try {
    for (let pos = 0; pos < tamanho; pos += bloco.length) {
      const bytes = Math.min(bloco.length, tamanho - pos);
      let escrito = 0;
      while (escrito < bytes) {
        const r = await h.write(bloco, escrito, bytes - escrito, pos + escrito);
        exigir(r.bytesWritten > 0, "ESCRITA_INTERROMPIDA");
        escrito += r.bytesWritten;
      }
      hash.update(bloco.subarray(0, bytes));
    }
    await h.sync();
    return hash.digest("hex");
  } finally {
    bloco.fill(0);
  }
}
export async function resumoDoArquivo(h: FileHandle, teto = 512 * 1024 * 1024) {
  exigir(
    Number.isSafeInteger(teto) && teto > 0 && teto <= 512 * 1024 * 1024,
    "TETO_FORA_DO_ESCOPO",
  );
  const bloco = Buffer.alloc(64 * 1024),
    hash = createHash("sha256");
  let pos = 0;
  try {
    for (;;) {
      const { bytesRead } = await h.read(bloco, 0, bloco.length, pos);
      if (bytesRead === 0) return { bytes: pos, sha256: hash.digest("hex") };
      exigir(pos + bytesRead <= teto, "ARQUIVO_ACIMA_DO_TETO");
      hash.update(bloco.subarray(0, bytesRead));
      pos += bytesRead;
    }
  } finally {
    bloco.fill(0);
  }
}
export async function limparDiretorioDeProva(
  root: string,
  handles: FileHandle[],
  prefixo: "recreio-backup-arquivo-" | "recreio-backup-provider-",
) {
  const resultados = await Promise.allSettled(handles.map((h) => h.close()));
  exigir(
    resultados.every((r) => r.status === "fulfilled"),
    "HANDLE_NAO_FECHADO",
  );
  if (!root) return;
  const alvo = await realpath(root),
    pai = await realpath(tmpdir());
  exigir(dirname(alvo) === pai && basename(alvo).startsWith(prefixo), "LIMPEZA_FORA_DO_ESCOPO");
  await rm(alvo, { recursive: true, force: true });
}
