import "server-only";
import { and, db, eq, inArray, isNull, sql } from "@informach/db";
import { recreioGameSessions as gameSessions } from "@informach/db/schema";
import {
  type PerfilId,
  PerfilIdSchema,
  type SessaoDeAparelhoId,
  SessaoDeAparelhoIdSchema,
  type SessaoDeJogoId,
  SessaoDeJogoIdSchema,
} from "@informach/recreio";
import type { MotivoDeSessaoEncerrada } from "@informach/recreio/contrato";
import { AGORA } from "@/lib/repository";
import { encerrarSessoesAbertas, travarEncerramentos } from "./encerramento-repository";

export {
  abrirSessaoComIngresso,
  gravarRenovacao,
  IngressoSemAparelhoValido,
  registrarIngresso,
} from "./emissao-repository";
export {
  encerrarSessoesAbertas,
  type SessaoEncerrada,
  travarEncerramentos,
} from "./encerramento-repository";

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
 * ninguém a pede pela primeira vez já segurando uma dessas linhas. Reentrar
 * na trava já admitida na mesma transação não espera. A renovação e a entrada num
 * mundo mexem em uma linha com um comando só e não pedem a trava.
 */

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

/** Limite inclui os eventos de auditoria gravados na mesma transação. */
export const LOTE_DE_SESSOES_VENCIDAS = 100;

/** Encerra um lote de sessões vencidas sem esperar linhas em renovação. */
export async function encerrarSessoesVencidas(): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout = '5s'`);
    await tx.execute(sql`set local lock_timeout = '1s'`);
    await tx.execute(sql`set local transaction_timeout = '15s'`);
    // A trava do cursor vem antes de qualquer linha de sessão, como nos
    // encerramentos interativos. SKIP LOCKED só evita esperar a renovação;
    // não substitui a ordem de confirmação dos números de encerramento.
    await travarEncerramentos(tx);
    const lote = await tx
      .select({ id: gameSessions.id })
      .from(gameSessions)
      .where(and(isNull(gameSessions.endedAt), sql`${gameSessions.expiresAt} <= ${AGORA}`))
      .orderBy(gameSessions.expiresAt, gameSessions.id)
      .limit(LOTE_DE_SESSOES_VENCIDAS)
      .for("update", { skipLocked: true });
    if (lote.length === 0) return 0;
    const encerradas = await encerrarSessoesAbertas(
      tx,
      sql`${inArray(
        gameSessions.id,
        lote.map((sessao) => sessao.id),
      )}
        and ${gameSessions.expiresAt} <= ${AGORA}`,
      "expired",
      { porQuem: "recreio" },
    );
    return encerradas.length;
  });
}

/** Teto por execução do cron; o restante continua elegível na próxima passagem. */
export const LOTE_DE_INGRESSOS_ANTIGOS = 500;

/**
 * Apaga um lote de ingressos vencidos há mais de um dia, usados ou não.
 * Não espera linhas disputadas nem traz seus identificadores para o processo.
 * Zero removidos não comprova ausência de linhas travadas por outra transação.
 */
export async function apagarIngressosAntigos(): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout = '5s'`);
    const [resultado] = await tx.execute<{ apagados: number }>(sql`
      with lote as (
        select jti from recreio.game_tickets
        where expires_at < statement_timestamp() - interval '1 day'
        order by expires_at, jti
        limit ${LOTE_DE_INGRESSOS_ANTIGOS}
        for update skip locked
      ), removidos as (
        delete from recreio.game_tickets ingresso using lote
        where ingresso.jti = lote.jti
          and ingresso.expires_at < statement_timestamp() - interval '1 day'
        returning 1
      )
      select count(*)::integer as apagados from removidos
    `);
    if (!resultado) throw new Error("A limpeza de ingressos não devolveu sua contagem.");
    return resultado.apagados;
  });
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
