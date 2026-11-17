import { ehErroDoRecreio, type JogoMontado, type RecreioGameContext } from "@informach/recreio/sdk";

export type AvisoDaTroca = { texto: string; bloqueia: boolean };

/** Uma consulta por vez. Nenhum timer ou resposta tardia age sobre uma partida desmontada. */
export function observarTrocaDaPartida(
  contexto: RecreioGameContext,
  montado: JogoMontado,
  aoAvisar: (aviso: AvisoDaTroca | null) => void,
  aoFalhar: (erro: unknown) => void,
  aoCortar?: (motivo: "daily_limit" | "schedule" | "day_change") => void,
): () => void {
  let cancelado = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let processado: string | null = null;
  let ackSemResposta = false;
  let avisandoTempo = false;
  let pausa: ReturnType<typeof setTimeout> | null = null;
  const cancelarPausa = () => {
    if (pausa !== null) clearTimeout(pausa);
    pausa = null;
  };
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
      const inicio = performance.now();
      const controle = await contexto.sessao.controle();
      if (cancelado) return;
      cancelarPausa();
      if (
        !controle.pausada &&
        controle.checkpoint === null &&
        contexto.sessao.salvamento &&
        montado.finalizar &&
        aoCortar &&
        controle.tempo?.pausaEm &&
        controle.tempo.motivo &&
        controle.tempo.motivo !== "paused"
      ) {
        const motivo = controle.tempo.motivo;
        // A concessão assinada usa segundos inteiros; a previsão mantém a
        // precisão do orçamento e pode ficar uma fração de segundo depois.
        const corte = Math.floor(Date.parse(controle.tempo.pausaEm) / 1000) * 1000;
        const faltam = corte - Date.parse(controle.agora);
        if (faltam <= 600_000)
          pausa = setTimeout(
            () => {
              pausa = null;
              if (!cancelado) aoCortar(motivo);
            },
            Math.max(0, faltam - (performance.now() - inicio)),
          );
      }
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
        cancelarPausa();
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
    cancelarPausa();
    if (timer !== null) clearTimeout(timer);
  };
}
