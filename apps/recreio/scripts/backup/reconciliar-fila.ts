import { isDeepStrictEqual } from "node:util";
import type { DestinoDeCaptura } from "@/features/backup/contrato";
import { abandonarCapturaSemArquivo, liberarReservasSemArquivo } from "./abandono-repository";
import { comArquivosPrivadosDoBackup } from "./arquivos-privados";
import { conferirExecucaoDoBackup, type ExecucaoDoBackup } from "./execucao-exclusiva";
import { FalhaDaPublicacao } from "./falha-controle";
import { listarPendenciasDoBackup } from "./fila-repository";
import { avaliarPoliticaDoBackup, conferirParametrosDaPolitica } from "./politica-repository";
import { liberarReservasPublicadas } from "./publicacao-repository";
import { reconciliarPublicacaoDoBackup } from "./reconciliar-publicacao";
import {
  assumirRetirada,
  liberarReservasRetiradas,
  listarRetiradasDevidas,
  prepararRetiradaPorRetencao,
} from "./retirada-repository";
import { retirarCapturaGuardada } from "./retirar-captura";

type Contexto = Parameters<typeof reconciliarPublicacaoDoBackup>[0];
export class FalhaDaFilaDoBackup extends Error {
  readonly codigo = "PENDENCIAS";
  constructor(
    readonly resumo: {
      observadas: number;
      abandonadas: number;
      publicadas: number;
      retiradas: number;
      reservasLiberadas: number;
      falhas: number;
    },
    erros: readonly unknown[],
  ) {
    super("recreio.backup_queue.PENDENCIAS", {
      cause: new AggregateError(erros, "BACKUP_QUEUE_PHASES_FAILED"),
    });
  }
}

/** One bounded pass over native queues, under the genuine coordinator lock.
 * Each publication gets fresh private files with awaited cleanup. Failures
 * leave durable native state, allow other due items to progress and fail the
 * overall job. Lost/expired coordinator authority stops before another item.
 * No new capture, retention decision, guessed absence, cron or traffic here. */
export async function reconciliarFilaDoBackup(config: {
  execucao: ExecucaoDoBackup;
  fotografias: DestinoDeCaptura;
  publicacao: Omit<Contexto["publicacao"], "recuperado" | "aberto">;
  retirada: Contexto["retirada"];
  politica?: { intervaloSegundos: number; retencaoDias: number };
}) {
  const { execucao, publicacao, retirada } = config;
  await conferirExecucaoDoBackup(execucao);
  if (config.politica) conferirParametrosDaPolitica(config.politica);
  if (
    publicacao.transporte.bucketName !== publicacao.destino.bucketName ||
    publicacao.indices.bucketName !== publicacao.destino.bucketName ||
    !isDeepStrictEqual(retirada.destino, publicacao.destino)
  )
    throw new FalhaDaPublicacao("CONFIGURACAO");
  const fila = await listarPendenciasDoBackup({
    fotografias: config.fotografias,
    arquivos: publicacao.destino,
  });
  const devidas = await listarRetiradasDevidas(publicacao.destino);
  await conferirExecucaoDoBackup(execucao);
  const resumo = {
    observadas: Object.values(fila).reduce((n, v) => n + v.length, devidas.length),
    abandonadas: 0,
    publicadas: 0,
    retiradas: 0,
    reservasLiberadas: 0,
    falhas: 0,
  };
  const erros: unknown[] = [];
  const item = async (executar: () => Promise<void>) => {
    await conferirExecucaoDoBackup(execucao);
    try {
      await executar();
    } catch (erro) {
      erros.push(erro);
      resumo.falhas++;
    }
    await conferirExecucaoDoBackup(execucao);
  };
  for (const r of fila.semArquivo)
    await item(async () => {
      await abandonarCapturaSemArquivo(r.id, config.fotografias);
      await conferirExecucaoDoBackup(execucao);
      resumo.abandonadas++;
      resumo.reservasLiberadas += await liberarReservasSemArquivo(r.id, config.fotografias);
    });
  for (const r of fila.reservasAbandonadas)
    await item(async () => {
      resumo.reservasLiberadas += await liberarReservasSemArquivo(r.id, config.fotografias);
    });
  for (const r of fila.reservasPublicadas)
    await item(async () => {
      resumo.reservasLiberadas += await liberarReservasPublicadas(r.id, publicacao.destino);
    });
  for (const r of fila.reservasRetiradas)
    await item(async () => {
      resumo.reservasLiberadas += await liberarReservasRetiradas(r.id, publicacao.indice);
    });
  for (const r of fila.publicacoes)
    await item(async () => {
      const resultado = await comArquivosPrivadosDoBackup(async (arquivos) => {
        await conferirExecucaoDoBackup(execucao);
        return reconciliarPublicacaoDoBackup({
          execucao,
          capturaId: r.id,
          retirada,
          publicacao: { ...publicacao, recuperado: arquivos.recuperado, aberto: arquivos.aberto },
        });
      });
      resumo.reservasLiberadas += resultado.reservasLiberadas;
      if (resultado.situacao === "publicada") resumo.publicadas++;
      else resumo.retiradas++;
    });
  for (const r of devidas)
    await item(async () => {
      const tentativa = await assumirRetirada(r.id, publicacao.destino);
      await conferirExecucaoDoBackup(execucao);
      await retirarCapturaGuardada({
        tentativa,
        indice: publicacao.indice,
        indices: publicacao.indices,
        transporte: retirada,
      });
      await conferirExecucaoDoBackup(execucao);
      resumo.retiradas++;
      resumo.reservasLiberadas += await liberarReservasRetiradas(r.id, publicacao.indice);
    });
  let cobertura:
    | {
        capturaNecessaria: boolean;
        idadeDaUltimaCapturaSegundos: number | null;
        retencoesPendentes: number;
      }
    | undefined;
  if (config.politica) {
    const alvo = {
      ...config.politica,
      fotografias: config.fotografias,
      arquivos: publicacao.destino,
    };
    const politica = await avaliarPoliticaDoBackup(alvo);
    for (const r of politica.retencoes)
      await item(async () => {
        const tentativa = await prepararRetiradaPorRetencao(
          r.id,
          publicacao.destino,
          alvo.retencaoDias,
          publicacao.indice,
        );
        await conferirExecucaoDoBackup(execucao);
        await retirarCapturaGuardada({
          tentativa,
          indice: publicacao.indice,
          indices: publicacao.indices,
          transporte: retirada,
        });
        await conferirExecucaoDoBackup(execucao);
        resumo.retiradas++;
        resumo.reservasLiberadas += await liberarReservasRetiradas(r.id, publicacao.indice);
      });
    await conferirExecucaoDoBackup(execucao);
    const atual = await avaliarPoliticaDoBackup(alvo);
    await conferirExecucaoDoBackup(execucao);
    cobertura = {
      capturaNecessaria: atual.capturaNecessaria,
      idadeDaUltimaCapturaSegundos: atual.idadeDaUltimaCapturaSegundos,
      retencoesPendentes: atual.retencoes.length,
    };
  }
  if (erros.length) throw new FalhaDaFilaDoBackup({ ...resumo }, erros);
  return { ...resumo, ...cobertura };
}
