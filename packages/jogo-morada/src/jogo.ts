import type {
  AcaoPedida,
  LoteId,
  MoradorId,
  ObjetoId,
  PontoMm,
  Resultado,
  VisaoDoCliente,
} from "@informach/morada-sim";
import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { AtivosProcedurais } from "./ativos/procedurais";
import { type AlvoClicado, Cena, type MedidasDaCena } from "./cena/cena";
import { Sessao } from "./espelho/sessao";
import type { JogoMontado, OpcoesDoMorada } from "./fonte";
import type { Controle } from "./hud/controle";
import { Hud } from "./hud/Hud";
import "./hud/hud.css";
import { nomeDoJogador } from "./modelo/retratos";

/**
 * O jogo montado: a sessão (rede, espelho, comandos), a cena e o HUD, ligados
 * uns aos outros. Este módulo só é carregado por `montarMorada`, sob demanda;
 * é daqui para dentro que ficam o three.js e o React do jogo.
 */

/** O que `window.__morada` expõe quando o jogo é montado com `depurar`. Só para testes. */
export type Depuracao = {
  /** O espelho do mundo, como está agora. */
  espelho(): VisaoDoCliente | null;
  jogadorId(): string | null;
  conexao(): string;
  tick(): number;
  meuMoradorId(): MoradorId | null;
  /** Onde cada morador foi desenhado no último quadro, na planta do lote. */
  posicoes(): Record<string, { loteId: LoteId; pos: [number, number] }>;
  medidas(): MedidasDaCena;
  /** Coordenadas de página de um ponto do chão, de um objeto e de um morador. */
  telaDoPonto(loteId: LoteId, pos: PontoMm): { x: number; y: number } | null;
  telaDoObjeto(objetoId: ObjetoId): { x: number; y: number } | null;
  telaDoMorador(moradorId: MoradorId): { x: number; y: number } | null;
  /** O que um clique nestas coordenadas de página acertaria na cena. */
  oQueHa(x: number, y: number): AlvoClicado | null;
  perderContexto(): boolean;
  restaurarContexto(): boolean;
  /** Derruba a conexão como a rede faria, sem avisar o servidor. */
  derrubarConexao(): void;
  /** Faz um pedido pelo mesmo caminho do HUD e devolve a resposta do servidor. */
  comandar(moradorId: MoradorId | null, acao: AcaoPedida): Promise<Resultado>;
};

declare global {
  interface Window {
    __morada?: Depuracao;
  }
}

const TECLAS_DA_CAMERA = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
]);

