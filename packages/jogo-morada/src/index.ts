import type { JogoMontado, OpcoesDoMorada } from "./fonte";

export type { FonteDoMundo, JogoMontado, MotivoDoEncerramento, OpcoesDoMorada } from "./fonte";

/**
 * Cliente do Morada. Carregado sob demanda pela rota `/jogar/morada` do
 * Recreio; nunca entra no bundle do portal.
 *
 * Esta marca existe para um teste conferir exatamente isso: ela não pode
 * aparecer em nenhuma página que não seja a do jogo.
 */
export const MARCA_DO_CLIENTE = "__MORADA_CLIENTE__";

/**
 * Monta o jogo dentro de `host`. Este arquivo não importa three.js nem o HUD:
 * o jogo de verdade vem por `import()` na hora de montar, para quem importa só
 * os tipos ou a marca não carregar nada disso.
 */
export function montarMorada(host: HTMLElement, opcoes: OpcoesDoMorada): JogoMontado {
  let descartado = false;
  const jogo = import("./jogo").then((modulo) =>
    descartado ? null : modulo.iniciarJogo(host, opcoes),
  );
  // Se o jogo não carrega (a rede caiu no meio do download), a pessoa fica sabendo.
  // Aqui ainda não há HUD nem CSS: é só um texto no lugar do jogo.
  jogo.catch(() => {
    if (!descartado) host.textContent = "Não foi possível carregar o jogo. Recarregue a página.";
  });
  return {
    async dispose() {
      descartado = true;
      const montado = await jogo.catch(() => null);
      await montado?.dispose();
    },
  };
}
