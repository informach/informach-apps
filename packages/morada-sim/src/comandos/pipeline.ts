import { CUIDADO_POR_NECESSIDADE, interacao } from "../conteudo";
import type { MoradorId, PerfilId, SessaoId } from "../dominio/ids";
import type { Permissao } from "../dominio/permissoes";
import { listar, obter } from "../dominio/tabela";
import type { Morador, MotivoDeRecusa, Resultado, Sessao } from "../dominio/tipos";
import { ondeEsta } from "../espaco/posicoes";
import { distancia } from "../nucleo/fixo";
import { cancelarAcao, enfileirar, podeSerInterrompido } from "../sistemas/acoes";
import { type Contexto, causaDoJogador, emitir, tocar } from "../sistemas/contexto";
import {
  CUIDADO_DE_DORMIR,
  enfileirarCuidado,
  impedimentoDoCuidado,
  podeCuidar,
} from "../sistemas/cuidado";
import { liberar, reservar, sessaoDe, temPermissao, votarVelocidade } from "../sistemas/presenca";
import { recusaDaInteracao } from "../sistemas/regras";
import { impedimentoDoPedido, responderPedido } from "../sistemas/relacoes";
import { marcarVisita, TEMPO_DE_CHEGADA, visitaMarcada } from "../sistemas/visitas";
import type { AcaoPedida, Intencao } from "./intencao";

/**
 * Do pedido ao efeito: idempotência, autorização, versão, regras duras,
 * efeito. Um comando recusado não muda nada, e o motivo volta para quem pediu.
 */

/** Quantos comandos o mundo lembra para não repetir. */
const MEMORIA_DE_COMANDOS = 512;
/** Fila de um morador: além disso o jogador precisa esperar ou cancelar. */
const FILA_MAXIMA = 8;

const CUIDADOS = new Set<string>([
  ...Object.values(CUIDADO_POR_NECESSIDADE).flatMap((mapa) => Object.values(mapa)),
  "ninar",
  "brincar_com_bebe",
  "pegar_no_colo",
]);

type Recusa = { motivo: MotivoDeRecusa; detalhe?: string };
type Feito = { versoes: Record<string, number> };

const recusa = (motivo: MotivoDeRecusa, detalhe?: string): Recusa =>
  detalhe === undefined ? { motivo } : { motivo, detalhe };

function ehRecusa(saida: Recusa | Feito): saida is Recusa {
  return "motivo" in saida;
}

/** O morador da intenção, dirigido por esta sessão. */
function dirigido(ctx: Contexto, sessao: Sessao, moradorId: MoradorId | null): Morador | Recusa {
  if (!moradorId) return recusa("comando_invalido");
  const morador = obter(ctx.estado.moradores, moradorId);
  if (!morador) return recusa("nao_existe");
  const reserva = ctx.presenca.reservas.find((r) => r.moradorId === moradorId);
  if (!reserva) return recusa("sem_reserva");
  if (reserva.sessaoId !== sessao.sessaoId) return recusa("reservado_por_outro");
  // A reserva não basta: o acesso pode ter sido revogado depois.
  if (!temPermissao(ctx.estado, sessao.perfilId, morador.familiaId, "comandar")) {
    return recusa("sem_acesso");
  }
  return morador;
}

function exigir(
  ctx: Contexto,
  sessao: Sessao,
  morador: Morador,
  permissao: Permissao | undefined,
): Recusa | null {
  if (!permissao) return null;
  return temPermissao(ctx.estado, sessao.perfilId, morador.familiaId, permissao)
    ? null
    : recusa("sem_permissao", permissao);
}

/** Um comando do jogador passa à frente do que o morador fazia por conta própria. */
function abrirCaminho(ctx: Contexto, morador: Morador): void {
  if (morador.acaoAtual && podeSerInterrompido(ctx.estado, morador))
    cancelarAcao(ctx, morador.acaoAtual);
  // O que a autonomia já tinha posto na fila também sai.
  for (const id of [...morador.fila]) {
    const acao = obter(ctx.estado.acoes, id);
    if (acao && acao.origem !== "jogador") cancelarAcao(ctx, id);
  }
}

function feito(morador: Morador): Feito {
  return { versoes: { [morador.id]: morador.versao } };
}

