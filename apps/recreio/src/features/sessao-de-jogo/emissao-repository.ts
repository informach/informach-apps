import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { logAuditEventStrict } from "@informach/auth";
import { and, db, eq, isNull, sql } from "@informach/db";
import {
  recreioGameSessions as games,
  recreioSessionHandoffs as handoffs,
  recreioGameTickets as tickets,
} from "@informach/db/schema";
import {
  ErroDoRecreio,
  PerfilIdSchema,
  type SessaoDeJogoId,
  SessaoDeJogoIdSchema,
} from "@informach/recreio";
import type { IngressoVerificado, SessaoAberta } from "@informach/recreio/contrato";
import type { Emissor, TokenEmitido } from "@informach/recreio/emissor";
import {
  admitirAparelhoDeJogo,
  prepararIdentidadeDoJogo,
  type ReferenciaDeJogador,
  recusarAutoridade,
} from "@/features/autoridade-de-jogo/aparelho-repository";
import { conferirSessaoAdmitida } from "@/features/autoridade-de-jogo/sessao-repository";
import { jogoQueAbre } from "@/features/jogos/config";
import {
  prepararConcessaoDeTempo,
  registrarConcessaoDeTempo,
} from "@/features/politicas/tempo-repository";
import { emitirPermissaoDeSalvamento } from "@/features/salvamento/emissao-repository";
import { aguardarSalvamentoAnterior } from "@/features/salvamento/reconexao-repository";
import { env } from "@/lib/env";
import {
  AGORA,
  codigoDoPostgres,
  constraintDoPostgres,
  type Transacao,
  travar,
  VIOLACAO_DE_UNICO,
} from "@/lib/repository";
import { encerrarSessoesAbertas } from "./encerramento-repository";
import { politicaDaAdmissao } from "./politica";
import type { SessaoDeJogoAtiva } from "./service";
import { prepararTrocaDeAparelho } from "./troca-repository";

type Admissao = Extract<Awaited<ReturnType<typeof admitirAparelhoDeJogo>>, { admitida: true }>;

function hashDaChaveDeTroca(chave: string) {
  return createHash("sha256").update("recreio:ticket-exchange:v1\0").update(chave).digest("hex");
}

/** Diagnóstico da auditoria, sem acrescentar campos ao erro público. */
export class IngressoSemAparelhoValido extends ErroDoRecreio {
  constructor() {
    super("INGRESSO_INVALIDO");
  }
}

async function limites(tx: Transacao) {
  await tx.execute(sql`set local transaction_timeout='15s'`);
  await tx.execute(sql`set local statement_timeout='5s'`);
  await tx.execute(sql`set local lock_timeout='2s'`);
}
async function admitir(
  tx: Transacao,
  pedido: ReferenciaDeJogador & { jogo: string; expiraEm: number | null },
) {
  const identidade = await prepararIdentidadeDoJogo(tx, pedido);
  return admitirAparelhoDeJogo(tx, pedido, identidade, (t) =>
    travar(t, `recreio:game_sessions:perfil:${pedido.perfilId}`),
  );
}
function comoRecusaDeEntrada(erro: ErroDoRecreio) {
  if (erro.codigo === "ACESSO_PERDIDO")
    return new ErroDoRecreio("ACESSO_NEGADO", { ...erro.detalhe });
  if (erro.codigo === "SESSAO_INVALIDA") return new IngressoSemAparelhoValido();
  return erro;
}
async function assinarSessao(
  contexto: Admissao,
  emissor: Emissor,
  dados: { jogo: string; sid: SessaoDeJogoId },
  prazoAdicional: Date | null,
) {
  const agora = await contexto.conferirPrazo();
  const limite = new Date(
    Math.min(
      contexto.decisao.validoAte?.getTime() ?? Infinity,
      contexto.aparelho.expiresAt.getTime(),
      prazoAdicional?.getTime() ?? Infinity,
    ),
  );
  if (Math.floor(limite.getTime() / 1000) <= Math.floor(agora.getTime() / 1000))
    throw new ErroDoRecreio("ACESSO_PERDIDO", { motivo: "expired" });
  // O objeto vem do emissor Ed25519 local carregado na composição, sem rede na TX.
  const token = await emissor.sessao({
    ...dados,
    perfilId: PerfilIdSchema.parse(contexto.perfil.id),
    versaoDaPolitica: contexto.versaoDaPolitica,
    jti: crypto.randomUUID(),
    agora,
    validoAte: limite,
  });
  if (token.expiraEm > limite || token.expiraEm <= agora) throw new ErroDoRecreio("INDISPONIVEL");
  return { token, agora };
}

