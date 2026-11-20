import { FalhaDoTransporteDeArquivo } from "./arquivo-s3";
import { conferirExecucaoDoBackup, type ExecucaoDoBackup } from "./execucao-exclusiva";
import { assumirPublicacao, liberarReservasPublicadas } from "./publicacao-repository";
import { publicarCapturaGuardada } from "./publicar-captura";
import { liberarReservasRetiradas, prepararRetirada } from "./retirada-repository";
import type { criarRetiradaDoBackupS3 } from "./retirada-s3";
import { retirarCapturaGuardada } from "./retirar-captura";

/** Reuses the exact durable ciphertext/IV/reference after the old lease ends.
 * Only an authenticated scoped GET classified as missing starts abandonment;
 * it still writes/re-reads the permanent signed tombstone and proves absence.
 * Network, corruption, key, SQL and audit failures are never absence receipts. */
export async function reconciliarPublicacaoDoBackup(config: {
  execucao: ExecucaoDoBackup;
  capturaId: string;
  publicacao: Omit<Parameters<typeof publicarCapturaGuardada>[0], "tentativa">;
  retirada: ReturnType<typeof criarRetiradaDoBackupS3>;
}) {
  const { execucao, publicacao } = config;
  await conferirExecucaoDoBackup(execucao);
  const tentativa = await assumirPublicacao(config.capturaId, publicacao.destino);
  await conferirExecucaoDoBackup(execucao);
  try {
    await publicarCapturaGuardada({ ...publicacao, tentativa });
  } catch (erro) {
    if (!(erro instanceof FalhaDoTransporteDeArquivo) || erro.codigo !== "NAO_ENCONTRADO")
      throw erro;
    await conferirExecucaoDoBackup(execucao);
    const retirada = await prepararRetirada(config.capturaId, "abandonado", publicacao.indice);
    await conferirExecucaoDoBackup(execucao);
    await retirarCapturaGuardada({
      tentativa: retirada,
      indice: publicacao.indice,
      indices: publicacao.indices,
      transporte: config.retirada,
    });
    await conferirExecucaoDoBackup(execucao);
    const reservasLiberadas = await liberarReservasRetiradas(config.capturaId, publicacao.indice);
    await conferirExecucaoDoBackup(execucao);
    return {
      situacao: "ausencia_confirmada" as const,
      capturaId: config.capturaId,
      reservasLiberadas,
    };
  }
  await conferirExecucaoDoBackup(execucao);
  const reservasLiberadas = await liberarReservasPublicadas(config.capturaId, publicacao.destino);
  await conferirExecucaoDoBackup(execucao);
  return { situacao: "publicada" as const, capturaId: config.capturaId, reservasLiberadas };
}