function enfileirarDoJogador(
  ctx: Contexto,
  sessao: Sessao,
  intencao: Intencao,
  morador: Morador,
  nova: { interacao: string; alvo: Parameters<typeof enfileirar>[2]["alvo"] },
): Recusa | Feito {
  if (morador.fila.length >= FILA_MAXIMA) return recusa("ocupado", "fila_cheia");
  abrirCaminho(ctx, morador);
  enfileirar(ctx, morador, {
    ...nova,
    origem: "jogador",
    autor: sessao.perfilId,
    comandoId: intencao.comandoId,
  });
  morador.versao++;
  tocar(ctx, "moradores", morador.id);
  return feito(morador);
}

/** Quem executa um cuidado: o indicado, o que a sessão dirige, ou o adulto livre mais perto. */
function escolherCuidador(
  ctx: Contexto,
  sessao: Sessao,
  bebe: Morador,
  executorId: MoradorId | undefined,
  moradorDaIntencao: MoradorId | null,
): Morador | Recusa {
  const estado = ctx.estado;
  const tick = estado.relogio.tick;
  const serve = (candidato: Morador | undefined): candidato is Morador =>
    candidato !== undefined &&
    candidato.id !== bebe.id &&
    candidato.familiaId === bebe.familiaId &&
    podeCuidar(candidato) &&
    ondeEsta(estado, candidato, tick)?.loteId === ondeEsta(estado, bebe, tick)?.loteId;
  const deOutro = (id: MoradorId) =>
    ctx.presenca.reservas.some((r) => r.moradorId === id && r.sessaoId !== sessao.sessaoId);

  if (executorId) {
    const indicado = obter(estado.moradores, executorId);
    if (!serve(indicado)) return recusa("requisito", "executor");
    if (deOutro(indicado.id)) return recusa("reservado_por_outro");
    return indicado;
  }

  // Quem já está com o bebê no colo continua cuidando dele.
  if (bebe.local.t === "colo") {
    const quemCarrega = obter(estado.moradores, bebe.local.de);
    if (serve(quemCarrega) && !deOutro(quemCarrega.id)) return quemCarrega;
    return recusa("ocupado");
  }

  const meu = ctx.presenca.reservas.find((r) => r.sessaoId === sessao.sessaoId)?.moradorId;
  for (const id of [moradorDaIntencao, meu]) {
    const candidato = id ? obter(estado.moradores, id) : undefined;
    if (serve(candidato)) return candidato;
  }

  const ondeBebe = ondeEsta(estado, bebe, tick);
  const livres = listar(estado.moradores)
    .filter((candidato) => serve(candidato) && !deOutro(candidato.id))
    .filter((candidato) => podeSerInterrompido(estado, candidato))
    .map((candidato) => ({
      candidato,
      longe: ondeBebe
        ? distancia(ondeEsta(estado, candidato, tick)?.pos ?? [0, 0], ondeBebe.pos)
        : 0,
    }))
    .sort((a, b) => a.longe - b.longe || (a.candidato.id < b.candidato.id ? -1 : 1));
  return livres[0]?.candidato ?? recusa("ocupado", "sem_cuidador");
}

