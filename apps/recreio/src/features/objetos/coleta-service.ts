import "server-only";
import { isDeepStrictEqual } from "node:util";
import { type DestinoDeCaptura, DestinoDeCapturaSchema } from "@/features/backup/contrato";
import { FalhaDaColeta } from "./coleta-contrato";
import {
  admitirColeta,
  confirmarColeta,
  listarColetasDevidas,
  reagendarColeta,
} from "./coleta-repository";
import type { criarColetorDeObjetosS3 } from "./coleta-s3";

type Transporte = ReturnType<typeof criarColetorDeObjetosS3>;
export async function executarColeta(
  id: string,
  destino: DestinoDeCaptura,
  transporte: Transporte,
) {
  const alvo = DestinoDeCapturaSchema.safeParse(destino);
  if (!alvo.success || !isDeepStrictEqual(alvo.data, transporte.destino))
    throw new FalhaDaColeta("CONFIGURACAO");
  const t = await admitirColeta(id, alvo.data);
  if (!t) return "aguardando";
  try {
    const prova = await transporte.retirar(t);
    await confirmarColeta(t, prova.objetoEncontrado);
    return "retirada";
  } catch (erro) {
    try {
      await reagendarColeta(t);
    } catch (reagendamento) {
      throw new AggregateError([erro, reagendamento], "RECREIO_COLLECTION_AND_RETRY_FAILED");
    }
    throw erro;
  }
}
/** Falhas não impedem atender outros recibos; lote parcialmente falho continua
 * sendo falha operacional. Nenhuma rota/cron ativa este executor por padrão. */
export async function executarLoteDeColetas(destino: DestinoDeCaptura, transporte: Transporte) {
  const alvo = DestinoDeCapturaSchema.safeParse(destino);
  if (!alvo.success || !isDeepStrictEqual(alvo.data, transporte.destino))
    throw new FalhaDaColeta("CONFIGURACAO");
  const lote = await listarColetasDevidas(alvo.data),
    falhas: unknown[] = [];
  let retiradas = 0;
  for (const r of lote) {
    try {
      if ((await executarColeta(r.id, alvo.data, transporte)) === "retirada") retiradas++;
    } catch (e) {
      falhas.push(e);
    }
  }
  if (falhas.length) throw new AggregateError(falhas, "RECREIO_COLLECTION_BATCH_FAILED");
  return { selecionadas: lote.length, retiradas };
}
