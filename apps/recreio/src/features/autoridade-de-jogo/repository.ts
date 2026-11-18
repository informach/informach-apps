import "server-only";
import { and, db, eq, sql } from "@informach/db";
import { recreioGameSessions as games } from "@informach/db/schema";
import { ErroDoRecreio, SessaoDeAparelhoIdSchema } from "@informach/recreio";
import type { SessaoDeJogoAtiva } from "@/features/sessao-de-jogo/service";
import type { Transacao } from "@/lib/repository";
import {
  admitirAparelhoDeJogo,
  prepararIdentidadeDoJogo,
  type ReferenciaDeJogador,
} from "./aparelho-repository";
import { conferirSessaoAdmitida } from "./sessao-repository";

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
    /** Social trava as duas pontas e suas contas antes de identidade/perfis. */
    antesDaIdentidade?: (tx: Transacao, referencia: ReferenciaDeJogador) => Promise<void>;
    antesDoPerfil?: (tx: Transacao) => Promise<void>;
    travaDaSessao?: "share" | "update";
    /** Somente controle/checkpoint; nunca concede gameplay ou dados. */
    permitirPausaDeCheckpoint?: boolean;
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
    await opcoes.antesDaIdentidade?.(tx, referencia);
    const identidade = await prepararIdentidadeDoJogo(tx, referencia);
    await opcoes.antesDoPerfil?.(tx);
    const admissao = await admitirAparelhoDeJogo(tx, referencia, identidade, antesDoAparelho);
    if (!admissao.admitida) return admissao;
    const conferida = await conferirSessaoAdmitida(tx, sessao, admissao, {
      trava: opcoes.travaDaSessao,
      permitirPausaDeCheckpoint: opcoes.permitirPausaDeCheckpoint,
    });
    if (!conferida.admitida) return conferida;
    const valor = await executar(tx, admissao.contaId, admissao);
    // Uma espera em chave ou auditoria também pode atravessar o prazo de autoridade.
    const fim = await admissao.conferirPrazo();
    if (conferida.jogo.expiresAt <= fim) throw new ErroDoRecreio("SESSAO_INVALIDA");
    return { admitida: true as const, valor };
  });
  if (!resultado.admitida) throw resultado.erro;
  return resultado.valor;
}
