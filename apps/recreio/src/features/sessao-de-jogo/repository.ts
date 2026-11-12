import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, db, eq, inArray, isNull, lt, sql } from "@informach/db";
import {
  recreioDeviceSessions as deviceSessions,
  recreioGameSessions as gameSessions,
  recreioGameTickets as tickets,
} from "@informach/db/schema";
import {
  ErroDoRecreio,
  type PerfilId,
  PerfilIdSchema,
  type SessaoDeAparelhoId,
  SessaoDeAparelhoIdSchema,
  type SessaoDeJogoId,
  SessaoDeJogoIdSchema,
} from "@informach/recreio";
import type { MotivoDeSessaoEncerrada } from "@informach/recreio/contrato";
import {
  AGORA,
  codigoDoPostgres,
  type Transacao,
  travar,
  VIOLACAO_DE_UNICO,
} from "@/lib/repository";

/**
 * Ingressos e sessões de jogo no banco.
 *
 * **Encerrar uma sessão** grava `ended_at`, `end_reason` e `ended_seq` no
 * mesmo comando (a tabela confere). `ended_seq` vem de uma sequência, e a
 * sequência entrega o número antes do commit: sem cuidado, a transação que
 * pegou o 6 poderia confirmar antes da que pegou o 5, e uma instância que leu
 * "tudo depois do 4" e guardou o cursor 6 nunca veria o 5. Por isso todo
 * encerramento passa por `encerrarSessoesAbertas`, que pega uma trava de
 * transação (`pg_advisory_xact_lock`) antes de pedir o número e só a solta no
 * commit. Os números são confirmados na ordem em que foram entregues, e quem
 * lê `ended_seq > cursor` nunca pula um.
 *
 * Ordem das travas, para não haver espera em círculo: quem vai encerrar pega
 * a trava dos encerramentos **antes** de tocar em linhas de `game_sessions`, e
 * ninguém a pede já segurando uma dessas linhas. A renovação e a entrada num
 * mundo mexem em uma linha com um comando só e não pedem a trava.
 */

const TRAVA_DOS_ENCERRAMENTOS = "recreio:game_sessions:encerramento";

export type SessaoEncerrada = { sid: SessaoDeJogoId; perfilId: PerfilId; jogo: string };

/**
 * Encerra as sessões de jogo abertas que casam com `filtro`, dentro da
 * transação de quem chama, e grava um evento de auditoria por sessão na mesma
 * transação. Repetir não faz nada: sessão já encerrada não casa mais.
 *
 * `porQuem` diz quem causou o fim: a `conta` da própria sessão (sair do jogo,
 * sair da conta, continuar em outro aparelho) ou o `recreio` (acesso perdido,
 * prazo vencido). No evento, a conta da sessão vai sempre em `targetId`, e é
 * também o ator quando foi ela.
 */
export async function encerrarSessoesAbertas(
  tx: Transacao,
  filtro: ReturnType<typeof sql>,
  motivo: MotivoDeSessaoEncerrada,
  opcoes: { porQuem: "conta" | "recreio" },
): Promise<SessaoEncerrada[]> {
  await travar(tx, TRAVA_DOS_ENCERRAMENTOS);
  const encerradas = await tx
    .update(gameSessions)
    .set({
      endedAt: AGORA,
      endReason: motivo,
      endedSeq: sql`nextval('recreio.game_session_end_seq')`,
    })
    .where(and(isNull(gameSessions.endedAt), filtro))
    .returning({
      id: gameSessions.id,
      profileId: gameSessions.profileId,
      gameId: gameSessions.gameId,
      deviceSessionId: gameSessions.deviceSessionId,
    });
  if (encerradas.length === 0) return [];
  const aparelhos = await tx
    .select({ id: deviceSessions.id, userId: deviceSessions.userId })
    .from(deviceSessions)
    .where(
      inArray(
        deviceSessions.id,
        encerradas.map((sessao) => sessao.deviceSessionId),
      ),
    );
  const contaDoAparelho = new Map(aparelhos.map((aparelho) => [aparelho.id, aparelho.userId]));
  for (const sessao of encerradas) {
    const conta = contaDoAparelho.get(sessao.deviceSessionId) ?? null;
    await logAuditEventStrict(
      "recreio.game_session_ended",
      opcoes.porQuem === "conta" ? conta : null,
      {
        app: "recreio",
        sessionId: sessao.id,
        profileId: sessao.profileId,
        gameId: sessao.gameId,
        reason: motivo,
        targetId: conta,
      },
      { writer: tx },
    );
  }
  return encerradas.map((sessao) => ({
    sid: SessaoDeJogoIdSchema.parse(sessao.id),
    perfilId: PerfilIdSchema.parse(sessao.profileId),
    jogo: sessao.gameId,
  }));
}

