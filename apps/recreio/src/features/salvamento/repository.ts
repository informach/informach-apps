import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, db, eq, gt, isNull, ne, or, sql } from "@informach/db";
import {
  recreioGameSessions as games,
  recreioSessionSavePermits as permits,
} from "@informach/db/schema";
import { ErroDoRecreio, SessaoDeAparelhoIdSchema } from "@informach/recreio";
import type { SalvamentoVerificado } from "@informach/recreio/contrato";
import {
  admitirAparelhoAtual,
  prepararIdentidadeDoJogo,
} from "@/features/autoridade-de-jogo/aparelho-repository";
import {
  encerrarSessoesAbertas,
  travarEncerramentos,
} from "@/features/sessao-de-jogo/encerramento-repository";
import { type Transacao, travar } from "@/lib/repository";
import { registrarMargemDeSalvamento } from "./tempo-repository";

type Recibo = typeof permits.$inferSelect;
type ReciboAutorizado = { recibo: Recibo; expiraEm: Date };
type IdentidadeAdmitida = Extract<
  Awaited<ReturnType<typeof admitirAparelhoAtual>>,
  { admitida: true }
>;
type ProvaFinal = Pick<
  Recibo,
  | "results"
  | "checkpointSpaceId"
  | "checkpointFence"
  | "checkpointRevision"
  | "checkpointJournalSeq"
> & { status: "completed" | "conflicted" };

type OpcoesDeEscrita = {
  modo: "profile" | "server";
  antesDoPerfil?: (tx: Transacao) => Promise<void>;
  travarDominio?: (tx: Transacao) => Promise<void>;
  conferirFinal?: (tx: Transacao) => Promise<void>;
};
type OpcoesDeFinalizacao = OpcoesDeEscrita & {
  persistir: (
    tx: Transacao,
    contaId: string | null,
    recibo: Recibo,
    admissao: IdentidadeAdmitida,
  ) => Promise<ProvaFinal>;
};
type OpcoesDePreparacao = OpcoesDeEscrita & {
  modo: "server";
  validar: (tx: Transacao, admissao: IdentidadeAdmitida) => Promise<void>;
};

