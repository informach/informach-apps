import type { FileHandle } from "node:fs/promises";
import { z } from "zod";
import { comCapturaConsistente } from "../../src/features/backup/captura-repository";
import { DestinoDeCapturaSchema, FalhaDaCaptura } from "../../src/features/backup/contrato";
import type { criarCifradorDeArquivos } from "./arquivo-cifrado";
import type { criarArquivoComposto } from "./arquivo-composto";
import type { criarTransporteDeArquivosS3 } from "./arquivo-s3";
import { conferirExecucaoDoBackup, type ExecucaoDoBackup } from "./execucao-exclusiva";
import type { criarIndiceDeRecuperacao } from "./indice-recuperacao";
import type { criarArmazenamentoDoIndiceS3 } from "./indice-s3";
import type { criarMontadorDaCaptura } from "./montar-captura";
import { liberarReservasPublicadas, prepararPublicacao } from "./publicacao-repository";
import { publicarCapturaGuardada } from "./publicar-captura";

/** Native operational composition. The caller owns empty private handles,
 * keys, concurrency and cleanup. A failure leaves the durable control state
 * available for reconciliation; it never guesses that a PUT did not happen,
 * retires an uncertain archive or retries with another encryption reference. */
export async function capturarEPublicarBackup(config: {
  execucao: ExecucaoDoBackup;
  origemObjetos: z.input<typeof DestinoDeCapturaSchema>;
  destinoArquivo: z.input<typeof DestinoDeCapturaSchema>;
  source: string;
  chavesFotografias: ReadonlyMap<string, Uint8Array>;
  montador: ReturnType<typeof criarMontadorDaCaptura>;
  cifrador: ReturnType<typeof criarCifradorDeArquivos>;
  composto: ReturnType<typeof criarArquivoComposto>;
  transporte: ReturnType<typeof criarTransporteDeArquivosS3>;
  indice: ReturnType<typeof criarIndiceDeRecuperacao>;
  indices: ReturnType<typeof criarArmazenamentoDoIndiceS3>;
  arquivos: {
    dump: FileHandle;
    inventario: FileHandle;
    fotografia: FileHandle;
    composto: FileHandle;
    cifrado: FileHandle;
    readback: FileHandle;
    recuperado: FileHandle;
    aberto: FileHandle;
  };
}) {
  await conferirExecucaoDoBackup(config.execucao);
  const origem = DestinoDeCapturaSchema.parse(config.origemObjetos),
    destino = DestinoDeCapturaSchema.parse(config.destinoArquivo),
    source = z
      .string()
      .regex(/^[a-f0-9]{40}$/)
      .parse(config.source);
  if (
    origem.escopo !== destino.escopo ||
    (destino.escopo === "production" &&
      (origem.bucketId === destino.bucketId || origem.bucketName === destino.bucketName)) ||
    config.transporte.bucketName !== destino.bucketName ||
    config.indices.bucketName !== destino.bucketName
  )
    throw new FalhaDaCaptura("CONFIGURACAO");
  // All writable capabilities are admitted before the first control write.
  // Never truncate a pre-existing file to turn it into an output handle.
  const identidades = new Set<string>();
  for (const h of Object.values(config.arquivos)) {
    const s = await h.stat({ bigint: true }),
      id = `${s.dev}:${s.ino}`;
    if (
      !s.isFile() ||
      s.nlink !== 1n ||
      s.size !== 0n ||
      (s.mode & 0o077n) !== 0n ||
      identidades.has(id)
    )
      throw new FalhaDaCaptura("CONFIGURACAO");
    identidades.add(id);
  }
  const a = config.arquivos;
  await conferirExecucaoDoBackup(config.execucao);
  const captura = await comCapturaConsistente(origem, (c) =>
    config.montador.montar(
      c,
      { dump: a.dump, inventario: a.inventario, fotografia: a.fotografia, composto: a.composto },
      config.chavesFotografias,
    ),
  );
  await conferirExecucaoDoBackup(config.execucao);
  const arquivo = await config.cifrador.cifrar(a.composto, a.cifrado, {
    tipo: "backup",
    id: captura.capturaId,
  });
  // The exact ciphertext identity is persisted before the network sees bytes.
  await conferirExecucaoDoBackup(config.execucao);
  const tentativa = await prepararPublicacao({
    capturaId: captura.capturaId,
    destino,
    source,
    arquivo,
    composto: captura,
  });
  await conferirExecucaoDoBackup(config.execucao);
  await config.transporte.enviar(arquivo, a.cifrado, a.readback);
  await conferirExecucaoDoBackup(config.execucao);
  await publicarCapturaGuardada({
    tentativa,
    destino,
    transporte: config.transporte,
    cifrador: config.cifrador,
    composto: config.composto,
    indice: config.indice,
    indices: config.indices,
    recuperado: a.recuperado,
    aberto: a.aberto,
  });
  // One bounded batch. Remaining holds are safe and belong to the reconciler;
  // publication success never implies an unbounded cleanup completed.
  await conferirExecucaoDoBackup(config.execucao);
  const reservasLiberadas = await liberarReservasPublicadas(captura.capturaId);
  await conferirExecucaoDoBackup(config.execucao);
  return { capturaId: captura.capturaId, publicada: true as const, reservasLiberadas };
}
