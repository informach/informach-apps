import { novoId } from "../dominio/estado";
import type { DadosDoFato, Fato } from "../dominio/fatos";
import type { FamiliaId, LoteId, MemoriaId, MoradorId, PerfilId } from "../dominio/ids";
import { reduzirFato } from "../dominio/reduzir-fato";
import type { EstadoDoMundo, Presenca } from "../dominio/tipos";
import type { Navegador } from "../espaco/navegador";

/**
 * O que os sistemas recebem para trabalhar em um passo: o estado, a presença e
 * onde registrar o que aconteceu. Nenhum sistema guarda estado próprio.
 */

/** Tabelas do estado que são replicadas para os clientes. */
export type TabelaReplicada =
  | "lotes"
  | "imoveis"
  | "objetos"
  | "familias"
  | "moradores"
  | "relacoes"
  | "acoes"
  | "gravidezes"
  | "pedidos"
  | "quadro";

/** Partes do estado que são replicadas inteiras quando mudam. */
export type ChaveReplicada = "relogio" | "regras" | "acessos" | "memorias" | "presenca";

/** Avisos de uma vez só: o cliente mostra e esquece. Nunca são estado. */
export type EventoDeApresentacao =
  | { t: "recusou"; loteId: LoteId | null; moradorId: MoradorId; motivo: string }
  | { t: "nasceu"; loteId: LoteId | null; bebeId: MoradorId; gestanteId: MoradorId }
  | { t: "casal"; loteId: LoteId | null; a: MoradorId; b: MoradorId; casal: string }
  | { t: "mudou_se"; loteId: LoteId | null; moradorId: MoradorId }
  | { t: "cresceu"; loteId: LoteId | null; moradorId: MoradorId; fase: string }
  | { t: "resposta"; loteId: LoteId | null; de: MoradorId; para: MoradorId; aceito: boolean }
  | { t: "acidente"; loteId: LoteId | null; moradorId: MoradorId }
  | { t: "visita"; loteId: LoteId | null; moradorId: MoradorId; chegou: boolean };

export type Causa = Fato["causa"];

export const CAUSA_DA_SIMULACAO: Causa = { comandoId: null, autor: "sim", motivo: "simulacao" };

export type Contexto = {
  estado: EstadoDoMundo;
  presenca: Presenca;
  /** Fatos críticos deste passo, na ordem em que aconteceram. */
  fatos: Fato[];
  apresentacao: EventoDeApresentacao[];
  /** Entidades tocadas neste passo, por tabela. */
  tocadas: Map<TabelaReplicada, Set<string>>;
  chavesTocadas: Set<ChaveReplicada>;
  navegador(loteId: LoteId): Navegador;
};

export function tocar(ctx: Contexto, tabela: TabelaReplicada, id: string): void {
  let conjunto = ctx.tocadas.get(tabela);
  if (!conjunto) {
    conjunto = new Set();
    ctx.tocadas.set(tabela, conjunto);
  }
  conjunto.add(id);
}

export function tocarChave(ctx: Contexto, chave: ChaveReplicada): void {
  ctx.chavesTocadas.add(chave);
}

export function apresentar(ctx: Contexto, evento: EventoDeApresentacao): void {
  ctx.apresentacao.push(evento);
}

export function novaMemoria(ctx: Contexto): MemoriaId {
  return novoId(ctx.estado, "mem");
}

/** Quais tabelas e chaves cada tipo de fato pode mudar, para a replicação. */
function tocarPeloFato(ctx: Contexto, dados: DadosDoFato): void {
  switch (dados.tipo) {
    case "AcessoConcedido":
    case "AcessoRevogado":
      tocarChave(ctx, "acessos");
      return;
    case "PreferidoDefinido":
      tocar(ctx, "moradores", dados.moradorId);
      return;
    case "CasalMudou":
      // A relação pode ter nascido agora: os dois moradores passam a apontar para ela.
      tocar(
        ctx,
        "relacoes",
        dados.a < dados.b ? `rel:${dados.a}:${dados.b}` : `rel:${dados.b}:${dados.a}`,
      );
      tocar(ctx, "moradores", dados.a);
      tocar(ctx, "moradores", dados.b);
      tocarChave(ctx, "memorias");
      return;
    case "FamiliaMudou":
      tocar(ctx, "moradores", dados.moradorId);
      tocarChave(ctx, "memorias");
      return;
    case "GravidezIniciada":
      tocar(ctx, "gravidezes", dados.gravidez.id);
      tocarChave(ctx, "memorias");
      return;
    case "NascimentoRegistrado":
      tocar(ctx, "gravidezes", dados.gravidezId);
      tocar(ctx, "moradores", dados.bebe.id);
      for (const relacao of dados.relacoes) {
        tocar(ctx, "relacoes", relacao.id);
        tocar(ctx, "moradores", relacao.a);
        tocar(ctx, "moradores", relacao.b);
      }
      tocarChave(ctx, "memorias");
      return;
    case "FaseMudou":
      tocar(ctx, "moradores", dados.moradorId);
      tocarChave(ctx, "memorias");
      return;
    case "FundoMovimentado":
      tocar(ctx, "familias", dados.familiaId);
      return;
    case "PedidoCriado":
      tocar(ctx, "pedidos", dados.pedido.id);
      return;
    case "PedidoResolvido":
      tocar(ctx, "pedidos", dados.pedidoId);
      return;
  }
}

/**
 * Registra um fato e aplica na hora, pelo mesmo redutor que a recuperação usa.
 * Devolve `false` se um fato com este id já saiu neste passo.
 */
export function emitir(
  ctx: Contexto,
  id: string,
  familiaId: FamiliaId | null,
  dados: DadosDoFato,
  causa: Causa = CAUSA_DA_SIMULACAO,
): boolean {
  if (ctx.fatos.some((fato) => fato.id === id)) return false;
  const fato: Fato = { id, tick: ctx.estado.relogio.tick, familiaId, causa, dados };
  reduzirFato(ctx.estado, fato);
  ctx.fatos.push(fato);
  tocarPeloFato(ctx, dados);
  return true;
}

export function causaDoJogador(
  comandoId: string | null,
  autor: PerfilId | null,
  motivo: string,
): Causa {
  return { comandoId, autor: autor ?? "sim", motivo };
}
