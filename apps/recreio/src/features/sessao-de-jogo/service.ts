import "server-only";
import {
  type DecisaoDeAcesso,
  ErroDoRecreio,
  type PerfilId,
  type SessaoDeAparelhoId,
  type SessaoDeJogoId,
  SessaoDeJogoIdSchema,
} from "@informach/recreio";
import {
  PedidoDeIngressoSchema,
  type SessaoAberta,
  TrocaDeIngressoSchema,
} from "@informach/recreio/contrato";
import {
  type TokenEmitido,
  verificarIngresso,
  verificarSessaoEmitida,
} from "@informach/recreio/emissor";
import { avaliarAcesso } from "@/features/acesso/service";
import { jogoQueAbre, manifestoDoJogo } from "@/features/jogos/config";
import { conferirSessaoDeAparelho } from "@/features/sessao/service";
import { audit } from "@/lib/observability";
import { chavesDoRecreio } from "@/lib/tokens";
import { politicaDoPerfil } from "./politica";
import {
  abrirSessaoComIngresso,
  encerrarSessaoDeJogo,
  gravarRenovacao,
  lerSessaoDeJogo,
  registrarIngresso,
} from "./repository";

/**
 * Ingresso e sessão de jogo. O jogo nunca recebe a conta: o ingresso e a
 * sessão levam o perfil, e o perfil sai sempre da sessão de aparelho, no
 * servidor.
 */

function semAcesso(
  codigo: "ACESSO_NEGADO" | "ACESSO_PERDIDO",
  decisao: Pick<DecisaoDeAcesso, "estado" | "motivo">,
): ErroDoRecreio {
  return new ErroDoRecreio(codigo, { estado: decisao.estado, motivo: decisao.motivo });
}

/** O direito de jogar do perfil, ou a recusa `ACESSO_NEGADO` com o estado e o motivo. */
export async function exigirAcesso(perfilId: PerfilId, jogo: string): Promise<DecisaoDeAcesso> {
  const decisao = await avaliarAcesso({ profileId: perfilId, gameId: jogo });
  if (!decisao.podeJogar) throw semAcesso("ACESSO_NEGADO", decisao);
  return decisao;
}

/** Recusa de um ingresso que tinha assinatura válida: vale um registro, sem o token. */
function ingressoRecusado(
  ingresso: { perfilId: PerfilId; jogo: string },
  motivo: "used_or_expired" | "device_session" | "access" | "game",
): void {
  audit({
    eventType: "recreio.ticket_rejected",
    actorId: null,
    payload: { profileId: ingresso.perfilId, gameId: ingresso.jogo, reason: motivo },
  });
}

/**
 * Emite o ingresso para o perfil ativo do aparelho. O perfil vem do ator
 * (sessão de login conferida pela rota), nunca do pedido.
 */
export async function emitirIngresso(
  ator: { sessaoDeAparelhoId: SessaoDeAparelhoId; perfil: { id: PerfilId } },
  entrada: unknown,
): Promise<{ ingresso: string; expiraEm: string }> {
  const { jogo } = PedidoDeIngressoSchema.parse(entrada);
  const decisao = await exigirAcesso(ator.perfil.id, jogo);
  jogoQueAbre(jogo);
  const { emissor } = await chavesDoRecreio();
  const jti = crypto.randomUUID();
  const agora = new Date();
  const emitido = await emissor.ingresso({
    jogo,
    perfilId: ator.perfil.id,
    sessaoDeAparelhoId: ator.sessaoDeAparelhoId,
    versaoDaPolitica: decisao.versaoDaPolitica,
    jti,
    agora,
  });
  await registrarIngresso({
    jti,
    perfilId: ator.perfil.id,
    sessaoDeAparelhoId: ator.sessaoDeAparelhoId,
    jogo,
    emitidoEm: agora,
    expiraEm: emitido.expiraEm,
  });
  return { ingresso: emitido.token, expiraEm: emitido.expiraEm.toISOString() };
}