function respostaDaSessao(
  contexto: Admissao,
  ingresso: IngressoVerificado,
  token: TokenEmitido,
  suportaSocial = false,
): SessaoAberta {
  return {
    // A capacidade negociada conserva proteção; a política atual controla novos contatos.
    ...(suportaSocial ? { social: true as const } : {}),
    token: token.token,
    expiraEm: token.expiraEm.toISOString(),
    perfil: {
      profileId: ingresso.perfilId,
      apelido: contexto.perfil.nickname,
      avatar: contexto.perfil.avatar,
    },
    politica: politicaDaAdmissao(contexto, jogoQueAbre(ingresso.jogo)),
  };
}

/** Assinatura, recibo e autoridade atual são confirmados juntos. */
export async function registrarIngresso(
  entrada: ReferenciaDeJogador & { jogo: string; emissor: Emissor },
): Promise<TokenEmitido> {
  const resultado = await db.transaction(async (tx) => {
    await limites(tx);
    const contexto = await admitir(tx, { ...entrada, expiraEm: null });
    if (!contexto.admitida) return contexto;
    const agora = await contexto.conferirPrazo();
    const jti = crypto.randomUUID();
    const emitido = await entrada.emissor.ingresso({
      jogo: entrada.jogo,
      perfilId: entrada.perfilId,
      sessaoDeAparelhoId: entrada.sessaoDeAparelhoId,
      versaoDaPolitica: contexto.versaoDaPolitica,
      jti,
      agora,
    });
    await tx.insert(tickets).values({
      jti,
      profileId: entrada.perfilId,
      deviceSessionId: entrada.sessaoDeAparelhoId,
      gameId: entrada.jogo,
      issuedAt: agora,
      expiresAt: emitido.expiraEm,
    });
    await contexto.conferirPrazo();
    return { admitida: true as const, valor: emitido };
  });
  if (!resultado.admitida) throw comoRecusaDeEntrada(resultado.erro);
  return resultado.valor;
}