function executar(ctx: Contexto, sessao: Sessao, intencao: Intencao): Recusa | Feito {
  const estado = ctx.estado;
  const tick = estado.relogio.tick;
  const acao: AcaoPedida = intencao.acao;
  const perfil: PerfilId = sessao.perfilId;
  const causa = (motivo: string) => causaDoJogador(intencao.comandoId, perfil, motivo);

  switch (acao.t) {
    case "reservar": {
      const morador = intencao.moradorId ? obter(estado.moradores, intencao.moradorId) : undefined;
      if (!morador) return recusa("nao_existe");
      const motivo = reservar(ctx, sessao.sessaoId, morador);
      return motivo ? recusa(motivo) : feito(morador);
    }

    case "liberar": {
      liberar(ctx, sessao.sessaoId);
      return { versoes: {} };
    }

    case "definir_preferido": {
      const morador = dirigido(ctx, sessao, intencao.moradorId);
      if ("motivo" in morador) return morador;
      emitir(
        ctx,
        `pref:${morador.id}:${tick}`,
        morador.familiaId,
        { tipo: "PreferidoDefinido", moradorId: morador.id, perfilId: acao.valor ? perfil : null },
        causa("preferido"),
      );
      return feito(morador);
    }

    case "ir_para": {
      const morador = dirigido(ctx, sessao, intencao.moradorId);
      if ("motivo" in morador) return morador;
      if (morador.fase === "colo") return recusa("fase_nao_permite");
      const onde = ondeEsta(estado, morador, tick);
      if (!onde) return recusa("inalcancavel");
      if (!ctx.navegador(onde.loteId).livre(acao.pos)) return recusa("inalcancavel");
      return enfileirarDoJogador(ctx, sessao, intencao, morador, {
        interacao: "andar_ate",
        alvo: { t: "ponto", pos: acao.pos, andar: acao.andar },
      });
    }

    case "interagir": {
      const morador = dirigido(ctx, sessao, intencao.moradorId);
      if ("motivo" in morador) return morador;
      const def = interacao(acao.interacao);
      // Pedidos de vida e a espera de quem recebe têm os seus próprios comandos.
      if (!def || def.id === "receber" || def.id.startsWith("propor_")) {
        return recusa("comando_invalido");
      }
      const semDireito = exigir(ctx, sessao, morador, def.permissao);
      if (semDireito) return semDireito;
      const impedimento = recusaDaInteracao(estado, def, morador, acao.alvo, tick);
      if (impedimento) return recusa(impedimento);
      return enfileirarDoJogador(ctx, sessao, intencao, morador, {
        interacao: def.id,
        alvo: acao.alvo,
      });
    }

    case "cuidar": {
      const bebe = obter(estado.moradores, acao.bebeId);
      if (!bebe) return recusa("nao_existe");
      if (!temPermissao(estado, perfil, bebe.familiaId, "comandar")) return recusa("sem_acesso");
      if (!CUIDADOS.has(acao.cuidado)) return recusa("comando_invalido");
      const cuidador = escolherCuidador(ctx, sessao, bebe, acao.executorId, intencao.moradorId);
      if ("motivo" in cuidador) return cuidador;
      if (cuidador.fila.length >= FILA_MAXIMA) return recusa("ocupado", "fila_cheia");
      if (acao.cuidado !== CUIDADO_DE_DORMIR) {
        const def = interacao(acao.cuidado);
        const impedimento = def
          ? recusaDaInteracao(estado, def, cuidador, { t: "morador", moradorId: bebe.id }, tick)
          : "comando_invalido";
        if (impedimento) return recusa(impedimento);
      }
      // Confere antes de mexer: um comando recusado não muda nada.
      const semComo = impedimentoDoCuidado(estado, cuidador, bebe, acao.cuidado);
      if (semComo) return recusa("requisito", semComo);
      abrirCaminho(ctx, cuidador);
      enfileirarCuidado(ctx, cuidador, bebe, acao.cuidado, {
        tipo: "jogador",
        autor: perfil,
        comandoId: intencao.comandoId,
      });
      cuidador.versao++;
      tocar(ctx, "moradores", cuidador.id);
      return feito(cuidador);
    }

    case "cancelar_acao": {
      const morador = dirigido(ctx, sessao, intencao.moradorId);
      if ("motivo" in morador) return morador;
      const alvo = obter(estado.acoes, acao.acaoId);
      if (!alvo || alvo.moradorId !== morador.id) return recusa("nao_existe");
      // Quem está dando atenção a outro não larga no meio.
      if (alvo.origem === "resposta") return recusa("ocupado");
      cancelarAcao(ctx, alvo.id);
      morador.versao++;
      tocar(ctx, "moradores", morador.id);
      return feito(morador);
    }

    case "propor": {
      const morador = dirigido(ctx, sessao, intencao.moradorId);
      if ("motivo" in morador) return morador;
      const def = interacao(`propor_${acao.tipo}`);
      const alvo = obter(estado.moradores, acao.alvoId);
      if (!def || !alvo) return recusa("nao_existe");
      const semDireito = exigir(ctx, sessao, morador, def.permissao);
      if (semDireito) return semDireito;
      const impedimento = impedimentoDoPedido(estado, acao.tipo, morador, alvo);
      if (impedimento) {
        return recusa(
          impedimento === "familia_cheia" ? "limite_da_familia" : "requisito",
          impedimento,
        );
      }
      const regra = recusaDaInteracao(
        estado,
        def,
        morador,
        { t: "morador", moradorId: alvo.id },
        tick,
      );
      if (regra) return recusa(regra);
      return enfileirarDoJogador(ctx, sessao, intencao, morador, {
        interacao: def.id,
        alvo: { t: "morador", moradorId: alvo.id },
      });
    }

    case "responder_pedido": {
      const pedido = obter(estado.pedidos, acao.pedidoId);
      if (!pedido) return recusa("nao_existe");
      if (pedido.estado !== "aberto") return recusa("ja_resolvido");
      const para = obter(estado.moradores, pedido.para);
      if (!para) return recusa("nao_existe");
      // Responde quem dirige o morador ou quem decide a vida da família dele.
      const dirige = ctx.presenca.reservas.some(
        (r) => r.moradorId === para.id && r.sessaoId === sessao.sessaoId,
      );
      if (!dirige && !temPermissao(estado, perfil, para.familiaId, "decidir_vida")) {
        return recusa("sem_permissao", "decidir_vida");
      }
      // Ninguém responde ao próprio pedido.
      if (pedido.autor === perfil) return recusa("sem_permissao", "proprio_pedido");
      responderPedido(ctx, pedido, acao.aceita, causa("resposta_a_pedido"));
      return { versoes: {} };
    }

    case "votar_velocidade": {
      const motivo = votarVelocidade(ctx, sessao.sessaoId, acao.velocidade);
      return motivo ? recusa(motivo) : { versoes: {} };
    }

    case "convidar_visita": {
      const morador = dirigido(ctx, sessao, intencao.moradorId);
      if ("motivo" in morador) return morador;
      const onde = ondeEsta(estado, morador, tick);
      const alvo = obter(estado.moradores, acao.alvoId);
      if (!onde || !alvo) return recusa("nao_existe");
      if (alvo.familiaId !== null || alvo.local.t !== "fora") return recusa("requisito");
      if (visitaMarcada(estado, alvo.id)) return recusa("ja_resolvido");
      marcarVisita(ctx, alvo.id, onde.loteId, tick + TEMPO_DE_CHEGADA);
      return feito(morador);
    }
  }
}

