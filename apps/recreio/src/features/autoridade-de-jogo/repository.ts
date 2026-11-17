import "server-only";
import { and, db, eq, sql } from "@informach/db";
import {
  recreioGameSessions as games,
  recreioMinorDailyUsage as usage,
} from "@informach/db/schema";
import { ErroDoRecreio, SessaoDeAparelhoIdSchema } from "@informach/recreio";
import { calendarioDeBrasilia } from "@/features/politicas/tempo-repository";
import type { SessaoDeJogoAtiva } from "@/features/sessao-de-jogo/service";
import type { Transacao } from "@/lib/repository";
import {
  admitirAparelhoDeJogo,
  prepararIdentidadeDoJogo,
  recusarAutoridade,
} from "./aparelho-repository";

export type Admissao = Extract<
  Awaited<ReturnType<typeof admitirAparelhoDeJogo>>,
  { admitida: true }
>;

/** Recusas após recalcular a política confirmam a invalidação antes de virar erro HTTP. */
export async function comSessaoDeJogoAutoritativa<T>(
  sessao: SessaoDeJogoAtiva,
  antesDoAparelho: (tx: Transacao) => Promise<void>,
  executar: (tx: Transacao, contaId: string | null, admissao: Admissao) => Promise<T>,
  opcoes: {
    antesDoPerfil?: (tx: Transacao) => Promise<void>;
    travaDaSessao?: "share" | "update";
  } = {},
): Promise<T> {
  const resultado = await db.transaction(async (tx) => {
    await tx.execute(sql`set local transaction_timeout='10s'`);
    await tx.execute(sql`set local lock_timeout='5s'`);
    const [pista] = await tx
      .select({ aparelhoId: games.deviceSessionId })
      .from(games)
      .where(and(eq(games.id, sessao.sid), eq(games.profileId, sessao.perfilId)));
    if (!pista) throw new ErroDoRecreio("SESSAO_INVALIDA");
    const referencia = {
      ...sessao,
      sessaoDeAparelhoId: SessaoDeAparelhoIdSchema.parse(pista.aparelhoId),
    };
    const identidade = await prepararIdentidadeDoJogo(tx, referencia);
    await opcoes.antesDoPerfil?.(tx);
    const admissao = await admitirAparelhoDeJogo(tx, referencia, identidade, antesDoAparelho);
    if (!admissao.admitida) return admissao;
    const [jogo] = await tx
      .select()
      .from(games)
      .where(eq(games.id, sessao.sid))
      .for(opcoes.travaDaSessao ?? "share");
    const agora = await admissao.conferirPrazo();
    if (
      !jogo ||
      jogo.profileId !== sessao.perfilId ||
      jogo.deviceSessionId !== admissao.aparelho.id ||
      jogo.gameId !== sessao.jogo ||
      jogo.endedAt !== null ||
      jogo.expiresAt <= agora ||
      admissao.versaoDaPolitica !== sessao.versaoDaPolitica
    )
      return recusarAutoridade();
    if (admissao.politica) {
      const calendario = await calendarioDeBrasilia(tx, agora);
      const [concessao] = await tx
        .select({ fim: usage.leaseUntil })
        .from(usage)
        .where(
          and(
            eq(usage.profileId, sessao.perfilId),
            eq(usage.localDay, calendario.dia),
            eq(usage.sessionId, jogo.id),
          ),
        );
      if (!concessao?.fim || concessao.fim <= agora || jogo.expiresAt > concessao.fim)
        return recusarAutoridade();
    }
    const valor = await executar(tx, admissao.contaId, admissao);
    // Uma espera em chave ou auditoria também pode atravessar o prazo de autoridade.
    const fim = await admissao.conferirPrazo();
    if (jogo.expiresAt <= fim) throw new ErroDoRecreio("SESSAO_INVALIDA");
    return { admitida: true as const, valor };
  });
  if (!resultado.admitida) throw resultado.erro;
  return resultado.valor;
}