/** Uma admissão comum; leitura não recebe callback de escrita nem trava o cursor global. */
async function executarComRecibo(
  capacidade: SalvamentoVerificado,
  opcoes:
    | { operacao: "consultar"; modo: "profile" | "server" }
    | (OpcoesDePreparacao & { operacao: "preparar" })
    | (OpcoesDeFinalizacao & { operacao: "concluir"; hashDoPedido: string }),
): Promise<ReciboAutorizado> {
  const resultado = await db.transaction(async (tx) => {
    await tx.execute(sql`set local transaction_timeout='10s'`);
    await tx.execute(sql`set local lock_timeout='5s'`);
    const [pista] = await tx
      .select()
      .from(games)
      .where(
        and(
          eq(games.id, capacidade.sid),
          eq(games.profileId, capacidade.perfilId),
          eq(games.gameId, capacidade.jogo),
        ),
      );
    if (!pista) throw new ErroDoRecreio("SESSAO_INVALIDA");
    const referencia = {
      perfilId: capacidade.perfilId,
      sessaoDeAparelhoId: SessaoDeAparelhoIdSchema.parse(pista.deviceSessionId),
      jogo: capacidade.jogo,
      expiraEm: capacidade.expiraEm,
    };
    const identidade = await prepararIdentidadeDoJogo(tx, referencia);
    if (opcoes.operacao !== "consultar") await opcoes.antesDoPerfil?.(tx);
    const admissao = await admitirAparelhoAtual(tx, referencia, identidade, async (t) => {
      await travar(t, `recreio:game_sessions:perfil:${capacidade.perfilId}`);
      if (opcoes.operacao !== "consultar") {
        await opcoes.travarDominio?.(t);
        await travarEncerramentos(t);
      }
    });
    if (!admissao.admitida) return admissao;
    const [jogo] = await tx
      .select()
      .from(games)
      .where(eq(games.id, capacidade.sid))
      .for(opcoes.operacao === "consultar" ? "share" : "update");
    const [recibo] = await tx
      .select()
      .from(permits)
      .where(eq(permits.id, capacidade.reciboId))
      .for(opcoes.operacao === "consultar" ? "share" : "update");
    let encerradaEm = jogo?.endedAt ?? null;
    const conferirPrazo = async () => {
      const agora = await admissao.conferirPrazo();
      if (
        !recibo ||
        recibo.expiresAt <= agora ||
        (encerradaEm && encerradaEm.getTime() + 30_000 <= agora.getTime())
      )
        throw new ErroDoRecreio("SESSAO_INVALIDA");
      return agora;
    };
    const agora = await conferirPrazo();
    if (
      !jogo ||
      !recibo ||
      jogo.profileId !== capacidade.perfilId ||
      jogo.gameId !== capacidade.jogo ||
      jogo.deviceSessionId !== admissao.aparelho.id ||
      recibo.sessionId !== jogo.id ||
      recibo.profileId !== jogo.profileId ||
      recibo.policyVersion !== capacidade.versaoDaPolitica ||
      admissao.versaoDaPolitica !== capacidade.versaoDaPolitica ||
      recibo.mode !== opcoes.modo ||
      capacidade.expiraEm > recibo.expiresAt.getTime() ||
      recibo.status === "expired" ||
      jogo.checkpointFrozenAt !== null ||
      (jogo.endReason !== null && !["left", "expired", "access_lost"].includes(jogo.endReason))
    )
      throw new ErroDoRecreio("SESSAO_INVALIDA");
    const autorizado = (atual: Recibo): ReciboAutorizado => {
      const terminouEm = encerradaEm ?? atual.finishedAt;
      return {
        recibo: atual,
        expiraEm: new Date(
          Math.min(
            atual.expiresAt.getTime(),
            capacidade.expiraEm,
            terminouEm ? terminouEm.getTime() + 30_000 : Infinity,
          ),
        ),
      };
    };
    if (recibo.status === "ready") {
      // O cursor de encerramento ordena confirmações, sem depender de relógios
      // ou UUIDs para reconhecer um sucessor que já tenha saído novamente.
      const [sucessor] = await tx
        .select({ id: games.id })
        .from(games)
        .where(
          and(
            eq(games.profileId, jogo.profileId),
            ne(games.id, jogo.id),
            or(
              isNull(games.endedAt),
              jogo.endedSeq === null ? sql`false` : gt(games.endedSeq, jogo.endedSeq),
            ),
          ),
        )
        .limit(1);
      if (sucessor) throw new ErroDoRecreio("SESSAO_INVALIDA");
    }
    if (opcoes.operacao === "consultar") {
      await conferirPrazo();
      return { admitida: true as const, valor: autorizado(recibo) };
    }
    if (opcoes.operacao === "preparar") {
      await opcoes.validar(tx, admissao);
      if (recibo.status === "ready") {
        await encerrarSessoesAbertas(
          tx,
          sql`${games.id}=${jogo.id}`,
          agora >= recibo.cutoffAt ? "expired" : "left",
          { porQuem: "recreio" },
        );
        const [encerrada] = await tx
          .select({ endedAt: games.endedAt })
          .from(games)
          .where(eq(games.id, capacidade.sid));
        if (!encerrada?.endedAt) throw new ErroDoRecreio("SESSAO_INVALIDA");
        encerradaEm = encerrada.endedAt;
      }
      await opcoes.conferirFinal?.(tx);
      await conferirPrazo();
      return { admitida: true as const, valor: autorizado(recibo) };
    }
    if (recibo.status !== "ready") {
      if (recibo.requestHash !== opcoes.hashDoPedido) throw new ErroDoRecreio("FATO_DUPLICADO");
      await opcoes.conferirFinal?.(tx);
      await conferirPrazo();
      return { admitida: true as const, valor: autorizado(recibo) };
    }
    const prova = await opcoes.persistir(tx, admissao.contaId, recibo, admissao);
    const fim = await conferirPrazo();
    if (admissao.perfil.kind === "minor")
      await registrarMargemDeSalvamento(tx, {
        perfilId: capacidade.perfilId,
        sid: capacidade.sid,
        corteEm: new Date(Math.min(recibo.cutoffAt.getTime(), encerradaEm?.getTime() ?? Infinity)),
        concluidaEm: fim,
      });
    const motivo =
      jogo.endReason === "access_lost" ? "access" : agora >= recibo.cutoffAt ? "time" : "manual";
    const [concluido] = await tx
      .update(permits)
      .set({ ...prova, finishedAt: fim, reason: motivo, requestHash: opcoes.hashDoPedido })
      .where(eq(permits.id, recibo.id))
      .returning();
    if (!concluido) throw new ErroDoRecreio("INDISPONIVEL");
    await encerrarSessoesAbertas(
      tx,
      sql`${games.id}=${jogo.id}`,
      motivo === "access" ? "access_lost" : motivo === "time" ? "expired" : "left",
      { porQuem: "recreio" },
    );
    await logAuditEventStrict(
      "recreio.session_save_completed",
      admissao.contaId,
      {
        app: "recreio",
        profileId: capacidade.perfilId,
        sessionId: capacidade.sid,
        savePermitId: recibo.id,
        gameId: capacidade.jogo,
      },
      { writer: tx },
    );
    await opcoes.conferirFinal?.(tx);
    await conferirPrazo();
    return { admitida: true as const, valor: autorizado(concluido) };
  });
  if (!resultado.admitida) throw resultado.erro;
  return resultado.valor;
}

/** Somente persistência final e encerramento: nunca uma concessão de gameplay. */
export async function concluirSalvamentoNoBanco(
  capacidade: SalvamentoVerificado,
  hashDoPedido: string,
  opcoes: OpcoesDeFinalizacao,
): Promise<ReciboAutorizado> {
  const resultado = await executarComRecibo(capacidade, {
    ...opcoes,
    operacao: "concluir",
    hashDoPedido,
  });
  return resultado;
}

/** Estado técnico do próprio recibo; não devolve hashes, bytes ou conteúdo do mundo. */
export function lerReciboDeSalvamento(
  capacidade: SalvamentoVerificado,
  modo: "profile" | "server",
) {
  return executarComRecibo(capacidade, { operacao: "consultar", modo });
}

/** Encerra gameplay uma vez, fixando o início da margem e a data mínima da fotografia. */
export function prepararSalvamentoNoBanco(
  capacidade: SalvamentoVerificado,
  opcoes: OpcoesDePreparacao,
) {
  return executarComRecibo(capacidade, { ...opcoes, operacao: "preparar" });
}
