import "server-only";
import { and, db, eq, isNull, sql } from "@informach/db";
import { recreioGameSessions as games } from "@informach/db/schema";
import { ErroDoRecreio, type SessaoDeJogoId } from "@informach/recreio";
import {
  confirmarInicioDoTeste,
  consentimentoElegivelParaTeste,
  prepararConcessaoDoTeste,
} from "@/features/acesso/teste-repository";
import {
  admitirAparelhoAtual,
  admitirAparelhoDeJogo,
  conteudoPermitido,
  prepararIdentidadeDoJogo,
  type RecusaDeAutoridade,
  type ReferenciaDeJogador,
  recusarAutoridade,
} from "@/features/autoridade-de-jogo/aparelho-repository";
import { comCicloDeCobranca } from "@/features/cobranca/lifecycle";
import { pistaDoGrupoDoTeste, travarGrupoDoTeste } from "@/features/grupo/teste-repository";
import { env } from "@/lib/env";
import { type Transacao, travar } from "@/lib/repository";

type Referencia = ReferenciaDeJogador & { jogo: string; expiraEm: number | null };
type Resultado<T> = { admitida: true; valor: T } | RecusaDeAutoridade;
type Contexto = Extract<Awaited<ReturnType<typeof admitirAparelhoAtual>>, { admitida: true }>;
type Preparacao = {
  contexto: Contexto;
  contaId: string;
  consentimento: NonNullable<Awaited<ReturnType<typeof consentimentoElegivelParaTeste>>>;
};
export type CapacidadeProvisoriaDeIngresso = {
  admitida: true;
  aparelho: Pick<Contexto["aparelho"], "expiresAt">;
  versaoDaPolitica: number;
  limiteDoIngresso: Date;
  conferirPrazo: () => Promise<Date>;
};

/** Mutex financeiro antes da TX; contas → grupo → perfil → aparelho dentro dela.
 * O caminho comum permanece no kernel original quando não há teste a iniciar.
 */
async function comPreparacao<T>(
  referencia: Referencia,
  executar: (tx: Transacao, preparacao: Preparacao | null) => Promise<Resultado<T>>,
  antesDoPerfil?: (tx: Transacao) => Promise<void>,
): Promise<Resultado<T>> {
  if (env.RECREIO_TRIAL_MODE !== "experiment") return db.transaction((tx) => executar(tx, null));
  const pista = await pistaDoGrupoDoTeste(referencia);
  if (!pista) return db.transaction((tx) => executar(tx, null));
  return comCicloDeCobranca(pista.paganteId, () =>
    db.transaction(async (tx) => {
      await tx.execute(sql`set local transaction_timeout='15s'`);
      await tx.execute(sql`set local statement_timeout='5s'`);
      await tx.execute(sql`set local lock_timeout='2s'`);
      const preparacao: { pagante?: Awaited<ReturnType<typeof travarGrupoDoTeste>> } = {};
      const identidade = await prepararIdentidadeDoJogo(tx, referencia, async (t, contaId) => {
        preparacao.pagante = await travarGrupoDoTeste(t, referencia, pista, contaId);
      });
      await antesDoPerfil?.(tx);
      const antesDoAparelho = (t: Transacao) =>
        travar(t, `recreio:game_sessions:perfil:${referencia.perfilId}`);
      const contexto = await admitirAparelhoAtual(tx, referencia, identidade, antesDoAparelho);
      if (!contexto.admitida) return contexto;
      if (contexto.perfil.groupId !== pista.grupoId) throw new ErroDoRecreio("SESSAO_INVALIDA");
      const atual = await admitirAparelhoDeJogo(tx, referencia, identidade, antesDoAparelho);
      if (atual.admitida) return executar(tx, null);
      if (atual.erro.codigo !== "ACESSO_PERDIDO") return atual;
      const agora = await contexto.conferirPrazo();
      const pagante = preparacao.pagante;
      if (
        !pagante?.emailVerified ||
        (pagante.banned && (!pagante.banExpiresAt || pagante.banExpiresAt > agora)) ||
        !contexto.perfil.coverageEnabled ||
        contexto.perfil.status !== "active"
      )
        return atual;
      if (!conteudoPermitido(contexto, referencia.jogo, agora))
        return recusarAutoridade(new ErroDoRecreio("POLITICA_INCOMPATIVEL"));
      const consentimento = await consentimentoElegivelParaTeste(
        tx,
        pista.grupoId,
        pista.paganteId,
        agora,
      );
      if (!consentimento) return atual;
      await contexto.conferirPrazo();
      return executar(tx, { contexto, contaId: identidade.conta.id, consentimento });
    }),
  );
}