/** Assina a sessão de jogo; acesso que termina neste segundo não dá sessão. */
async function assinarSessao(dados: {
  jogo: string;
  perfilId: PerfilId;
  sid: SessaoDeJogoId;
  decisao: DecisaoDeAcesso;
  agora: Date;
  recusa: "ACESSO_NEGADO" | "ACESSO_PERDIDO";
}): Promise<TokenEmitido> {
  const { validoAte } = dados.decisao;
  const segundo = Math.floor(dados.agora.getTime() / 1000);
  if (validoAte !== null && Math.floor(validoAte.getTime() / 1000) <= segundo)
    throw semAcesso(dados.recusa, dados.decisao);
  const { emissor } = await chavesDoRecreio();
  return emissor.sessao({
    jogo: dados.jogo,
    perfilId: dados.perfilId,
    sid: dados.sid,
    versaoDaPolitica: dados.decisao.versaoDaPolitica,
    jti: crypto.randomUUID(),
    agora: dados.agora,
    validoAte,
  });
}

/**
 * Troca o ingresso pela sessão de jogo. Quem autentica é o ingresso: não há
 * cookie neste pedido. Mesmo assim a sessão de aparelho que pediu o ingresso,
 * e a sessão de login por trás dela, precisam continuar valendo.
 */
export async function trocarIngresso(entrada: unknown): Promise<SessaoAberta> {
  const pedido = TrocaDeIngressoSchema.parse(entrada);
  const { emissor, chaves } = await chavesDoRecreio();
  const ingresso = await verificarIngresso(pedido.ingresso, { chaves, emissor: emissor.emissor });
  // Audiência que não é um jogo do catálogo nunca saiu daqui.
  if (!manifestoDoJogo(ingresso.jogo)) throw new ErroDoRecreio("INGRESSO_INVALIDO");
  try {
    jogoQueAbre(ingresso.jogo);
  } catch (erro) {
    ingressoRecusado(ingresso, "game");
    throw erro;
  }

  const aparelho = await conferirSessaoDeAparelho({
    sessaoDeAparelhoId: ingresso.sessaoDeAparelhoId,
    perfilId: ingresso.perfilId,
  });
  if (!aparelho.viva) {
    ingressoRecusado(ingresso, "device_session");
    throw new ErroDoRecreio("INGRESSO_INVALIDO");
  }
  const politica = politicaDoPerfil(aparelho.perfil);

  let decisao: DecisaoDeAcesso;
  try {
    decisao = await exigirAcesso(ingresso.perfilId, ingresso.jogo);
  } catch (erro) {
    ingressoRecusado(ingresso, "access");
    throw erro;
  }

  const agora = new Date();
  const sid = SessaoDeJogoIdSchema.parse(crypto.randomUUID());
  // O token é assinado antes da transação e só é entregue se ela confirmar.
  const sessao = await assinarSessao({
    jogo: ingresso.jogo,
    perfilId: ingresso.perfilId,
    sid,
    decisao,
    agora,
    recusa: "ACESSO_NEGADO",
  });
  try {
    await abrirSessaoComIngresso({
      jti: ingresso.jti,
      perfilId: ingresso.perfilId,
      sessaoDeAparelhoId: ingresso.sessaoDeAparelhoId,
      jogo: ingresso.jogo,
      sid,
      agora,
      expiraEm: sessao.expiraEm,
      continuarAqui: pedido.continuarAqui === true,
    });
  } catch (erro) {
    if (erro instanceof ErroDoRecreio && erro.codigo === "INGRESSO_INVALIDO")
      ingressoRecusado(ingresso, "used_or_expired");
    throw erro;
  }
  return {
    token: sessao.token,
    expiraEm: sessao.expiraEm.toISOString(),
    perfil: {
      profileId: aparelho.perfil.id,
      apelido: aparelho.perfil.apelido,
      avatar: aparelho.perfil.avatar,
    },
    politica,
  };
}

export type SessaoDeJogoAtiva = { perfilId: PerfilId; sid: SessaoDeJogoId; jogo: string };

type SessaoConferida = SessaoDeJogoAtiva & {
  sessaoDeAparelhoId: SessaoDeAparelhoId;
  /** `null` enquanto a sessão está aberta. */
  motivoDoFim: string | null;
};

/**
 * Confere o token da sessão de jogo (assinatura, tipo, emissor e prazo) e a
 * linha dela no banco. Token que não confere, de jogo que não existe ou sem
 * linha correspondente: `SESSAO_INVALIDA`, sem dizer qual.
 */
