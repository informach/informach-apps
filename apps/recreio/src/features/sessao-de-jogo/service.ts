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
  type SessaoRenovada,
  TrocaDeIngressoSchema,
} from "@informach/recreio/contrato";
import { verificarIngresso, verificarSessaoEmitida } from "@informach/recreio/emissor";
import { avaliarAcesso } from "@/features/acesso/service";
import { PrazoDaCredencialVencido } from "@/features/autoridade-de-jogo/aparelho-repository";
import { jogoQueAbre, manifestoDoJogo } from "@/features/jogos/config";
import { audit } from "@/lib/observability";
import { limitarTentativas } from "@/lib/rate-limit";
import { chavesDoRecreio } from "@/lib/tokens";
import {
  abrirSessaoComIngresso,
  encerrarSessaoDeJogo,
  gravarRenovacao,
  IngressoSemAparelhoValido,
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
  await limitarTentativas({ chave: `ingresso:${ator.perfil.id}`, max: 20, janelaEmSegundos: 60 });
  jogoQueAbre(jogo);
  const { emissor } = await chavesDoRecreio();
  const emitido = await registrarIngresso({
    perfilId: ator.perfil.id,
    sessaoDeAparelhoId: ator.sessaoDeAparelhoId,
    jogo,
    emissor,
  });
  return { ingresso: emitido.token, expiraEm: emitido.expiraEm.toISOString() };
}

/** A assinatura e o consumo são admitidos na mesma transação da autoridade. */
export async function trocarIngresso(entrada: unknown): Promise<SessaoAberta> {
  const pedido = TrocaDeIngressoSchema.parse(entrada);
  const { emissor, chaves } = await chavesDoRecreio();
  const ingresso = await verificarIngresso(pedido.ingresso, { chaves, emissor: emissor.emissor });
  await limitarTentativas({
    chave: `trocar-ingresso:${ingresso.perfilId}`,
    max: 60,
    janelaEmSegundos: 60,
  });
  if (!manifestoDoJogo(ingresso.jogo)) throw new ErroDoRecreio("INGRESSO_INVALIDO");
  try {
    jogoQueAbre(ingresso.jogo);
  } catch (erro) {
    ingressoRecusado(ingresso, "game");
    throw erro;
  }
  try {
    return await abrirSessaoComIngresso({
      ingresso,
      continuarAqui: pedido.continuarAqui === true,
      chaveDeTroca: pedido.chaveDeTroca,
      suportaSalvamento: pedido.suportaSalvamento,
      suportaSocial: pedido.suportaSocial,
      suportaConvitesDirigidos: pedido.suportaConvitesDirigidos,
      sid: SessaoDeJogoIdSchema.parse(crypto.randomUUID()),
      emissor,
    });
  } catch (erro) {
    if (erro instanceof ErroDoRecreio) {
      if (erro.codigo === "INGRESSO_INVALIDO")
        ingressoRecusado(
          ingresso,
          erro instanceof IngressoSemAparelhoValido ? "device_session" : "used_or_expired",
        );
      else if (erro.codigo === "ACESSO_NEGADO") ingressoRecusado(ingresso, "access");
    }
    throw erro;
  }
}

export type SessaoDeJogoAtiva = {
  perfilId: PerfilId;
  sid: SessaoDeJogoId;
  jogo: string;
  /** Prazo e política do token recebido, não de uma renovação posterior. */
  expiraEm: number;
  versaoDaPolitica: number;
};

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
    expiraEm: claims.expiraEm,
    versaoDaPolitica: claims.versaoDaPolitica,
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
  const { perfilId, sid, jogo, expiraEm, versaoDaPolitica } = sessao;
  return { perfilId, sid, jogo, expiraEm, versaoDaPolitica };
}

/**
 * Renova a sessão de jogo: mesmo `sid`, token novo. Só renova se a sessão de
 * aparelho e a de login continuam de pé e o perfil ainda tem o direito de
 * jogar. Se não, a sessão é encerrada aqui mesmo (a instância fica sabendo no
 * próximo batimento) e a resposta é `ACESSO_PERDIDO`.
 */
export async function renovarSessao(token: string | null): Promise<SessaoRenovada> {
  const sessao = await conferirToken(token);
  if (sessao.motivoDoFim !== null)
    throw new ErroDoRecreio("SESSAO_ENCERRADA", { motivo: sessao.motivoDoFim });
  await limitarTentativas({
    chave: `renovar-sessao:${sessao.perfilId}`,
    max: 120,
    janelaEmSegundos: 60,
  });
  try {
    jogoQueAbre(sessao.jogo);
  } catch (erro) {
    if (erro instanceof ErroDoRecreio && erro.codigo === "JOGO_INDISPONIVEL")
      await encerrarSessaoDeJogo({ sid: sessao.sid, motivo: "access_lost", porQuem: "recreio" });
    throw erro;
  }
  const { emissor } = await chavesDoRecreio();
  try {
    return await gravarRenovacao({ sessao, emissor });
  } catch (erro) {
    if (erro instanceof ErroDoRecreio) {
      if (erro.codigo === "SESSAO_INVALIDA") {
        const motivo = erro instanceof PrazoDaCredencialVencido ? "expired" : "signed_out";
        await encerrarSessaoDeJogo({ sid: sessao.sid, motivo, porQuem: "recreio" });
        throw new ErroDoRecreio("ACESSO_PERDIDO", { motivo });
      }
      if (erro.codigo === "ACESSO_PERDIDO" || erro.codigo === "POLITICA_INCOMPATIVEL") {
        const motivo =
          erro.codigo === "POLITICA_INCOMPATIVEL" || erro.detalhe.motivo === "permissions_changed"
            ? "permissions_changed"
            : ["expired", "daily_limit", "schedule", "paused"].includes(String(erro.detalhe.motivo))
              ? "expired"
              : "access_lost";
        // Nenhuma linha de jogo fica travada nesta transação de encerramento.
        await encerrarSessaoDeJogo({ sid: sessao.sid, motivo, porQuem: "recreio" });
        if (erro.codigo === "POLITICA_INCOMPATIVEL")
          throw new ErroDoRecreio("ACESSO_PERDIDO", { motivo: "permissions_changed" });
      }
    }
    throw erro;
  }
}

/** Sai do jogo. Repetir, ou sair de uma sessão que já acabou, não faz nada. */
export async function sairDaSessao(token: string | null): Promise<void> {
  const sessao = await conferirToken(token);
  if (sessao.motivoDoFim !== null) return;
  await encerrarSessaoDeJogo({ sid: sessao.sid, motivo: "left", porQuem: "conta" });
}
