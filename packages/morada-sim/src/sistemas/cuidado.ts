import {
  CUIDADO_POR_NECESSIDADE,
  doCatalogo,
  FASES_QUE_CUIDAM,
  necessidadesDaFase,
} from "../conteudo";
import { novoId } from "../dominio/estado";
import type { ObjetoId, PerfilId } from "../dominio/ids";
import { inserir, listar, obter, remover } from "../dominio/tabela";
import type { Morador, Objeto, Tarefa } from "../dominio/tipos";
import { bebeNoColoDe, objetosDoLote, ondeEsta, PONTO_DENTRO } from "../espaco/posicoes";
import { UM } from "../nucleo/fixo";
import { enfileirar } from "./acoes";
import { type Contexto, tocar } from "./contexto";

/**
 * Cuidado com bebê e criança pequena. Uma necessidade crítica vira uma tarefa
 * no quadro da família; um adulto livre a assume, antes do próprio lazer. O
 * mesmo quadro vai servir, mais tarde, aos serviços contratados.
 */

/** A tarefa some quando a necessidade volta a este nível sem ninguém a caminho. */
const ATENDIDA = 600_000;
export const CUIDADO_DE_DORMIR = "por_para_dormir";

function bercoLivre(ctx: Contexto, loteId: string): Objeto | null {
  for (const objeto of objetosDoLote(ctx.estado, loteId as Objeto["loteId"])) {
    if (doCatalogo(objeto.catalogo)?.comportamento !== "berco") continue;
    if (objeto.ocupacao[PONTO_DENTRO] === undefined) return objeto;
  }
  return null;
}

function estaNoBerco(ctx: Contexto, bebe: Morador): boolean {
  if (bebe.local.t !== "objeto") return false;
  const objeto = obter(ctx.estado.objetos, bebe.local.objetoId);
  return doCatalogo(objeto?.catalogo ?? "")?.comportamento === "berco";
}

/** Abre e fecha as tarefas de cuidado conforme as necessidades de cada bebê. */
export function passoDoQuadro(ctx: Contexto): void {
  const estado = ctx.estado;
  if (estado.relogio.tick % 10 !== 5) return;

  for (const bebe of listar(estado.moradores)) {
    if (!bebe.familiaId || bebe.local.t === "fora") continue;
    const cuidados = CUIDADO_POR_NECESSIDADE[bebe.fase];
    for (const def of necessidadesDaFase(bebe.fase)) {
      const cuidado = cuidados[def.id];
      if (!cuidado) continue;
      const nivel = bebe.necessidades[def.id] ?? UM;
      const existente = listar(estado.quadro).find(
        (tarefa) => tarefa.bebeId === bebe.id && tarefa.cuidado === cuidado,
      );
      // Sono: se o bebê já está no berço, ele dorme sozinho; não há tarefa.
      const dispensada = cuidado === CUIDADO_DE_DORMIR && estaNoBerco(ctx, bebe);

      if (nivel < def.critico && !existente && !dispensada) {
        const tarefa: Tarefa = {
          id: novoId(estado, "tar"),
          familiaId: bebe.familiaId,
          bebeId: bebe.id,
          cuidado,
          necessidade: def.id,
          criadaTick: estado.relogio.tick,
          responsavelId: null,
        };
        inserir(estado.quadro, tarefa.id, tarefa);
        tocar(ctx, "quadro", tarefa.id);
      } else if (
        existente &&
        (nivel >= ATENDIDA || dispensada) &&
        existente.responsavelId === null
      ) {
        remover(estado.quadro, existente.id);
        tocar(ctx, "quadro", existente.id);
      }
    }
  }

  // Tarefas de quem deixou de precisar (cresceu, saiu) ou de responsável que sumiu.
  for (const tarefa of listar(estado.quadro)) {
    const bebe = obter(estado.moradores, tarefa.bebeId);
    const responsavel = tarefa.responsavelId
      ? obter(estado.moradores, tarefa.responsavelId)
      : undefined;
    if (!bebe || !CUIDADO_POR_NECESSIDADE[bebe.fase]) {
      remover(estado.quadro, tarefa.id);
      tocar(ctx, "quadro", tarefa.id);
      continue;
    }
    const ocupadoComEla =
      responsavel &&
      [responsavel.acaoAtual, ...responsavel.fila].some(
        (id) => id && obter(estado.acoes, id)?.tarefaId === tarefa.id,
      );
    if (tarefa.responsavelId && !ocupadoComEla) {
      tarefa.responsavelId = null;
      tocar(ctx, "quadro", tarefa.id);
    }
  }
}

