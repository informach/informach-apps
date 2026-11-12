import { MARCA_DO_CLIENTE, montarMorada } from "@informach/jogo-morada";
import type { ModuloDoJogo } from "@informach/recreio/sdk";
import { ligarMoradaAoRecreio } from "./morada-regra";

/**
 * O Morada na página do jogo: traduz o contrato da página (`ModuloDoJogo`)
 * para `montarMorada`, do pacote do cliente. Este arquivo só é baixado por
 * quem abre `/jogar/morada` (`features/jogar/carregadores.ts`), e é o único lugar
 * do portal que importa o pacote do jogo. O jogo de verdade (three.js, HUD,
 * CSS) vem por outro `import()`, dentro de `montarMorada`.
 *
 * Quem fala quando o jogo para está em `morada-regra.ts`. Aqui fica o que
 * mexe na tela: o elemento do jogo, o foco e a marca que o E2E procura.
 */
export const morada: ModuloDoJogo = {
  // O Morada tem "Sair" no trilho de ferramentas e nos cartões de entrada e de
  // reconexão: a página não desenha o botão dela por cima do relógio do jogo.
  saidaPropria: true,

  montar(host, contexto, opcoes) {
    const palco = document.createElement("div");
    palco.className = "absolute inset-0";
    // Só o código deste arquivo carrega a marca: o E2E a procura nos scripts de cada página.
    palco.dataset.jogo = MARCA_DO_CLIENTE;
    host.append(palco);

    const ponte = ligarMoradaAoRecreio(contexto, {
      mundoId: opcoes.mundoId,
      aoSair: opcoes.aoSair,
      aoFalhar: opcoes.aoFalhar,
      esconder() {
        palco.hidden = true;
      },
      aoEntrar() {
        // O teclado do jogo vale com o foco dentro dele. Quem ainda não pôs o
        // foco em lugar nenhum começa na cena; quem já escolheu um controle fica nele.
        const comFoco = document.activeElement;
        if (comFoco && comFoco !== document.body && !palco.contains(comFoco)) return;
        if (comFoco && palco.contains(comFoco) && comFoco.tagName !== "CANVAS") return;
        palco.querySelector("canvas")?.focus({ preventScroll: true });
      },
    });
    const jogo = montarMorada(palco, { ...ponte.opcoes, origemDaArte: opcoes.origemDaArte });

    return {
      async dispose() {
        ponte.desligar();
        await jogo.dispose();
        palco.remove();
      },
    };
  },
};
