import { necessidadesDaFase } from "../conteudo";
import { listar, obter } from "../dominio/tabela";
import type { Morador } from "../dominio/tipos";
import { ondeEsta } from "../espaco/posicoes";
import { proporcao, UM } from "../nucleo/fixo";
import { cancelarAcao, enfileirar, podeSerInterrompido } from "./acoes";
import { apresentar, type Contexto, tocar } from "./contexto";
import { darSensacao, somarNecessidade } from "./efeitos";

/**
 * As necessidades esvaziam com o tempo de jogo. Abaixo do nível crítico viram
 * sensação, e a sensação entra no humor, que é calculado e nunca salvo. Quando
 * chegam a zero, o corpo decide: quem não dorme cai no sono onde está, quem
 * não vai ao banheiro tem um acidente.
 */

/** O decaimento é aplicado a cada dez ticks, para o arredondamento não pesar. */
export const INTERVALO_DAS_NECESSIDADES = 10;

const MS_POR_HORA = 60 * 60 * 1000;
/** Prazo de uma sensação que dura enquanto a causa durar. */
const SEM_PRAZO = 9_000_000_000_000;

function atualizarSensacoes(ctx: Contexto, morador: Morador): void {
  const tick = ctx.estado.relogio.tick;
  const forma = () => morador.sensacoes.map((s) => `${s.id}:${s.ateTick}`).join(",");
  const antes = forma();
  morador.sensacoes = morador.sensacoes.filter((s) => s.ateTick > tick);
  for (const def of necessidadesDaFase(morador.fase)) {
    const nivel = morador.necessidades[def.id] ?? UM;
    const sentida = morador.sensacoes.find((s) => s.id === def.sensacao);
    if (nivel < def.critico) {
      // A sensação da necessidade dura enquanto ela estiver crítica: não tem
      // prazo, e sai quando a necessidade se recupera.
      if (sentida) sentida.ateTick = SEM_PRAZO;
      else morador.sensacoes.push({ id: def.sensacao, ateTick: SEM_PRAZO });
    } else if (sentida) {
      morador.sensacoes = morador.sensacoes.filter((s) => s.id !== def.sensacao);
    }
  }
  if (forma() !== antes) tocar(ctx, "moradores", morador.id);
}

function aoZerar(ctx: Contexto, morador: Morador): void {
  const tick = ctx.estado.relogio.tick;
  const loteId = ondeEsta(ctx.estado, morador, tick)?.loteId ?? null;

  if (morador.necessidades.bexiga === 0) {
    somarNecessidade(morador, "bexiga", UM);
    somarNecessidade(morador, "higiene", -600_000);
    darSensacao(ctx, morador, "sujo", 120);
    apresentar(ctx, { t: "acidente", loteId, moradorId: morador.id });
  }

  if (morador.necessidades.energia === 0) {
    const atual = morador.acaoAtual ? obter(ctx.estado.acoes, morador.acaoAtual) : undefined;
    const jaDormindo = atual && /^(dormir|cochilar)/.test(atual.interacao);
    if (!jaDormindo && morador.fase !== "pequeno" && podeSerInterrompido(ctx, morador)) {
      if (morador.acaoAtual) cancelarAcao(ctx, morador.acaoAtual);
      const acao = enfileirar(ctx, morador, {
        interacao: "dormir_no_chao",
        alvo: { t: "proprio" },
        origem: "autonomia",
      });
      // Passa à frente do que estava na fila.
      morador.fila.splice(morador.fila.indexOf(acao.id), 1);
      morador.fila.unshift(acao.id);
    }
  }
}

export function passoDasNecessidades(ctx: Contexto): void {
  const { tick, msDeJogoPorTick } = ctx.estado.relogio;
  if (tick % INTERVALO_DAS_NECESSIDADES !== 0) return;
  const intervaloMs = msDeJogoPorTick * INTERVALO_DAS_NECESSIDADES;

  for (const morador of listar(ctx.estado.moradores)) {
    // Quem está fora dos lotes não é simulado em detalhe.
    if (morador.local.t === "fora") continue;
    for (const def of necessidadesDaFase(morador.fase)) {
      const queda = proporcao(UM, intervaloMs, def.esvaziaEmHoras * MS_POR_HORA);
      somarNecessidade(morador, def.id, -queda);
    }
    atualizarSensacoes(ctx, morador);
    aoZerar(ctx, morador);
  }
}