function lembrar(ctx: Contexto, resultado: Resultado): void {
  const comandos = ctx.estado.comandos;
  comandos.push({ comandoId: resultado.comandoId, resultado });
  if (comandos.length > MEMORIA_DE_COMANDOS) {
    comandos.splice(0, comandos.length - MEMORIA_DE_COMANDOS);
  }
}

export function aplicarIntencao(ctx: Contexto, sessaoId: SessaoId, intencao: Intencao): Resultado {
  const estado = ctx.estado;
  const comandoId = intencao.comandoId;
  if (intencao.mundoId !== estado.id) return { ok: false, comandoId, motivo: "mundo_errado" };

  // O mesmo comando de novo devolve o que foi respondido da primeira vez.
  const anterior = estado.comandos.find((registro) => registro.comandoId === comandoId);
  if (anterior) return { ...anterior.resultado, repetido: true };

  const sessao = sessaoDe(ctx.presenca, sessaoId);
  if (sessao?.estado !== "presente") {
    return { ok: false, comandoId, motivo: "sem_sessao" };
  }

  // Versão: só importa quando o cliente a informa e o morador mudou de estrutura.
  if (intencao.versaoEsperada > 0 && intencao.moradorId) {
    const morador = obter(estado.moradores, intencao.moradorId);
    if (morador && morador.versao !== intencao.versaoEsperada) {
      const resultado: Resultado = { ok: false, comandoId, motivo: "versao_antiga" };
      lembrar(ctx, resultado);
      return resultado;
    }
  }

  const saida = executar(ctx, sessao, intencao);
  const resultado: Resultado = ehRecusa(saida)
    ? {
        ok: false,
        comandoId,
        motivo: saida.motivo,
        ...(saida.detalhe === undefined ? {} : { detalhe: saida.detalhe }),
      }
    : { ok: true, comandoId, tick: estado.relogio.tick, versoes: saida.versoes };
  lembrar(ctx, resultado);
  return resultado;
}
