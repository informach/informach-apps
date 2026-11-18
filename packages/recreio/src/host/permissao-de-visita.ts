import {
  type EntradaDeVisitante,
  EntradaDeVisitanteSchema,
  type VisitaRenovada,
  VisitaRenovadaSchema,
} from "../contrato/visitas";
import { ErroDoRecreio } from "../dominio/erros";
import { prazoLocalDaVisita } from "./tempo-visita";

export type MedicaoDoPedido = { enviadoEm: number; recebidoEm: number };
export interface PermissaoDeVisita {
  readonly estado: "vigente" | "suspensa" | "encerrada";
  podeJogar(): boolean;
  suspender(): void;
  encerrar(): void;
  renovar(recibo: VisitaRenovada, medicao: MedicaoDoPedido): void;
}

/**
 * Guarda local de uma admissão real. Conferir ao receber comandos e novamente
 * na fila, antes de aplicá-los. Não concede renovação, persistência ou ACK.
 */
export function criarPermissaoDeVisita(
  entrada: EntradaDeVisitante,
  medicao: MedicaoDoPedido,
  opcoes: {
    agora: () => number;
    anfitriaoConectado: (presencaId: string) => boolean;
  },
): PermissaoDeVisita {
  const recibo = EntradaDeVisitanteSchema.parse(entrada);
  let prazo = prazoLocalDaVisita(recibo, medicao);
  let confirmada = true;
  let encerrada = false;
  let observadoEm = medicao.recebidoEm;
  let ultimaRespostaEm = medicao.recebidoEm;
  let ultimoEnvioEm = medicao.enviadoEm;

  function estado(): PermissaoDeVisita["estado"] {
    if (encerrada) return "encerrada";
    if (!opcoes.anfitriaoConectado(recibo.presencaDoAnfitriaoId)) {
      encerrada = true;
      return "encerrada";
    }
    const agora = opcoes.agora();
    if (!Number.isFinite(agora) || agora < observadoEm) {
      confirmada = false;
      return "suspensa";
    }
    observadoEm = agora;
    return confirmada && agora < prazo ? "vigente" : "suspensa";
  }

  return {
    get estado() {
      return estado();
    },
    podeJogar: () => estado() === "vigente",
    suspender() {
      confirmada = false;
    },
    encerrar() {
      encerrada = true;
      confirmada = false;
    },
    renovar(valor, pedido) {
      confirmada = false;
      if (encerrada) return;
      if (!opcoes.anfitriaoConectado(recibo.presencaDoAnfitriaoId)) {
        encerrada = true;
        return;
      }
      const renovada = VisitaRenovadaSchema.safeParse(valor);
      if (!renovada.success || renovada.data.sessaoDeVisitaId !== recibo.sessaoDeVisitaId)
        throw new ErroDoRecreio("INDISPONIVEL");
      if (renovada.data.estado === "perdida") {
        encerrada = true;
        return;
      }
      const novoPrazo = prazoLocalDaVisita(renovada.data, pedido);
      // Renovação anterior não pode ser aplicada depois de uma resposta mais nova.
      if (pedido.recebidoEm < ultimaRespostaEm || pedido.enviadoEm <= ultimoEnvioEm)
        throw new ErroDoRecreio("INDISPONIVEL");
      ultimaRespostaEm = pedido.recebidoEm;
      ultimoEnvioEm = pedido.enviadoEm;
      observadoEm = Math.max(observadoEm, pedido.recebidoEm);
      prazo = novoPrazo;
      confirmada = true;
    },
  };
}