export function podeCuidar(morador: Morador): boolean {
  return FASES_QUE_CUIDAM.includes(morador.fase);
}

/** O que impede este cuidado agora, sem mudar nada; `null` se dá para fazer. */
export function impedimentoDoCuidado(
  ctx: Contexto,
  cuidador: Morador,
  bebe: Morador,
  cuidado: string,
): "longe" | "no_colo_de_outro" | "ja_no_berco" | "sem_berco" | "maos_ocupadas" | null {
  const estado = ctx.estado;
  const tick = estado.relogio.tick;
  const onde = ondeEsta(estado, bebe, tick);
  if (!onde || ondeEsta(estado, cuidador, tick)?.loteId !== onde.loteId) return "longe";
  if (bebe.local.t === "colo" && bebe.local.de !== cuidador.id) return "no_colo_de_outro";
  if (cuidado !== CUIDADO_DE_DORMIR) return null;
  if (estaNoBerco(ctx, bebe)) return "ja_no_berco";
  if (!bercoLivre(ctx, onde.loteId)) return "sem_berco";
  const carregado = bebeNoColoDe(estado, cuidador.id);
  if (carregado && carregado.id !== bebe.id) return "maos_ocupadas";
  return null;
}

/**
 * Enfileira as ações de um cuidado. Devolve `false`, sem mudar nada, se não
 * há como fazer agora (por exemplo, pôr para dormir sem berço livre).
 */
export function enfileirarCuidado(
  ctx: Contexto,
  cuidador: Morador,
  bebe: Morador,
  cuidado: string,
  origem:
    | { tipo: "quadro"; tarefa: Tarefa }
    | { tipo: "jogador"; autor: PerfilId; comandoId: string },
): boolean {
  if (impedimentoDoCuidado(ctx, cuidador, bebe, cuidado)) return false;
  const estado = ctx.estado;
  const onde = ondeEsta(estado, bebe, estado.relogio.tick);
  if (!onde) return false;

  const comum =
    origem.tipo === "quadro"
      ? { origem: "quadro" as const, tarefaId: origem.tarefa.id }
      : { origem: "jogador" as const, autor: origem.autor, comandoId: origem.comandoId };

  if (cuidado !== CUIDADO_DE_DORMIR) {
    enfileirar(ctx, cuidador, {
      interacao: cuidado,
      alvo: { t: "morador", moradorId: bebe.id },
      ...comum,
    });
    return true;
  }

  // Pôr para dormir: pegar no colo, se ainda não está, e levar ao berço.
  const berco = bercoLivre(ctx, onde.loteId);
  if (!berco) return false;
  if (!bebeNoColoDe(estado, cuidador.id)) {
    enfileirar(ctx, cuidador, {
      interacao: "pegar_no_colo",
      alvo: { t: "morador", moradorId: bebe.id },
      ...comum,
      // A tarefa só termina quando o bebê chega ao berço.
      tarefaId: null,
    });
  }
  enfileirar(ctx, cuidador, {
    interacao: "por_no_berco",
    alvo: { t: "objeto", objetoId: berco.id as ObjetoId },
    ...comum,
  });
  return true;
}

/**
 * A tarefa mais urgente que este morador pode assumir agora, se houver. Quem
 * tem uma urgência do próprio corpo cuida de si primeiro, a não ser que o bebê
 * esteja no limite.
 */
export function assumirTarefa(ctx: Contexto, morador: Morador, urgenciaPropria: boolean): boolean {
  if (!podeCuidar(morador) || !morador.familiaId) return false;
  const estado = ctx.estado;
  // A prioridade é o quanto falta da necessidade que abriu a tarefa.
  const tarefas = listar(estado.quadro)
    .filter((tarefa) => tarefa.familiaId === morador.familiaId && tarefa.responsavelId === null)
    .map((tarefa) => {
      const bebe = obter(estado.moradores, tarefa.bebeId);
      return { tarefa, bebe, falta: UM - (bebe?.necessidades[tarefa.necessidade] ?? UM) };
    })
    .sort((a, b) => b.falta - a.falta || (a.tarefa.id < b.tarefa.id ? -1 : 1));

  for (const { tarefa, bebe, falta } of tarefas) {
    if (urgenciaPropria && falta < 900_000) continue;
    if (!bebe) continue;
    if (enfileirarCuidado(ctx, morador, bebe, tarefa.cuidado, { tipo: "quadro", tarefa })) {
      tarefa.responsavelId = morador.id;
      tocar(ctx, "quadro", tarefa.id);
      return true;
    }
  }
  return false;
}
