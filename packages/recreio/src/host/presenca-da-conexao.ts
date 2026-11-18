import type { ClienteDoHostComPresencas } from "../contrato/host";
import {
  ConsultaDePresencaSchema,
  type ReciboDePresenca,
  type RenovacaoDePresenca,
} from "../contrato/presencas";
import { ErroDoRecreio } from "../dominio/erros";
import { MundoIdSchema } from "../dominio/ids";

export type OpcoesDaPresencaDaConexao = {
  host: Pick<ClienteDoHostComPresencas, "atestarPresenca" | "consultarPresenca">;
  entrada: Omit<RenovacaoDePresenca, "presencaId"> & { chaveDeEntrada: string };
  /** Consulta o socket e a participação atual, inclusive depois de cada espera. */
  estaConectado: () => boolean;
};

export interface PresencaDaConexao {
  /** Fato técnico; sozinho não autoriza convite, visita ou comandos. */
  readonly recibo: ReciboDePresenca | null;
  /** Recibo fechado confirmado, ou conexão encerrada antes de qualquer tentativa. */
  readonly concluida: boolean;
  atualizar(): Promise<void>;
  /** Irreversível nesta conexão; nunca cria uma presença para descobrir seu recibo. */
  encerrar(): Promise<void>;
  /** O chamador agrupa até 64 pedidos e só renova sockets realmente conectados. */
  renovacao(): RenovacaoDePresenca | null;
}

/**
 * Uma chave por conexão física admitida. Não possui timer, banco nem retry
 * automático. O batimento do host chama atualizar e agrupa as renovações.
 * Resposta incerta conserva a chave até consulta/encerramento confirmados.
 */
export function criarPresencaDaConexao(opcoes: OpcoesDaPresencaDaConexao): PresencaDaConexao {
  const { mundoId, ...consulta } = opcoes.entrada;
  const mundo = MundoIdSchema.parse(mundoId),
    pedido = ConsultaDePresencaSchema.parse(consulta);
  let recibo: ReciboDePresenca | null = null;
  let tentada = false;
  let encerrando = false;
  let concluida = false;
  let fila: Promise<void> = Promise.resolve();

  function receber(valor: ReciboDePresenca): void {
    if (recibo && recibo.presencaId !== valor.presencaId) throw new ErroDoRecreio("INDISPONIVEL");
    recibo = { ...valor };
    if (valor.estado === "closed") concluida = true;
  }

  async function consultar(): Promise<void> {
    const resultado = await opcoes.host.consultarPresenca({ mundoId: mundo, ...pedido });
    if (resultado.presenca) receber(resultado.presenca);
    // null não é prova de que uma transação anterior ainda em voo não vá gravar.
  }

  async function fechar(): Promise<void> {
    if (concluida) return;
    if (!tentada && !recibo) {
      concluida = true;
      return;
    }
    if (!recibo) await consultar();
    if (!recibo || concluida) return;
    const fechado = await opcoes.host.atestarPresenca({
      mundoId: mundo,
      operacao: "sair",
      cerca: pedido.cerca,
      presencaId: recibo.presencaId,
    });
    if (fechado.estado !== "closed") throw new ErroDoRecreio("INDISPONIVEL");
    receber(fechado);
  }

  async function executar(): Promise<void> {
    if (concluida) return;
    if (!opcoes.estaConectado()) encerrando = true;
    if (encerrando) return fechar();
    if (!recibo) {
      if (tentada) await consultar();
      if (concluida) return;
      if (!opcoes.estaConectado() || encerrando) {
        encerrando = true;
        return fechar();
      }
      if (!recibo) {
        tentada = true;
        receber(
          await opcoes.host.atestarPresenca({ mundoId: mundo, operacao: "entrar", ...pedido }),
        );
      }
    }
    if (!opcoes.estaConectado() || encerrando) {
      encerrando = true;
      await fechar();
    }
  }

  function enfileirar(): Promise<void> {
    const tarefa = fila.then(executar);
    // Só recupera a fila. O chamador recebe a rejeição original desta operação.
    fila = tarefa.then(
      () => undefined,
      () => undefined,
    );
    return tarefa;
  }

  return {
    get recibo() {
      return recibo ? { ...recibo } : null;
    },
    get concluida() {
      return concluida;
    },
    atualizar: enfileirar,
    encerrar() {
      // A intenção vale imediatamente, inclusive para uma entrada ainda em voo.
      encerrando = true;
      return enfileirar();
    },
    renovacao() {
      if (concluida || encerrando || !opcoes.estaConectado() || !recibo) return null;
      return {
        mundoId: mundo,
        cerca: pedido.cerca,
        sid: pedido.sid,
        perfilId: pedido.perfilId,
        presencaId: recibo.presencaId,
      };
    },
  };
}
