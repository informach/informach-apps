import type { EstadoDoMundo, VisaoDoCliente } from "@informach/morada-sim";

/**
 * O espelho com a forma do estado do servidor, para as funções puras da
 * simulação (`ondeEsta`, `recusaDaInteracao`, `criarNavegador`...) trabalharem
 * nele sem conversão.
 *
 * As tabelas são as mesmas do espelho, por referência: nada é copiado. O que a
 * visão não traz (semente, agenda, comandos, contadores) entra vazio; as
 * funções que o cliente usa só leem tabelas, regras e acessos. O `tick` do
 * relógio é o que o cliente estima, porque a visão só o atualiza quando chega
 * um passo com mudanças.
 */
export function estadoDoEspelho(visao: VisaoDoCliente, tick: number): EstadoDoMundo {
  return {
    formato: "morada.mundo",
    versao: 1,
    id: visao.mundoId,
    semente: 0,
    relogio: {
      tick,
      velocidade: visao.relogio.velocidade,
      msDeJogoPorTick: visao.relogio.msDeJogoPorTick,
    },
    regras: visao.regras,
    bairros: visao.bairros,
    lotes: visao.lotes,
    imoveis: visao.imoveis,
    objetos: visao.objetos,
    familias: visao.familias,
    moradores: visao.moradores,
    relacoes: visao.relacoes,
    acoes: visao.acoes,
    gravidezes: visao.gravidezes,
    pedidos: visao.pedidos,
    quadro: visao.quadro,
    agenda: [],
    acessos: visao.acessos,
    memorias: visao.memorias,
    comandos: [],
    contadores: {},
    avancoDoDia: { dia: 0, gastoMs: {} },
  };
}
