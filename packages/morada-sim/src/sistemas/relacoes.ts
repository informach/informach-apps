import { sensacao } from "../conteudo";
import { novoId, relacaoExistente, saoParentes, tamanhoDaFamilia } from "../dominio/estado";
import type { PerfilId } from "../dominio/ids";
import { relacaoId } from "../dominio/ids";
import { obter } from "../dominio/tabela";
import type {
  EstadoDoMundo,
  Gravidez,
  Morador,
  Pedido,
  Presenca,
  TipoDePedido,
} from "../dominio/tipos";
import { ondeEsta } from "../espaco/posicoes";
import { limitar, UM } from "../nucleo/fixo";
import { sorteio } from "../nucleo/sorteio";
import { apresentar, type Causa, type Contexto, emitir, novaMemoria, tocar } from "./contexto";
import { darSensacao, MS_POR_DIA } from "./efeitos";

/**
 * Decisões de vida: namoro, casamento, morar junto e bebê. Quem responde a um
 * pedido depende de quem é o outro:
 *
 * - de outra família com jogadores: alguém de lá aceita, e o pedido espera se
 *   não houver ninguém presente;
 * - da mesma família e dirigido por outra pessoa: ela responde;
 * - sem ninguém dirigindo: o próprio morador responde, pelo vínculo que tem.
 *   Nunca por sorteio sem contexto.
 */

const LIMIARES: Record<TipoDePedido, { romance: number; amizade: number; confianca: number }> = {
  namoro: { romance: 450_000, amizade: 400_000, confianca: 300_000 },
  casamento: { romance: 650_000, amizade: 500_000, confianca: 500_000 },
  morar_junto: { romance: 450_000, amizade: 450_000, confianca: 500_000 },
  bebe: { romance: 600_000, amizade: 500_000, confianca: 550_000 },
};

export type Resposta = { aceita: boolean; motivo: string };

/** Pode gestar: corpo adulto da linha feminina. */
export function podeGestar(morador: Morador): boolean {
  return morador.fase === "adulto" && morador.aparencia.linha === "f";
}

export function gravidezEmCurso(estado: EstadoDoMundo, moradorId: string): Gravidez | undefined {
  for (const id of estado.gravidezes.ordem) {
    const gravidez = estado.gravidezes.porId[id];
    if (gravidez?.gestanteId === moradorId && gravidez.estado === "em_curso") return gravidez;
  }
  return undefined;
}

/** Quem gestaria o bebê deste casal, ou `null` se nenhum dos dois pode. */
export function quemGesta(estado: EstadoDoMundo, a: Morador, b: Morador): Morador | null {
  for (const morador of [a, b]) {
    if (podeGestar(morador) && !gravidezEmCurso(estado, morador.id)) return morador;
  }
  return null;
}

/**
 * O que impede o pedido antes de qualquer resposta: regras do mundo, não
 * vontade de ninguém.
 */
export function impedimentoDoPedido(
  estado: EstadoDoMundo,
  tipo: TipoDePedido,
  de: Morador,
  para: Morador,
): string | null {
  const adultos = (m: Morador) => m.fase === "adulto" || m.fase === "idoso";
  if (!adultos(de) || !adultos(para)) return "fase";
  if (saoParentes(estado, de.id, para.id)) return "parentes";
  const casal = relacaoExistente(estado, de.id, para.id)?.casal ?? "nenhum";
  switch (tipo) {
    case "namoro":
      return casal === "nenhum" || casal === "ex" ? null : "ja_sao_casal";
    case "casamento":
      return casal === "namoro" ? null : "precisa_namorar";
    case "morar_junto": {
      if (casal !== "namoro" && casal !== "casamento") return "precisa_ser_casal";
      if (!de.familiaId) return "sem_familia";
      if (para.familiaId === de.familiaId) return "ja_moram_juntos";
      // Unir duas famílias com jogadores exige o aceite das duas; fica para depois.
      if (para.familiaId !== null) return "outra_familia";
      if (tamanhoDaFamilia(estado, de.familiaId) >= estado.regras.maxMoradoresPorFamilia) {
        return "familia_cheia";
      }
      return null;
    }
    case "bebe": {
      if (casal !== "namoro" && casal !== "casamento") return "precisa_ser_casal";
      const gestante = quemGesta(estado, de, para);
      if (!gestante) return "ninguem_pode_gestar";
      if (!gestante.familiaId) return "sem_familia";
      const esperados = estado.gravidezes.ordem.filter((id) => {
        const g = estado.gravidezes.porId[id];
        return g?.familiaId === gestante.familiaId && g.estado === "em_curso";
      }).length;
      const ocupacao = tamanhoDaFamilia(estado, gestante.familiaId) + esperados;
      if (ocupacao >= estado.regras.maxMoradoresPorFamilia) return "familia_cheia";
      return null;
    }
  }
}