/** Encerra uma sessão de jogo pelo id. Devolve se ela estava aberta. */
export async function encerrarSessaoDeJogo(entrada: {
  sid: SessaoDeJogoId;
  motivo: MotivoDeSessaoEncerrada;
  porQuem: "conta" | "recreio";
}): Promise<boolean> {
  return db.transaction(async (tx) => {
    const encerradas = await encerrarSessoesAbertas(
      tx,
      sql`${gameSessions.id} = ${entrada.sid}`,
      entrada.motivo,
      { porQuem: entrada.porQuem },
    );
    return encerradas.length > 0;
  });
}

/** Encerra as sessões de jogo cujo prazo passou sem renovação. Devolve quantas. */
export async function encerrarSessoesVencidas(): Promise<number> {
  return db.transaction(async (tx) => {
    const encerradas = await encerrarSessoesAbertas(
      tx,
      sql`${gameSessions.expiresAt} <= ${AGORA}`,
      "expired",
      { porQuem: "recreio" },
    );
    return encerradas.length;
  });
}

/** Apaga ingressos vencidos há mais de um dia, usados ou não. Devolve quantos. */
export async function apagarIngressosAntigos(): Promise<number> {
  const apagados = await db
    .delete(tickets)
    .where(lt(tickets.expiresAt, sql`now() - interval '1 day'`))
    .returning({ jti: tickets.jti });
  return apagados.length;
}

export async function registrarIngresso(entrada: {
  jti: string;
  perfilId: PerfilId;
  sessaoDeAparelhoId: SessaoDeAparelhoId;
  jogo: string;
  emitidoEm: Date;
  expiraEm: Date;
}): Promise<void> {
  await db.insert(tickets).values({
    jti: entrada.jti,
    profileId: entrada.perfilId,
    deviceSessionId: entrada.sessaoDeAparelhoId,
    gameId: entrada.jogo,
    issuedAt: entrada.emitidoEm,
    expiresAt: entrada.expiraEm,
  });
}

/**
 * A troca do ingresso pela sessão de jogo, numa transação só:
 *
 * 1. as trocas do mesmo perfil passam uma de cada vez;
 * 2. o ingresso é consumido (`jti` ainda não usado e dentro do prazo, e do
 *    mesmo perfil, aparelho e jogo que o token diz); zero linhas é
 *    `INGRESSO_INVALIDO`;
 * 3. a sessão de aparelho é conferida de novo e fica travada para leitura até
 *    o commit, de modo que uma saída da conta ao mesmo tempo espere e depois
 *    encerre também a sessão criada aqui;
 * 4. se o perfil já tem uma sessão de jogo aberta: sem `continuarAqui`,
 *    `JA_ABERTO` (e a transação volta, o ingresso continua valendo); com ele,
 *    a anterior é encerrada como `replaced`;
 * 5. a sessão nova é inserida.
 *
 * O direito de jogar é avaliado por quem chama imediatamente antes: avaliá-lo
 * aqui dentro pediria uma segunda conexão do pool para cada pedido.
 */