/** Consumo, tempo, sessão e auditoria revertem juntos se a assinatura falhar. */
export async function abrirSessaoComIngresso(entrada: {
  ingresso: IngressoVerificado;
  continuarAqui: boolean;
  sid: SessaoDeJogoId;
  emissor: Emissor;
  chaveDeTroca?: string;
  suportaSalvamento?: boolean;
  suportaSocial?: boolean;
}): Promise<SessaoAberta> {
  try {
    const resultado = await db.transaction(async (tx) => {
      await limites(tx);
      const contexto = await admitir(tx, entrada.ingresso);
      if (!contexto.admitida) return contexto;
      if (entrada.ingresso.versaoDaPolitica !== contexto.versaoDaPolitica)
        return recusarAutoridade(new ErroDoRecreio("INGRESSO_INVALIDO"));
      const [recibo] = await tx
        .select()
        .from(tickets)
        .where(
          and(
            eq(tickets.jti, entrada.ingresso.jti),
            eq(tickets.profileId, entrada.ingresso.perfilId),
            eq(tickets.deviceSessionId, entrada.ingresso.sessaoDeAparelhoId),
            eq(tickets.gameId, entrada.ingresso.jogo),
            sql`${tickets.expiresAt}>${AGORA}`,
          ),
        )
        .for("update");
      if (!recibo) throw new ErroDoRecreio("INGRESSO_INVALIDO");
      const hashDaTroca = entrada.chaveDeTroca ? hashDaChaveDeTroca(entrada.chaveDeTroca) : null;
      if (recibo.consumedAt !== null) {
        if (
          !hashDaTroca ||
          !recibo.exchangeKeyHash ||
          !recibo.openedSessionId ||
          !timingSafeEqual(
            Buffer.from(hashDaTroca, "hex"),
            Buffer.from(recibo.exchangeKeyHash, "hex"),
          )
        )
          throw new ErroDoRecreio("INGRESSO_INVALIDO");
        const conferida = await conferirSessaoAdmitida(
          tx,
          { ...entrada.ingresso, sid: SessaoDeJogoIdSchema.parse(recibo.openedSessionId) },
          contexto,
        );
        if (!conferida.admitida) throw new ErroDoRecreio("INGRESSO_INVALIDO");
        const { token } = await assinarSessao(
          contexto,
          entrada.emissor,
          { jogo: entrada.ingresso.jogo, sid: SessaoDeJogoIdSchema.parse(conferida.jogo.id) },
          conferida.jogo.expiresAt,
        );
        const salvamento = await emitirPermissaoDeSalvamento(tx, contexto, {
          sid: SessaoDeJogoIdSchema.parse(conferida.jogo.id),
          jogo: entrada.ingresso.jogo,
          emissor: entrada.emissor,
          token,
          operacao: "recuperar",
        });
        const fim = await contexto.conferirPrazo();
        if (token.expiraEm <= fim) throw new ErroDoRecreio("INGRESSO_INVALIDO");
        return {
          admitida: true as const,
          valor: {
            ...respostaDaSessao(contexto, entrada.ingresso, token, entrada.suportaSocial),
            ...(salvamento ? { salvamento } : {}),
          },
        };
      }
      const [aberta] = await tx
        .select({
          id: games.id,
          jogo: games.gameId,
          mundoId: games.spaceId,
          expiraEm: games.expiresAt,
          congeladaEm: games.checkpointFrozenAt,
        })
        .from(games)
        .where(and(eq(games.profileId, entrada.ingresso.perfilId), isNull(games.endedAt)));
      const agora = await contexto.conferirPrazo();
      let trocaConfirmada: string | null = null;
      let trocaExpiraEm: Date | null = null;
      if (
        aberta &&
        aberta.expiraEm > agora &&
        entrada.continuarAqui &&
        env.RECREIO_CHECKPOINT_MODE !== "on"
      )
        return recusarAutoridade(new ErroDoRecreio("CHECKPOINT_PENDENTE", { motivo: "manual" }));
      if (
        aberta &&
        entrada.continuarAqui &&
        env.RECREIO_CHECKPOINT_MODE === "on" &&
        (aberta.expiraEm > agora || aberta.congeladaEm !== null)
      ) {
        if (!hashDaTroca)
          return recusarAutoridade(new ErroDoRecreio("CHECKPOINT_PENDENTE", { motivo: "manual" }));
        const troca = await prepararTrocaDeAparelho(tx, contexto, entrada.ingresso, aberta);
        if (!troca.pronta) return recusarAutoridade(troca.erro);
        trocaConfirmada = troca.id;
        trocaExpiraEm = troca.expiraEm;
      }
      // Leitor anterior aos escritores de troca: uma barreira nunca é aceite implícito.
      if (aberta && aberta.congeladaEm !== null && !trocaConfirmada)
        throw new ErroDoRecreio("CHECKPOINT_PENDENTE");
      if (aberta && aberta.expiraEm > agora && !entrada.continuarAqui)
        throw new ErroDoRecreio("JA_ABERTO");
      await aguardarSalvamentoAnterior(tx, {
        perfilId: entrada.ingresso.perfilId,
        versaoDaPolitica: contexto.versaoDaPolitica,
        agora: await contexto.conferirPrazo(),
      });
      const tempo = contexto.politica
        ? await prepararConcessaoDeTempo(
            tx,
            entrada.ingresso.perfilId,
            contexto.politica.configuracao,
            agora,
          )
        : null;
      if (tempo && !tempo.permitido) {
        await encerrarSessoesAbertas(
          tx,
          sql`${games.profileId}=${entrada.ingresso.perfilId}`,
          "expired",
          { porQuem: "recreio" },
        );
        return recusarAutoridade(new ErroDoRecreio("ACESSO_NEGADO", { motivo: tempo.motivo }));
      }
      const [consumido] = await tx
        .update(tickets)
        .set({ consumedAt: AGORA })
        .where(
          and(
            eq(tickets.jti, entrada.ingresso.jti),
            eq(tickets.profileId, entrada.ingresso.perfilId),
            eq(tickets.deviceSessionId, entrada.ingresso.sessaoDeAparelhoId),
            eq(tickets.gameId, entrada.ingresso.jogo),
            isNull(tickets.consumedAt),
            sql`${tickets.expiresAt}>${AGORA}`,
          ),
        )
        .returning({ id: tickets.jti });
      if (!consumido) throw new ErroDoRecreio("INGRESSO_INVALIDO");
      let substituida: SessaoDeJogoId | null = null;
      if (aberta) {
        const [encerrada] = await encerrarSessoesAbertas(
          tx,
          sql`${games.id}=${aberta.id}`,
          aberta.expiraEm <= agora ? "expired" : "replaced",
          { porQuem: aberta.expiraEm <= agora ? "recreio" : "conta" },
        );
        substituida = encerrada?.sid ?? null;
      }
      const { token, agora: emitidaEm } = await assinarSessao(
        contexto,
        entrada.emissor,
        { jogo: entrada.ingresso.jogo, sid: entrada.sid },
        tempo?.permitido ? tempo.expiraEm : null,
      );
      await tx.insert(games).values({
        id: entrada.sid,
        profileId: entrada.ingresso.perfilId,
        deviceSessionId: entrada.ingresso.sessaoDeAparelhoId,
        gameId: entrada.ingresso.jogo,
        startedAt: emitidaEm,
        lastRenewedAt: emitidaEm,
        expiresAt: token.expiraEm,
      });
      await tx
        .update(tickets)
        .set({ openedSessionId: entrada.sid, exchangeKeyHash: hashDaTroca })
        .where(eq(tickets.jti, recibo.jti));
      if (trocaConfirmada) {
        const concluidaEm = await contexto.conferirPrazo();
        const [concluida] = await tx
          .update(handoffs)
          .set({ status: "completed", finishedAt: concluidaEm })
          .where(
            and(
              eq(handoffs.id, trocaConfirmada),
              eq(handoffs.status, "confirmed"),
              sql`${handoffs.expiresAt}>${AGORA}`,
            ),
          )
          .returning({ id: handoffs.id });
        if (!concluida) throw new ErroDoRecreio("CHECKPOINT_PENDENTE");
        await logAuditEventStrict(
          "recreio.session_handoff_completed",
          contexto.contaId,
          {
            app: "recreio",
            profileId: entrada.ingresso.perfilId,
            sessionId: entrada.sid,
            handoffId: trocaConfirmada,
            targetId: contexto.contaId,
          },
          { writer: tx },
        );
      }
      if (tempo?.permitido)
        await registrarConcessaoDeTempo(
          tx,
          entrada.ingresso.perfilId,
          entrada.sid,
          tempo,
          token.expiraEm,
        );
      const salvamento = await emitirPermissaoDeSalvamento(tx, contexto, {
        sid: entrada.sid,
        jogo: entrada.ingresso.jogo,
        emissor: entrada.emissor,
        token,
        operacao: "abrir",
        suportaSalvamento: entrada.suportaSalvamento,
      });
      await logAuditEventStrict(
        "recreio.game_session_started",
        contexto.contaId,
        {
          app: "recreio",
          sessionId: entrada.sid,
          profileId: entrada.ingresso.perfilId,
          gameId: entrada.ingresso.jogo,
          replacedSessionId: substituida,
          targetId: contexto.contaId,
        },
        { writer: tx },
      );
      const fim = await contexto.conferirPrazo();
      if (token.expiraEm <= fim) throw new ErroDoRecreio("INGRESSO_INVALIDO");
      if (trocaExpiraEm && trocaExpiraEm <= fim)
        throw new ErroDoRecreio("CHECKPOINT_PENDENTE", { motivo: "expired" });
      return {
        admitida: true as const,
        valor: {
          ...respostaDaSessao(contexto, entrada.ingresso, token, entrada.suportaSocial),
          ...(salvamento ? { salvamento } : {}),
        },
      };
    });
    if (!resultado.admitida) throw comoRecusaDeEntrada(resultado.erro);
    return resultado.valor;
  } catch (erro) {
    if (
      codigoDoPostgres(erro) === VIOLACAO_DE_UNICO &&
      constraintDoPostgres(erro) === "recreio_game_sessions_one_open"
    )
      throw new ErroDoRecreio("JA_ABERTO");
    if (erro instanceof ErroDoRecreio) throw comoRecusaDeEntrada(erro);
    throw erro;
  }
}