/**
 * A resposta de um morador que ninguém dirige. É função do vínculo, do humor e
 * dos traços dele; o mesmo estado dá sempre a mesma resposta.
 */
export function decidirProposta(
  estado: EstadoDoMundo,
  tipo: TipoDePedido,
  de: Morador,
  para: Morador,
): Resposta {
  const eixos = relacaoExistente(estado, de.id, para.id)?.eixos ?? {
    amizade: 0,
    romance: 0,
    confianca: 0,
  };
  // Quem está mal não decide a vida agora: adia, sem mágoa.
  let incomodo = 0;
  for (const sentida of para.sensacoes) {
    const def = sensacao(sentida.id);
    if (def && (def.humor === "irritado" || def.humor === "triste" || def.humor === "tenso")) {
      incomodo += def.peso;
    }
  }
  if (incomodo >= 4) return { aceita: false, motivo: "agora_nao" };

  const limiar = LIMIARES[tipo];
  // Traços deslocam o limiar: os tranquilos e carinhosos aceitam um pouco antes.
  let ajuste = 0;
  for (const traco of para.tracos) {
    if (traco.startsWith("tranquil") || traco.startsWith("carinhos")) ajuste -= 40_000;
    if (traco.startsWith("caseir")) ajuste += tipo === "morar_junto" ? -60_000 : 0;
  }
  if (eixos.romance < limitar(limiar.romance + ajuste, 0, UM)) {
    return { aceita: false, motivo: "pouco_romance" };
  }
  if (eixos.amizade < limitar(limiar.amizade + ajuste, 0, UM)) {
    return { aceita: false, motivo: "pouca_amizade" };
  }
  if (eixos.confianca < limitar(limiar.confianca + ajuste, 0, UM)) {
    return { aceita: false, motivo: "pouca_confianca" };
  }
  return { aceita: true, motivo: "aceitou" };
}

function familiaTemJogador(estado: EstadoDoMundo, familiaId: string | null): boolean {
  return familiaId !== null && estado.acessos.some((acesso) => acesso.familiaId === familiaId);
}

function quemDirige(presenca: Presenca, moradorId: string): PerfilId | null {
  return presenca.reservas.find((reserva) => reserva.moradorId === moradorId)?.perfilId ?? null;
}

/** Faz acontecer um pedido aceito. Devolve `false` se uma regra do mundo passou a impedir. */
export function efetivarPedido(
  ctx: Contexto,
  tipo: TipoDePedido,
  de: Morador,
  para: Morador,
  causa: Causa,
): boolean {
  const estado = ctx.estado;
  if (impedimentoDoPedido(estado, tipo, de, para)) return false;
  const tick = estado.relogio.tick;
  const loteId = ondeEsta(estado, de, tick)?.loteId ?? null;
  const par = relacaoId(de.id, para.id);

  switch (tipo) {
    case "namoro":
    case "casamento": {
      const casal = tipo === "namoro" ? "namoro" : "casamento";
      emitir(
        ctx,
        `casal:${par}:${tick}`,
        de.familiaId,
        { tipo: "CasalMudou", a: de.id, b: para.id, casal, memoriaId: novaMemoria(ctx) },
        causa,
      );
      const sentida = tipo === "casamento" ? "recem_casado" : "apaixonado";
      darSensacao(ctx, de, sentida, 24 * 60);
      darSensacao(ctx, para, sentida, 24 * 60);
      apresentar(ctx, { t: "casal", loteId, a: de.id, b: para.id, casal });
      return true;
    }

    case "morar_junto": {
      const familia = de.familiaId ? obter(estado.familias, de.familiaId) : undefined;
      if (!familia) return false;
      emitir(
        ctx,
        `fam:${para.id}:${tick}`,
        familia.id,
        {
          tipo: "FamiliaMudou",
          moradorId: para.id,
          de: para.familiaId,
          para: familia.id,
          loteId: familia.loteId,
          memoriaId: novaMemoria(ctx),
        },
        causa,
      );
      // Quem veio visitar e ficou não vai mais embora no fim da visita.
      estado.agenda = estado.agenda.filter((evento) => evento.moradorId !== para.id);
      apresentar(ctx, { t: "mudou_se", loteId, moradorId: para.id });
      return true;
    }

    case "bebe": {
      const gestante = quemGesta(estado, de, para);
      const familia = gestante?.familiaId ? obter(estado.familias, gestante.familiaId) : undefined;
      if (!gestante || !familia) return false;
      const outro = gestante.id === de.id ? para : de;
      const gravidezId = novoId(estado, "gra");
      const gravidez: Gravidez = {
        id: gravidezId,
        gestanteId: gestante.id,
        outroGenitorId: outro.id,
        familiaId: familia.id,
        inicioVidaMs: familia.vidaMs,
        previstaVidaMs: familia.vidaMs + estado.regras.diasDeGravidez * MS_POR_DIA,
        sementeDoBebe: sorteio(estado.semente, "bebe", gravidezId, tick),
        bebeId: novoId(estado, "mor"),
        estado: "em_curso",
      };
      emitir(
        ctx,
        `grav:${gravidezId}`,
        familia.id,
        { tipo: "GravidezIniciada", gravidez, memoriaId: novaMemoria(ctx) },
        causa,
      );
      tocar(ctx, "moradores", gestante.id);
      return true;
    }
  }
}

