import { ehErroDoRecreio, type JogoMontado, type RecreioGameContext } from "@informach/recreio/sdk";

export type AvisoDaTroca = { texto: string; bloqueia: boolean };

/** Uma consulta por vez. Nenhum timer ou resposta tardia age sobre uma partida desmontada. */
export function observarTrocaDaPartida(
  contexto: RecreioGameContext,
  montado: JogoMontado,
  aoAvisar: (aviso: AvisoDaTroca | null) => void,
  aoFalhar: (erro: unknown) => void,
): () => void {
  let cancelado = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let processado: string | null = null;
  let ackSemResposta = false;
  let avisandoTempo = false;
  const avisar = (aviso: AvisoDaTroca | null) => {
    if (!cancelado) aoAvisar(aviso);
  };
  const pausada = () =>
    avisar({
      texto: "Progresso salvo. A partida está pausada para continuar no outro aparelho.",
      bloqueia: true,
    });

  async function consultar() {
    try {
      const controle = await contexto.sessao.controle();
      if (cancelado) return;
      if (!controle.pausada && controle.checkpoint === null && !ackSemResposta) {
        const faltam = controle.tempo?.pausaEm
          ? Date.parse(controle.tempo.pausaEm) - Date.parse(controle.agora)
          : Infinity;
        if (faltam > 0 && faltam <= 600_000) {
          const minutos = Math.ceil(faltam / 60_000);
          avisar({
            texto: `Faltam cerca de ${minutos} ${minutos === 1 ? "minuto" : "minutos"} para a pausa. Salve pelo jogo antes do fim do tempo.`,
            bloqueia: false,
          });
          avisandoTempo = true;
        } else if (avisandoTempo) {
          avisar(null);
          avisandoTempo = false;
        }
      }
      if (controle.pausada) {
        ackSemResposta = false;
        pausada();
      } else if (
        controle.checkpoint?.estado === "requested" &&
        controle.checkpoint.id !== processado
      ) {
        const pedido = controle.checkpoint;
        if (!montado.checkpoint) {
          avisar({
            texto: "Para continuar no outro aparelho, salve e saia pelo jogo neste aparelho.",
            bloqueia: false,
          });
          processado = pedido.id;
          return;
        }
        avisar({ texto: "Salvando antes de trocar de aparelho…", bloqueia: true });
        let salvo = false;
        try {
          salvo = await montado.checkpoint({ id: pedido.id, modo: pedido.modo });
        } catch {
          salvo = false;
        }
        if (cancelado) return;
        ackSemResposta = true;
        const resultado =
          pedido.modo === "profile"
            ? await contexto.sessao.checkpoint(pedido.id, salvo)
            : await contexto.sessao.controle();
        if (cancelado) return;
        // O booleano do cliente de mundo não é recibo: só o controle servidor confirma.
        if ("checkpoint" in resultado && !resultado.pausada && resultado.checkpoint !== null) {
          avisar({
            texto: "Ainda não foi possível confirmar a troca. Mantenha esta página aberta.",
            bloqueia: true,
          });
          return;
        }
        processado = pedido.id;
        if (resultado.pausada) {
          ackSemResposta = false;
          pausada();
        } else {
          montado.retomar?.();
          ackSemResposta = false;
          avisar({
            texto:
              "A troca não foi confirmada. Confira o progresso neste aparelho e tente novamente no outro.",
            bloqueia: false,
          });
        }
      } else if (ackSemResposta && controle.checkpoint === null) {
        montado.retomar?.();
        ackSemResposta = false;
        avisar({
          texto: "A troca não foi concluída. A partida continua neste aparelho.",
          bloqueia: false,
        });
      }
    } catch (erro) {
      if (cancelado) return;
      if (
        ehErroDoRecreio(erro) &&
        erro.codigo !== "INDISPONIVEL" &&
        erro.codigo !== "MUITAS_TENTATIVAS"
      ) {
        cancelado = true;
        aoFalhar(erro);
        return;
      }
      if (ackSemResposta)
        avisar({
          texto: "Ainda não foi possível confirmar a troca. Mantenha esta página aberta.",
          bloqueia: true,
        });
    } finally {
      if (!cancelado)
        timer = setTimeout(() => {
          timer = null;
          void consultar();
        }, 3000);
    }
  }
  void consultar();
  return () => {
    cancelado = true;
    if (timer !== null) clearTimeout(timer);
  };
}