export function iniciarJogo(host: HTMLElement, opcoes: OpcoesDoMorada): JogoMontado {
  const raiz = document.createElement("div");
  raiz.className = "morada";
  const areaDaCena = document.createElement("div");
  areaDaCena.className = "morada-cena";
  const areaDoHud = document.createElement("div");
  raiz.append(areaDaCena, areaDoHud);
  host.appendChild(raiz);

  const sessao = new Sessao({ fonte: opcoes.fonte });
  const { loja } = sessao;
  const ativos = new AtivosProcedurais();
  let descartado = false;
  /** Um toque na cena com o menu aberto só fecha o menu. */
  let fechouMenu = false;

  const nome = (jogadorId: string): string =>
    loja.visao
      ? nomeDoJogador(loja.visao.presenca, jogadorId, { jogadorId: loja.jogador?.jogadorId ?? "" })
      : "outra pessoa";

  const cena = new Cena(areaDaCena, {
    sessao,
    ativos,
    nomeDoJogador: nome,
    aoTocar() {
      fechouMenu = loja.menu !== null;
      if (fechouMenu) loja.abrirMenu(null);
    },
    aoClicar(alvo, x, y) {
      if (fechouMenu || loja.conexao.fase === "encerrado") return;
      if (alvo.t === "chao") {
        const feito = sessao.irPara(alvo.pos);
        if (feito !== "sem_morador") {
          cena.marcarDestino(alvo.loteId, alvo.pos, feito !== "bloqueado");
        }
        return;
      }
      loja.abrirMenu({ alvo, x, y });
    },
  });

  const focarNaCena = () => {
    areaDaCena.querySelector("canvas")?.focus({ preventScroll: true });
  };

  const controle: Controle = {
    sessao,
    alternarParedes: () => loja.definirParedes(!loja.paredesBaixas),
    focarNoMeu() {
      if (!cena.focarNoMeu()) loja.avisar("info", "Você não dirige nenhum morador agora.");
    },
    focarNaCena,
    sair() {
      void sessao.sair().then(() => opcoes.aoSair?.());
    },
    voltar: opcoes.aoSair ? () => opcoes.aoSair?.() : null,
  };

  const hud = createRoot(areaDoHud);
  hud.render(createElement(Hud, { controle }));

  // --- Teclado: vale quando o foco está dentro do jogo ---

  const emControle = (alvo: EventTarget | null): boolean =>
    alvo instanceof HTMLElement &&
    alvo.closest("button, input, textarea, select, [role='menu']") !== null;

  const aoApertar = (evento: KeyboardEvent) => {
    if (evento.code === "Escape") {
      if (loja.menu) {
        loja.abrirMenu(null);
        focarNaCena();
      }
      return;
    }
    // Dentro de um botão ou do menu, as teclas são deles.
    if (emControle(evento.target)) return;
    if (TECLAS_DA_CAMERA.has(evento.code)) {
      cena.definirTecla(evento.code, true);
      evento.preventDefault();
      return;
    }
    if (evento.code === "Space" && !evento.repeat) {
      evento.preventDefault();
      const velocidade = loja.visao?.relogio.velocidade ?? 1;
      // Espaço pede a pausa; pausado, pede a volta ao ritmo normal.
      void sessao.comandar(null, { t: "votar_velocidade", velocidade: velocidade === 0 ? 1 : 0 });
    }
  };
  const aoSoltar = (evento: KeyboardEvent) => {
    cena.definirTecla(evento.code, false);
  };
  const aoPerderFoco = () => {
    for (const codigo of TECLAS_DA_CAMERA) cena.definirTecla(codigo, false);
  };
  raiz.addEventListener("keydown", aoApertar);
  raiz.addEventListener("keyup", aoSoltar);
  raiz.addEventListener("focusout", aoPerderFoco);

  if (opcoes.depurar) {
    const naPagina = (ponto: { x: number; y: number } | null) => {
      if (!ponto) return null;
      const caixa = areaDaCena.getBoundingClientRect();
      return { x: ponto.x + caixa.left, y: ponto.y + caixa.top };
    };
    window.__morada = {
      espelho: () => loja.visao,
      jogadorId: () => loja.jogador?.jogadorId ?? null,
      conexao: () => loja.conexao.fase,
      tick: () => sessao.tick(),
      meuMoradorId: () => loja.meuMoradorId(),
      posicoes: () => cena.posicoes(),
      medidas: () => cena.medir(),
      telaDoPonto: (loteId, pos) => naPagina(cena.telaDoPonto(loteId, pos)),
      telaDoObjeto: (objetoId) => naPagina(cena.telaDoObjeto(objetoId)),
      telaDoMorador: (moradorId) => naPagina(cena.telaDoMorador(moradorId)),
      oQueHa(x, y) {
        const caixa = areaDaCena.getBoundingClientRect();
        return cena.oQueHa(x - caixa.left, y - caixa.top);
      },
      perderContexto: () => cena.perderContexto(),
      restaurarContexto: () => cena.restaurarContexto(),
      derrubarConexao: () => sessao.conexao.derrubar(),
      comandar: (moradorId, acao) => sessao.comandar(moradorId, acao),
    };
  }

  // Quem hospeda o jogo fica sabendo a cada vez que o mundo aparece (a entrada
  // e cada volta depois de uma queda) e, uma vez, quando o jogo para sem a
  // pessoa ter pedido.
  let avisouDoFim = false;
  let faseAvisada = loja.conexao.fase;
  const pararDeOuvir = loja.subscribe(() => {
    const conexao = loja.conexao;
    if (conexao.fase !== faseAvisada) {
      faseAvisada = conexao.fase;
      if (conexao.fase === "pronto") opcoes.aoEntrar?.();
    }
    if (avisouDoFim || conexao.fase !== "encerrado" || conexao.motivo === "saiu") return;
    avisouDoFim = true;
    opcoes.aoEncerrar?.(conexao.motivo, conexao.detalhe);
  });

  sessao.iniciar();

  return {
    async dispose() {
      if (descartado) return;
      descartado = true;
      // Sai do mundo antes de soltar a tela: o servidor salva e libera a reserva na hora.
      // Quem desmonta não quer mais notícia: nem do fim que o próprio `dispose` provoca.
      pararDeOuvir();
      await sessao.sair();
      raiz.removeEventListener("keydown", aoApertar);
      raiz.removeEventListener("keyup", aoSoltar);
      raiz.removeEventListener("focusout", aoPerderFoco);
      cena.dispose();
      ativos.dispose();
      hud.unmount();
      raiz.remove();
      if (opcoes.depurar) delete window.__morada;
    },
  };
}
