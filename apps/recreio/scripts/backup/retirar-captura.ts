import "server-only";
import { isDeepStrictEqual } from "node:util";
import { FalhaDaPublicacao } from "./falha-controle";
import type { criarIndiceDeRecuperacao } from "./indice-recuperacao";
import type { criarArmazenamentoDoIndiceS3 } from "./indice-s3";
import {
  confirmarAusenciaDoBackup,
  confirmarMarcadorGuardado,
  lerRetirada,
  reagendarRetirada,
  type TentativaDeRetirada,
} from "./retirada-repository";
import type { criarRetiradaDoBackupS3 } from "./retirada-s3";

/** Rede fora das travas. Primeiro guardar/reler o marcador exato, depois
 * retirar/reler o payload, e só então confirmar ausência sob token atual.
 * Repetição conserva o marcador e os fatos históricos; não libera reservas. */
export async function retirarCapturaGuardada(config: {
  tentativa: TentativaDeRetirada;
  indice: ReturnType<typeof criarIndiceDeRecuperacao>;
  indices: ReturnType<typeof criarArmazenamentoDoIndiceS3>;
  transporte: ReturnType<typeof criarRetiradaDoBackupS3>;
}) {
  const { indice, indices, transporte } = config,
    tentativa = { ...config.tentativa },
    r = await lerRetirada(tentativa, indice);
  if (
    indices.bucketName !== r.destino.bucketName ||
    !isDeepStrictEqual(transporte.destino, r.destino)
  )
    throw new FalhaDaPublicacao("CONFIGURACAO");
  try {
    const voltou = await indices.registrarRetirada(r.bytes, tentativa.capturaId);
    if (!isDeepStrictEqual(voltou, r.marcador)) throw new FalhaDaPublicacao("INTEGRIDADE");
    await confirmarMarcadorGuardado(tentativa, r.bytes, indice);
    const admitida = await lerRetirada(tentativa, indice);
    if (admitida.estado !== "marked" && admitida.estado !== "absent")
      throw new FalhaDaPublicacao("ESTADO");
    const prova = await transporte.retirar(tentativa.capturaId, admitida.bytes);
    await confirmarAusenciaDoBackup(tentativa, prova.objetoEncontrado, indice);
  } catch (erro) {
    try {
      await reagendarRetirada(tentativa);
    } catch (reagendamento) {
      throw new AggregateError([erro, reagendamento], "RECREIO_BACKUP_RETIREMENT_AND_RETRY_FAILED");
    }
    throw erro;
  }
  return { capturaId: tentativa.capturaId, retirada: true };
}