export async function abrirSessaoComIngresso(entrada: {
  jti: string;
  perfilId: PerfilId;
  sessaoDeAparelhoId: SessaoDeAparelhoId;
  jogo: string;
  /** O `sid` que já está assinado no token da sessão. */
  sid: SessaoDeJogoId;
  agora: Date;
  expiraEm: Date;
  continuarAqui: boolean;
}): Promise<{ substituida: SessaoDeJogoId | null }> {
  try {
    return await db.transaction(async (tx) => {
      await travar(tx, `recreio:game_sessions:perfil:${entrada.perfilId}`);
      const [ingresso] = await tx
        .update(tickets)
        .set({ consumedAt: sql`now()` })
        .where(
          and(
            eq(tickets.jti, entrada.jti),
            isNull(tickets.consumedAt),
            sql`${tickets.expiresAt} > now()`,
            eq(tickets.profileId, entrada.perfilId),
            eq(tickets.deviceSessionId, entrada.sessaoDeAparelhoId),
            eq(tickets.gameId, entrada.jogo),
          ),
        )
        .returning({ jti: tickets.jti });
      if (!ingresso) throw new ErroDoRecreio("INGRESSO_INVALIDO");

      const [aparelho] = await tx
        .select({ userId: deviceSessions.userId })
        .from(deviceSessions)
        .where(
          and(
            eq(deviceSessions.id, entrada.sessaoDeAparelhoId),
            isNull(deviceSessions.revokedAt),
            sql`${deviceSessions.expiresAt} > now()`,
            eq(deviceSessions.activeProfileId, entrada.perfilId),
          ),
        )
        .for("share");
      if (!aparelho) throw new ErroDoRecreio("INGRESSO_INVALIDO");

      const [aberta] = await tx
        .select({ id: gameSessions.id })
        .from(gameSessions)
        .where(and(eq(gameSessions.profileId, entrada.perfilId), isNull(gameSessions.endedAt)));
      let substituida: SessaoDeJogoId | null = null;
      if (aberta) {
        if (!entrada.continuarAqui) throw new ErroDoRecreio("JA_ABERTO");
        const [encerrada] = await encerrarSessoesAbertas(
          tx,
          sql`${gameSessions.id} = ${aberta.id}`,
          "replaced",
          { porQuem: "conta" },
        );
        substituida = encerrada?.sid ?? null;
      }

      await tx.insert(gameSessions).values({
        id: entrada.sid,
        profileId: entrada.perfilId,
        deviceSessionId: entrada.sessaoDeAparelhoId,
        gameId: entrada.jogo,
        startedAt: entrada.agora,
        lastRenewedAt: entrada.agora,
        expiresAt: entrada.expiraEm,
      });
      await logAuditEventStrict(
        "recreio.game_session_started",
        aparelho.userId,
        {
          app: "recreio",
          sessionId: entrada.sid,
          profileId: entrada.perfilId,
          gameId: entrada.jogo,
          replacedSessionId: substituida,
          targetId: aparelho.userId,
        },
        { writer: tx },
      );
      return { substituida };
    });
  } catch (erro) {
    // O índice "uma sessão de jogo aberta por perfil" é a última palavra.
    if (codigoDoPostgres(erro) === VIOLACAO_DE_UNICO) throw new ErroDoRecreio("JA_ABERTO");
    throw erro;
  }
}

export type SessaoDeJogoLida = {
  sid: SessaoDeJogoId;
  perfilId: PerfilId;
  sessaoDeAparelhoId: SessaoDeAparelhoId;
  jogo: string;
  encerradaEm: Date | null;
  motivoDoFim: MotivoDeSessaoEncerrada | null;
};

export async function lerSessaoDeJogo(sid: SessaoDeJogoId): Promise<SessaoDeJogoLida | null> {
  const [linha] = await db
    .select({
      id: gameSessions.id,
      profileId: gameSessions.profileId,
      deviceSessionId: gameSessions.deviceSessionId,
      gameId: gameSessions.gameId,
      endedAt: gameSessions.endedAt,
      endReason: gameSessions.endReason,
    })
    .from(gameSessions)
    .where(eq(gameSessions.id, sid));
  if (!linha) return null;
  return {
    sid: SessaoDeJogoIdSchema.parse(linha.id),
    perfilId: PerfilIdSchema.parse(linha.profileId),
    sessaoDeAparelhoId: SessaoDeAparelhoIdSchema.parse(linha.deviceSessionId),
    jogo: linha.gameId,
    encerradaEm: linha.endedAt,
    motivoDoFim: linha.endReason,
  };
}

/**
 * Grava a renovação. Um comando só, que não casa com sessão encerrada: se a
 * sessão acabou entre a conferência e este ponto, devolve `false` e o token
 * novo não é entregue.
 */
export async function gravarRenovacao(entrada: {
  sid: SessaoDeJogoId;
  agora: Date;
  expiraEm: Date;
}): Promise<boolean> {
  const linhas = await db
    .update(gameSessions)
    .set({ lastRenewedAt: entrada.agora, expiresAt: entrada.expiraEm })
    .where(and(eq(gameSessions.id, entrada.sid), isNull(gameSessions.endedAt)))
    .returning({ id: gameSessions.id });
  return linhas.length === 1;
}
