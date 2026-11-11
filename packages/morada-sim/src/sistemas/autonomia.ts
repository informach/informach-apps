import { CONTEUDO, comportamento, doCatalogo, interacao, necessidade } from "../conteudo";
import type { DefInteracao } from "../conteudo/esquema";
import { listar, obter } from "../dominio/tabela";
import type { Alvo, Mil, Morador, PontoMm } from "../dominio/tipos";
import {
  bebeNoColoDe,
  moradoresNoLote,
  type Onde,
  objetosDoLote,
  ondeEsta,
  PONTO_DENTRO,
  pontosLivres,
} from "../espaco/posicoes";
import { UM } from "../nucleo/fixo";
import { horaDoDiaMs } from "../nucleo/relogio";
import { sorteioAte } from "../nucleo/sorteio";
import { cancelarAcao, enfileirar, podeSerInterrompido } from "./acoes";
import type { Contexto } from "./contexto";
import { assumirTarefa } from "./cuidado";
import { recusaDaInteracao, temPontoLivre } from "./regras";

/**
 * Todo morador decide sozinho, com ou sem jogador. A escolha não é sorteio
 * puro: cada ação possível recebe uma pontuação pelo que promete, pela
 * urgência da necessidade e pelo custo do caminho, e a escolhida sai entre as
 * melhores. As regras duras (fase, permissões, recursos) vêm antes.
 */

/** Cada morador decide uma vez a cada dez ticks, em ticks diferentes. */
export const INTERVALO_DA_AUTONOMIA = 10;
/** Abaixo disto não vale a pena sair do lugar. */
const PONTUACAO_MINIMA = 180_000;
const MS_POR_HORA = 60 * 60 * 1000;
/** Acima deste nível a necessidade não motiva ninguém. */
const SATISFEITO = 850_000;
/** Abaixo deste nível uma necessidade interrompe o que a pessoa fazia por conta própria. */
const EMERGENCIA = 80_000;

type Candidato = { def: DefInteracao; alvo: Alvo; pontos: number };

/**
 * Quanto uma promessa interessa. Cresce com o quadrado da falta: um pouco de
 * fome quase não move ninguém, muita fome move muito. Abaixo do nível crítico
 * o interesse dobra.
 */
function desejo(nivel: Mil, promessa: Mil, critico: Mil): number {
  if (nivel >= SATISFEITO) return 0;
  const falta = UM - nivel;
  const ganho = Math.min(promessa, falta);
  const urgencia = nivel < critico ? 3000 : 1500;
  return Math.floor((Math.floor((ganho * falta) / UM) * urgencia) / 1000);
}

/** Fator da hora do dia, em milésimos. */
function fatorDaHora(def: DefInteracao, horaMs: number): number {
  const contexto = def.contexto;
  if (!contexto) return 1000;
  const hora = Math.floor(horaMs / MS_POR_HORA);
  const dentro =
    contexto.deHora <= contexto.ateHora
      ? hora >= contexto.deHora && hora < contexto.ateHora
      : hora >= contexto.deHora || hora < contexto.ateHora;
  return dentro ? contexto.dentro : contexto.fora;
}

function temUrgencia(morador: Morador): boolean {
  for (const id of Object.keys(morador.necessidades).sort()) {
    const def = necessidade(id);
    if (def && (morador.necessidades[id] ?? UM) < def.critico) return true;
  }
  return false;
}

function pontuar(
  def: DefInteracao,
  morador: Morador,
  soUrgencias: boolean,
  horaMs: number,
): number {
  let pontos = 0;
  let urgente = false;
  for (const anuncio of def.anuncia) {
    if (anuncio.quem === "alvo") continue;
    const nivel = morador.necessidades[anuncio.necessidade];
    const critico = necessidade(anuncio.necessidade)?.critico ?? 0;
    if (nivel === undefined) continue;
    if (nivel < critico) urgente = true;
    pontos += desejo(nivel, anuncio.valor, critico);
  }
  if (soUrgencias && !urgente) return 0;
  // A urgência do corpo não espera a hora certa.
  return urgente ? pontos : Math.floor((pontos * fatorDaHora(def, horaMs)) / 1000);
}

