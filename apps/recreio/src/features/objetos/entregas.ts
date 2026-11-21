import "server-only";
import { ErroDoRecreio } from "@informach/recreio";
import { FalhaDoObjetoPrivado } from "./criptografia";
import {
  confirmarEntregaDaFotografia,
  registrarFalhaDaEntrega,
  reservarEntregaDaFotografia,
} from "./entregas-repository";
import { type DestinoDeFotografias, FalhaDaEntregaDaFotografia } from "./fotografias-repository";
import { type criarArmazenamentoPrivadoS3, FalhaDoArmazenamentoPrivado } from "./s3";

/** Executor interno ainda sem rota/job/configuração de migração em produção.
 * Transporte é capacidade privada da composição; nunca parâmetro de navegador. */
export async function executarEntregaDaFotografia(
  id: string,
  destino: DestinoDeFotografias,
  transporte: Pick<ReturnType<typeof criarArmazenamentoPrivadoS3>, "enviar" | "bucketName">,
  signal?: AbortSignal,
) {
  if (transporte.bucketName !== destino.bucketName)
    throw new FalhaDaEntregaDaFotografia("DESTINO_DIVERGENTE");
  signal?.throwIfAborted();
  const reserva = await reservarEntregaDaFotografia(id, destino);
  if (reserva.tipo !== "trabalho") return reserva.tipo;
  const trabalho = reserva.trabalho;
  try {
    const confirmada = await transporte.enviar({
      referencia: trabalho.referencia,
      bytes: trabalho.envelope,
    });
    if (JSON.stringify(confirmada) !== JSON.stringify(trabalho.referencia))
      throw new FalhaDoArmazenamentoPrivado("INTEGRIDADE");
    signal?.throwIfAborted();
    if (await confirmarEntregaDaFotografia(trabalho, signal)) return "concluida";
    await registrarFalhaDaEntrega(trabalho, null);
    return "aguardando";
  } catch (erro) {
    if (
      erro instanceof FalhaDoObjetoPrivado &&
      (erro.codigo === "CONFIGURACAO" || erro.codigo === "LIMITE")
    ) {
      await registrarFalhaDaEntrega(trabalho, null);
      throw erro;
    }
    const chaveAusente =
      erro instanceof FalhaDoObjetoPrivado && erro.codigo === "CHAVE_INDISPONIVEL";
    const integridade =
      (erro instanceof FalhaDoObjetoPrivado && erro.codigo === "INTEGRIDADE") ||
      (erro instanceof FalhaDoArmazenamentoPrivado && erro.codigo === "INTEGRIDADE") ||
      erro instanceof FalhaDaEntregaDaFotografia ||
      erro instanceof ErroDoRecreio;
    if (chaveAusente || integridade) {
      await registrarFalhaDaEntrega(trabalho, chaveAusente ? "missing_key" : "integrity");
      return "revisao";
    }
    if (erro instanceof FalhaDoArmazenamentoPrivado) {
      await registrarFalhaDaEntrega(trabalho, null);
      if (erro.codigo === "CONFIGURACAO") throw erro;
      return "aguardando";
    }
    // Banco/auditoria/erro inesperado precisam falhar no job; a tentativa
    // durável permanece recuperável. Não marcar sucesso nem engolir a falha.
    throw erro;
  } finally {
    trabalho.envelope.fill(0);
  }
}