async function conferirToken(token: string | null): Promise<SessaoConferida> {
  if (!token) throw new ErroDoRecreio("SESSAO_INVALIDA");
  const { emissor, chaves } = await chavesDoRecreio();
  const claims = await verificarSessaoEmitida(token, { chaves, emissor: emissor.emissor });
  const linha = manifestoDoJogo(claims.jogo) ? await lerSessaoDeJogo(claims.sid) : null;
  if (!linha || linha.perfilId !== claims.perfilId || linha.jogo !== claims.jogo)
    throw new ErroDoRecreio("SESSAO_INVALIDA");
  return {
    perfilId: linha.perfilId,
    sid: linha.sid,
    jogo: linha.jogo,
    sessaoDeAparelhoId: linha.sessaoDeAparelhoId,
    motivoDoFim: linha.encerradaEm === null ? null : (linha.motivoDoFim ?? "expired"),
  };
}

/**
 * A sessão de jogo de um pedido do SDK: token válido e sessão ainda aberta.
 * É o que as rotas de mundos usam para saber quem está pedindo.
 */
export async function sessaoDeJogoDoToken(token: string | null): Promise<SessaoDeJogoAtiva> {
  const sessao = await conferirToken(token);
  if (sessao.motivoDoFim !== null)
    throw new ErroDoRecreio("SESSAO_ENCERRADA", { motivo: sessao.motivoDoFim });
  return { perfilId: sessao.perfilId, sid: sessao.sid, jogo: sessao.jogo };
}

/**
 * Renova a sessão de jogo: mesmo `sid`, token novo. Só renova se a sessão de
 * aparelho e a de login continuam de pé e o perfil ainda tem o direito de
 * jogar. Se não, a sessão é encerrada aqui mesmo (a instância fica sabendo no
 * próximo batimento) e a resposta é `ACESSO_PERDIDO`.
 */
export async function renovarSessao(
  token: string | null,
): Promise<{ token: string; expiraEm: string }> {
  const sessao = await conferirToken(token);
  if (sessao.motivoDoFim !== null)
    throw new ErroDoRecreio("SESSAO_ENCERRADA", { motivo: sessao.motivoDoFim });

  const aparelho = await conferirSessaoDeAparelho({
    sessaoDeAparelhoId: sessao.sessaoDeAparelhoId,
    perfilId: sessao.perfilId,
  });
  if (!aparelho.viva) {
    await encerrarSessaoDeJogo({ sid: sessao.sid, motivo: aparelho.motivo, porQuem: "recreio" });
    throw new ErroDoRecreio("ACESSO_PERDIDO", { motivo: aparelho.motivo });
  }

  const decisao = await avaliarAcesso({ profileId: sessao.perfilId, gameId: sessao.jogo });
  if (!decisao.podeJogar) {
    await encerrarSessaoDeJogo({ sid: sessao.sid, motivo: "access_lost", porQuem: "recreio" });
    throw semAcesso("ACESSO_PERDIDO", decisao);
  }

  const agora = new Date();
  let renovada: TokenEmitido;
  try {
    renovada = await assinarSessao({
      jogo: sessao.jogo,
      perfilId: sessao.perfilId,
      sid: sessao.sid,
      decisao,
      agora,
      recusa: "ACESSO_PERDIDO",
    });
  } catch (erro) {
    if (erro instanceof ErroDoRecreio && erro.codigo === "ACESSO_PERDIDO")
      await encerrarSessaoDeJogo({ sid: sessao.sid, motivo: "access_lost", porQuem: "recreio" });
    throw erro;
  }
  const gravou = await gravarRenovacao({ sid: sessao.sid, agora, expiraEm: renovada.expiraEm });
  // Encerrada entre a conferência e a gravação: o token novo não sai daqui.
  if (!gravou) throw new ErroDoRecreio("SESSAO_ENCERRADA");
  return { token: renovada.token, expiraEm: renovada.expiraEm.toISOString() };
}

/** Sai do jogo. Repetir, ou sair de uma sessão que já acabou, não faz nada. */
export async function sairDaSessao(token: string | null): Promise<void> {
  const sessao = await conferirToken(token);
  if (sessao.motivoDoFim !== null) return;
  await encerrarSessaoDeJogo({ sid: sessao.sid, motivo: "left", porQuem: "conta" });
}
