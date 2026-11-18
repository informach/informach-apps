import { PERMISSAO_DE_VISITA_MAX_MS } from "../contrato/visitas";
import { ErroDoRecreio } from "../dominio/erros";

/**
 * Relógio monotônico do processo. Desconta o pedido inteiro da duração
 * restante informada pelo servidor, sem confiar no relógio civil do host.
 * Prazo já vencido é devolvido no passado e deve pausar os comandos.
 */
export function prazoLocalDaVisita(
  recibo: { agora: string; permissaoAte: string },
  pedido: { enviadoEm: number; recebidoEm: number },
): number {
  const duracao = Date.parse(recibo.permissaoAte) - Date.parse(recibo.agora);
  if (
    !Number.isFinite(duracao) ||
    duracao <= 0 ||
    duracao > PERMISSAO_DE_VISITA_MAX_MS ||
    !Number.isFinite(pedido.enviadoEm) ||
    !Number.isFinite(pedido.recebidoEm) ||
    pedido.enviadoEm < 0 ||
    pedido.recebidoEm < pedido.enviadoEm
  )
    throw new ErroDoRecreio("INDISPONIVEL");
  const prazo = pedido.enviadoEm + duracao;
  if (!Number.isFinite(prazo) || prazo <= pedido.enviadoEm) throw new ErroDoRecreio("INDISPONIVEL");
  return prazo;
}