/** Só o caminho de encerramento toma o cursor; renovação normal não serializa todos os perfis. */
export async function gravarRenovacao(entrada: {
  sessao: SessaoDeJogoAtiva & ReferenciaDeJogador;
  emissor: Emissor;
}) {
  const resultado = await db.transaction(async (tx) => {
    await limites(tx);
    const contexto = await admitir(tx, entrada.sessao);
    if (!contexto.admitida) return contexto;
    const [atual] = await tx
      .select()
      .from(games)
      .where(eq(games.id, entrada.sessao.sid))
      .for("update");
    const agora = await contexto.conferirPrazo();
    if (
      !atual ||
      atual.profileId !== entrada.sessao.perfilId ||
      atual.deviceSessionId !== entrada.sessao.sessaoDeAparelhoId ||
      atual.gameId !== entrada.sessao.jogo
    )
      throw new ErroDoRecreio("SESSAO_INVALIDA");
    if (atual.endedAt)
      return recusarAutoridade(
        new ErroDoRecreio("SESSAO_ENCERRADA", { motivo: atual.endReason ?? "expired" }),
      );
    if (atual.checkpointFrozenAt !== null)
      return recusarAutoridade(new ErroDoRecreio("SESSAO_ENCERRADA", { motivo: "checkpoint" }));
    if (atual.expiresAt <= agora || entrada.sessao.versaoDaPolitica !== contexto.versaoDaPolitica)
      return recusarAutoridade(
        new ErroDoRecreio("ACESSO_PERDIDO", {
          motivo: atual.expiresAt <= agora ? "expired" : "permissions_changed",
        }),
      );
    const tempo = contexto.politica
      ? await prepararConcessaoDeTempo(
          tx,
          entrada.sessao.perfilId,
          contexto.politica.configuracao,
          agora,
        )
      : null;
    if (tempo && !tempo.permitido)
      return recusarAutoridade(new ErroDoRecreio("ACESSO_PERDIDO", { motivo: tempo.motivo }));
    const { token, agora: renovadaEm } = await assinarSessao(
      contexto,
      entrada.emissor,
      { jogo: entrada.sessao.jogo, sid: entrada.sessao.sid },
      tempo?.permitido ? tempo.expiraEm : null,
    );
    await tx
      .update(games)
      .set({ expiresAt: token.expiraEm, lastRenewedAt: renovadaEm })
      .where(eq(games.id, atual.id));
    if (tempo?.permitido)
      await registrarConcessaoDeTempo(
        tx,
        entrada.sessao.perfilId,
        entrada.sessao.sid,
        tempo,
        token.expiraEm,
      );
    const salvamento = await emitirPermissaoDeSalvamento(tx, contexto, {
      sid: entrada.sessao.sid,
      jogo: entrada.sessao.jogo,
      emissor: entrada.emissor,
      token,
      operacao: "renovar",
    });
    const fim = await contexto.conferirPrazo();
    if (token.expiraEm <= fim) throw new ErroDoRecreio("ACESSO_PERDIDO", { motivo: "expired" });
    return {
      admitida: true as const,
      valor: {
        token: token.token,
        expiraEm: token.expiraEm.toISOString(),
        ...(salvamento ? { salvamento } : {}),
      },
    };
  });
  if (!resultado.admitida) throw resultado.erro;
  return resultado.valor;
}