/**
 * O morador `ator` terminou de fazer o pedido a `alvo`. Ou alguém precisa
 * responder (vira um pedido aberto), ou o próprio `alvo` responde agora.
 */
export function fazerPedido(
  ctx: Contexto,
  tipo: TipoDePedido,
  ator: Morador,
  alvo: Morador,
  autor: PerfilId | null,
  comandoId: string | null,
): void {
  const estado = ctx.estado;
  const tick = estado.relogio.tick;
  const loteId = ondeEsta(estado, ator, tick)?.loteId ?? null;
  const causa: Causa = { comandoId, autor: autor ?? "sim", motivo: `pedido_de_${tipo}` };

  const impedimento = impedimentoDoPedido(estado, tipo, ator, alvo);
  if (impedimento) {
    apresentar(ctx, { t: "recusou", loteId, moradorId: ator.id, motivo: impedimento });
    return;
  }

  const outraFamilia =
    alvo.familiaId !== ator.familiaId && familiaTemJogador(estado, alvo.familiaId);
  const dirigidoPor = quemDirige(ctx.presenca, alvo.id);
  const outroJogador = dirigidoPor !== null && dirigidoPor !== autor;

  if (outraFamilia || outroJogador) {
    const jaAberto = estado.pedidos.ordem.some((id) => {
      const p = estado.pedidos.porId[id];
      return p?.estado === "aberto" && p.tipo === tipo && p.de === ator.id && p.para === alvo.id;
    });
    if (jaAberto) return;
    const pedido: Pedido = {
      id: novoId(estado, "ped"),
      tipo,
      de: ator.id,
      para: alvo.id,
      autor,
      criadoTick: tick,
      estado: "aberto",
      motivo: null,
    };
    emitir(ctx, `ped:${pedido.id}`, alvo.familiaId, { tipo: "PedidoCriado", pedido }, causa);
    return;
  }

  const resposta = decidirProposta(estado, tipo, ator, alvo);
  const aceito = resposta.aceita && efetivarPedido(ctx, tipo, ator, alvo, causa);
  anunciarResposta(ctx, ator, alvo, aceito, resposta.motivo);
}

/** Mostra a resposta e, se foi um não de verdade, deixa a marca em quem pediu. */
function anunciarResposta(
  ctx: Contexto,
  de: Morador,
  para: Morador,
  aceito: boolean,
  motivo: string,
): void {
  const tick = ctx.estado.relogio.tick;
  const loteId = ondeEsta(ctx.estado, de, tick)?.loteId ?? null;
  apresentar(ctx, { t: "resposta", loteId, de: de.id, para: para.id, aceito });
  if (aceito || motivo === "agora_nao") return;
  darSensacao(ctx, de, "rejeitado", 180);
  const relacao = relacaoExistente(ctx.estado, de.id, para.id);
  if (relacao) {
    relacao.eixos.romance = limitar(relacao.eixos.romance - 30_000, 0, UM);
    tocar(ctx, "relacoes", relacao.id);
  }
}

/** Um jogador respondeu a um pedido aberto. */
export function responderPedido(
  ctx: Contexto,
  pedido: Pedido,
  aceita: boolean,
  causa: Causa,
): boolean {
  const de = obter(ctx.estado.moradores, pedido.de);
  const para = obter(ctx.estado.moradores, pedido.para);
  if (pedido.estado !== "aberto" || !de || !para) return false;
  const feito = aceita && efetivarPedido(ctx, pedido.tipo, de, para, causa);
  emitir(
    ctx,
    `pedr:${pedido.id}`,
    para.familiaId,
    {
      tipo: "PedidoResolvido",
      pedidoId: pedido.id,
      aceito: feito,
      motivo: aceita && !feito ? "regra_do_mundo" : aceita ? null : "recusado",
    },
    causa,
  );
  anunciarResposta(ctx, de, para, feito, "respondido");
  return true;
}
