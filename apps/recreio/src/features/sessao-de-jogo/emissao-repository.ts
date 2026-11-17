import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, db, eq, isNull, sql } from "@informach/db";
import { recreioGameSessions as games, recreioGameTickets as tickets } from "@informach/db/schema";
import { ErroDoRecreio, PerfilIdSchema, type SessaoDeJogoId } from "@informach/recreio";
import type { IngressoVerificado, SessaoAberta } from "@informach/recreio/contrato";
import type { Emissor, TokenEmitido } from "@informach/recreio/emissor";
import {
  admitirAparelhoDeJogo,
  prepararIdentidadeDoJogo,
  type ReferenciaDeJogador,
  recusarAutoridade,
} from "@/features/autoridade-de-jogo/aparelho-repository";
import { jogoQueAbre } from "@/features/jogos/config";
import {
  prepararConcessaoDeTempo,
  registrarConcessaoDeTempo,
} from "@/features/politicas/tempo-repository";
import {
  AGORA,
  codigoDoPostgres,
  type Transacao,
  travar,
  VIOLACAO_DE_UNICO,
} from "@/lib/repository";
import { encerrarSessoesAbertas } from "./encerramento-repository";
import { politicaDaAdmissao } from "./politica";
import type { SessaoDeJogoAtiva } from "./service";

type Admissao = Extract<Awaited<ReturnType<typeof admitirAparelhoDeJogo>>, { admitida: true }>;
type TempoPreparado = Awaited<ReturnType<typeof prepararConcessaoDeTempo>>;

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
  tempo: TempoPreparado | null,
) {
  const agora = await contexto.conferirPrazo();
  const limite = new Date(
    Math.min(
      contexto.decisao.validoAte?.getTime() ?? Infinity,
      contexto.aparelho.expiresAt.getTime(),
      tempo?.permitido ? tempo.expiraEm.getTime() : Infinity,
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
}): Promise<SessaoAberta> {
  try {
    const resultado = await db.transaction(async (tx) => {
      await limites(tx);
      const contexto = await admitir(tx, entrada.ingresso);
      if (!contexto.admitida) return contexto;
      if (entrada.ingresso.versaoDaPolitica !== contexto.versaoDaPolitica)
        return recusarAutoridade(new ErroDoRecreio("INGRESSO_INVALIDO"));
      const [recibo] = await tx
        .select({ id: tickets.jti })
        .from(tickets)
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
        .for("update");
      if (!recibo) throw new ErroDoRecreio("INGRESSO_INVALIDO");
      const [aberta] = await tx
        .select({ id: games.id, expiraEm: games.expiresAt, congeladaEm: games.checkpointFrozenAt })
        .from(games)
        .where(and(eq(games.profileId, entrada.ingresso.perfilId), isNull(games.endedAt)));
      const agora = await contexto.conferirPrazo();
      // Leitor anterior aos escritores de troca: uma barreira nunca é aceite implícito.
      if (aberta && aberta.congeladaEm !== null) throw new ErroDoRecreio("CHECKPOINT_PENDENTE");
      if (aberta && aberta.expiraEm > agora && !entrada.continuarAqui)
        throw new ErroDoRecreio("JA_ABERTO");
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
        tempo,
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
      if (tempo?.permitido)
        await registrarConcessaoDeTempo(
          tx,
          entrada.ingresso.perfilId,
          entrada.sid,
          tempo,
          token.expiraEm,
        );
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
      return {
        admitida: true as const,
        valor: {
          token: token.token,
          expiraEm: token.expiraEm.toISOString(),
          perfil: {
            profileId: entrada.ingresso.perfilId,
            apelido: contexto.perfil.nickname,
            avatar: contexto.perfil.avatar,
          },
          politica: politicaDaAdmissao(contexto, jogoQueAbre(entrada.ingresso.jogo)),
        },
      };
    });
    if (!resultado.admitida) throw comoRecusaDeEntrada(resultado.erro);
    return resultado.valor;
  } catch (erro) {
    if (codigoDoPostgres(erro) === VIOLACAO_DE_UNICO) throw new ErroDoRecreio("JA_ABERTO");
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
      tempo,
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
    const fim = await contexto.conferirPrazo();
    if (token.expiraEm <= fim) throw new ErroDoRecreio("ACESSO_PERDIDO", { motivo: "expired" });
    return {
      admitida: true as const,
      valor: { token: token.token, expiraEm: token.expiraEm.toISOString() },
    };
  });
  if (!resultado.admitida) throw resultado.erro;
  return resultado.valor;
}