function candidatos(
  ctx: Contexto,
  morador: Morador,
  onde: Onde,
  soUrgencias: boolean,
): Candidato[] {
  const estado = ctx.estado;
  const tick = estado.relogio.tick;
  const visita = morador.familiaId === null;
  const horaMs = horaDoDiaMs(estado.relogio);
  // Primeiro o que cada opção promete, sem olhar o caminho. O caminho só
  // diminui a pontuação, então se nenhuma promessa chega ao mínimo não há por
  // que medir distância nenhuma, e medir é a parte cara.
  const possiveis: { def: DefInteracao; alvo: Alvo; ponto: PontoMm | null; base: number }[] = [];

  // A promessa depende só da interação e de quem decide: calcula uma vez por interação.
  const promessas = new Map<string, number>();
  const considerar = (def: DefInteracao, alvo: Alvo, ponto: PontoMm | null) => {
    let base = promessas.get(def.id);
    if (base === undefined) {
      base = pontuar(def, morador, soUrgencias, horaMs);
      promessas.set(def.id, base);
    }
    if (base < PONTUACAO_MINIMA) return;
    if (recusaDaInteracao(estado, def, morador, alvo, tick)) return;
    if (!temPontoLivre(estado, def, alvo)) return;
    possiveis.push({ def, alvo, ponto, base });
  };

  for (const def of CONTEUDO.interacoes) {
    if (!def.autonoma || !def.quem.includes(morador.fase)) continue;
    // Quem está de visita conversa; não usa a casa dos outros.
    if (visita && def.alvo !== "morador") continue;

    // Ação consigo mesmo não tem caminho: vale mesmo para quem está dentro do berço.
    if (def.alvo === "proprio") considerar(def, { t: "proprio" }, null);

    if (def.alvo === "objeto") {
      for (const objeto of objetosDoLote(estado, onde.loteId)) {
        const oferece = comportamento(doCatalogo(objeto.catalogo)?.comportamento ?? "")?.interacoes;
        if (!oferece?.includes(def.id)) continue;
        // O custo é medido até onde a pessoa fica, não até o centro do móvel.
        const navegador = ctx.navegador(onde.loteId);
        const lugar = pontosLivres(objeto, def.tipoDePonto ?? "")
          .map((ponto) => navegador.acesso(objeto, ponto))
          .find((acesso) => acesso !== null);
        if (lugar) considerar(def, { t: "objeto", objetoId: objeto.id }, lugar.pos);
      }
    }

    if (def.alvo === "morador") {
      for (const outro of moradoresNoLote(estado, onde.loteId, tick)) {
        if (outro.id === morador.id || !podeSerInterrompido(ctx, outro)) continue;
        const ondeOutro = ondeEsta(estado, outro, tick);
        if (ondeOutro) considerar(def, { t: "morador", moradorId: outro.id }, ondeOutro.pos);
      }
    }
  }
  if (possiveis.length === 0) return [];

  let campo: ((para: PontoMm) => number | null) | null = null;
  const saida: Candidato[] = [];
  for (const { def, alvo, ponto, base } of possiveis) {
    let custo: number | null = 0;
    if (ponto !== null) {
      campo ??= ctx.navegador(onde.loteId).custosDe(onde.pos);
      custo = campo(ponto);
    }
    if (custo === null) continue;
    // Dez metros de caminho cortam a pontuação pela metade.
    const pontos = Math.floor((base * 10_000) / (10_000 + custo));
    if (pontos > 0) saida.push({ def, alvo, pontos });
  }
  return saida;
}

function bercoLivreNoLote(ctx: Contexto, loteId: Onde["loteId"]) {
  return objetosDoLote(ctx.estado, loteId).find(
    (objeto) =>
      doCatalogo(objeto.catalogo)?.comportamento === "berco" &&
      objeto.ocupacao[PONTO_DENTRO] === undefined,
  );
}