/** O ingresso elegível só permite tentar a troca; não contém decisão de gameplay. */
export function comIngressoParaTeste<T>(
  referencia: Referencia,
  executar: (
    tx: Transacao,
    provisoria: CapacidadeProvisoriaDeIngresso | null,
  ) => Promise<Resultado<T>>,
) {
  return comPreparacao(referencia, (tx, preparacao) =>
    executar(
      tx,
      preparacao
        ? {
            admitida: true,
            aparelho: preparacao.contexto.aparelho,
            versaoDaPolitica: preparacao.contexto.versaoDaPolitica,
            limiteDoIngresso: preparacao.contexto.aparelho.expiresAt,
            conferirPrazo: preparacao.contexto.conferirPrazo,
          }
        : null,
    ),
  );
}

/** Preparação limitada de mundo: não concede gameplay, não grava claim e não
 * inicia prazo. Só os serviços de criar/listar/consultar mundo usam este contexto.
 * Convites, participação, dados e instâncias continuam exigindo acesso pleno.
 */
export async function comPreparacaoDeMundo<T>(
  referencia: Referencia,
  antesDoPerfil: (tx: Transacao) => Promise<void>,
  executar: (tx: Transacao, contexto: Contexto) => Promise<T>,
): Promise<T> {
  const resultado = await comPreparacao<T>(
    referencia,
    async (tx, preparacao) => {
      await tx.execute(sql`set local transaction_timeout='15s'`);
      await tx.execute(sql`set local statement_timeout='5s'`);
      await tx.execute(sql`set local lock_timeout='2s'`);
      let contexto: Contexto;
      if (preparacao) contexto = preparacao.contexto;
      else {
        const identidade = await prepararIdentidadeDoJogo(tx, referencia);
        await antesDoPerfil(tx);
        const atual = await admitirAparelhoDeJogo(tx, referencia, identidade, async () => {});
        if (!atual.admitida) return atual;
        contexto = atual;
      }
      const valor = await executar(tx, contexto);
      await contexto.conferirPrazo();
      return { admitida: true, valor };
    },
    antesDoPerfil,
  );
  if (!resultado.admitida) {
    if (resultado.erro.codigo === "ACESSO_PERDIDO")
      throw new ErroDoRecreio("ACESSO_NEGADO", resultado.erro.detalhe);
    throw resultado.erro;
  }
  return resultado.valor;
}

class TesteNaoIniciado extends Error {
  constructor(readonly recusa: RecusaDeAutoridade) {
    super("recreio.trial.not_started");
  }
}

/** Concessão, SID, recibo único e auditoria são confirmados atomicamente.
 * Recusa retornada pelo kernel também reverte o savepoint, sem consumir teste.
 * Invalidação de política anterior à tentativa permanece na transação externa.
 */
export function comPrimeiraSessaoDoTeste<T>(
  referencia: Referencia & { sid: SessaoDeJogoId },
  executar: (tx: Transacao) => Promise<Resultado<T>>,
) {
  return comPreparacao(referencia, async (tx, preparacao) => {
    if (!preparacao) return executar(tx);
    try {
      return await tx.transaction(async (interna) => {
        const concessao = await prepararConcessaoDoTeste(
          interna,
          preparacao.consentimento,
          await preparacao.contexto.conferirPrazo(),
        );
        const resultado = await executar(interna);
        if (!resultado.admitida) throw new TesteNaoIniciado(resultado);
        const agora = await preparacao.contexto.conferirPrazo();
        const [sid] = await interna
          .select({ inicio: games.startedAt, fim: games.expiresAt })
          .from(games)
          .where(
            and(
              eq(games.id, referencia.sid),
              eq(games.profileId, referencia.perfilId),
              eq(games.deviceSessionId, referencia.sessaoDeAparelhoId),
              eq(games.gameId, referencia.jogo),
              isNull(games.endedAt),
            ),
          );
        if (!sid || sid.inicio < concessao.inicio || sid.fim <= agora || sid.fim > concessao.fim)
          throw new ErroDoRecreio("INGRESSO_INVALIDO");
        await confirmarInicioDoTeste(interna, preparacao.consentimento, concessao, {
          contaId: preparacao.contaId,
          perfilId: referencia.perfilId,
          sid: referencia.sid,
        });
        await preparacao.contexto.conferirPrazo();
        return resultado;
      });
    } catch (erro) {
      if (erro instanceof TesteNaoIniciado) return erro.recusa;
      throw erro;
    }
  });
}