function decidir(ctx: Contexto, morador: Morador, onde: Onde, dirigido: boolean): void {
  const estado = ctx.estado;

  // Bebê de colo: no berço, com sono, dorme. O resto depende de alguém.
  if (morador.fase === "colo") {
    const noBerco =
      morador.local.t === "objeto" &&
      doCatalogo(obter(estado.objetos, morador.local.objetoId)?.catalogo ?? "")?.comportamento ===
        "berco";
    if (noBerco && (morador.necessidades.sono ?? UM) < 700_000) {
      enfileirar(ctx, morador, {
        interacao: "dormir_no_berco",
        alvo: { t: "proprio" },
        origem: "autonomia",
      });
    }
    return;
  }

  const urgencia = temUrgencia(morador);

  // Cuidar do bebê vem antes do próprio lazer. Quem é dirigido por um jogador
  // só assume sozinho o que está no limite.
  if (assumirTarefa(ctx, morador, urgencia || dirigido)) return;

  // Com um bebê no colo e uma urgência (ou o bebê com sono), acomoda o bebê primeiro.
  const bebe = bebeNoColoDe(estado, morador.id);
  if (bebe) {
    const comSono = (bebe.necessidades.sono ?? UM) < 600_000;
    if (urgencia || comSono) {
      const berco = bercoLivreNoLote(ctx, onde.loteId);
      if (berco) {
        enfileirar(ctx, morador, {
          interacao: "por_no_berco",
          alvo: { t: "objeto", objetoId: berco.id },
          origem: "autonomia",
        });
        return;
      }
      if (urgencia) {
        enfileirar(ctx, morador, {
          interacao: "por_no_chao",
          alvo: { t: "proprio" },
          origem: "autonomia",
        });
        return;
      }
    }
  }

  const opcoes = candidatos(ctx, morador, onde, dirigido).sort(
    (a, b) => b.pontos - a.pontos || a.def.classe - b.def.classe || (a.def.id < b.def.id ? -1 : 1),
  );
  const melhor = opcoes[0];
  if (!melhor || melhor.pontos < PONTUACAO_MINIMA) return;

  // Entre as que ficam a até dez por cento da melhor, um sorteio que se repete igual.
  const boas = opcoes.filter((opcao) => opcao.pontos * 10 >= melhor.pontos * 9);
  const escolha = boas[
    sorteioAte(boas.length, estado.semente, "autonomia", morador.id, estado.relogio.tick)
  ] as Candidato;
  enfileirar(ctx, morador, { interacao: escolha.def.id, alvo: escolha.alvo, origem: "autonomia" });
}

/**
 * Quem dorme ou se distrai por conta própria larga o que faz quando outra
 * necessidade chega ao limite: acorda com fome, sai da TV para o banheiro.
 */
function acordarSePreciso(ctx: Contexto, morador: Morador): void {
  if (!morador.acaoAtual || morador.fila.length > 0) return;
  const acao = obter(ctx.estado.acoes, morador.acaoAtual);
  const def = acao ? interacao(acao.interacao) : undefined;
  if (!acao || !def || acao.origem !== "autonomia" || acao.estado !== "executando") return;
  if (!def.interruptivel || !("ate" in def.duracao)) return;
  const atendidas = new Set(def.anuncia.map((anuncio) => anuncio.necessidade));
  for (const id of Object.keys(morador.necessidades).sort()) {
    if (atendidas.has(id)) continue;
    if ((morador.necessidades[id] ?? UM) < EMERGENCIA) {
      cancelarAcao(ctx, acao.id);
      return;
    }
  }
}

export function passoDaAutonomia(ctx: Contexto): void {
  const estado = ctx.estado;
  const tick = estado.relogio.tick;
  listar(estado.moradores).forEach((morador, indice) => {
    if ((tick + indice) % INTERVALO_DA_AUTONOMIA !== 0) return;
    acordarSePreciso(ctx, morador);
    if (morador.acaoAtual || morador.fila.length > 0) return;
    if (morador.local.t === "colo" || morador.local.t === "fora") return;
    const onde = ondeEsta(estado, morador, tick);
    if (!onde) return;
    const dirigido = ctx.presenca.reservas.some((reserva) => reserva.moradorId === morador.id);
    decidir(ctx, morador, onde, dirigido);
  });
}
