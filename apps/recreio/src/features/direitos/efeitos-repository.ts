import "server-only";
import { randomUUID } from "node:crypto";
import { logAuditEventStrict } from "@informach/auth/audit";
import { and, eq, inArray, isNull, or, sql } from "@informach/db";
import {
  recreioProfileAchievements as achievements,
  recreioSpaceJournal as journal,
  recreioProfileDataKeys as keys,
  recreioRightsOperations as operations,
  recreioRightsSubjects as subjects,
  recreioRightsWorlds as worlds,
} from "@informach/db/schema";
import { ZodError } from "zod";
import { AppError, assertAllowed } from "@/lib/errors";
import { AGORA, type Transacao } from "@/lib/repository";
import {
  bancoDaCoordenacao,
  type CoordenacaoDeEfeitos,
  conferirCoordenacaoDeDireitos,
  conferirIntencaoDaCoordenacao,
  escopoDaCoordenacao,
} from "./coordenacao-repository";
import {
  conferirFinanceiroDosEfeitos,
  escopoFinanceiroDosEfeitos,
} from "./encerramento-efeitos-repository";
import { FalhaDoLivroDeDireitos } from "./livro/contrato";

export type { CoordenacaoDeEfeitos } from "./coordenacao-repository";

async function limites(tx: Transacao) {
  await tx.execute(sql`set local statement_timeout='5s'`);
  await tx.execute(sql`set local lock_timeout='2s'`);
  await tx.execute(sql`set local transaction_timeout='15s'`);
}

/** Passos SQL da retirada; encerramento exige prova financeira do mesmo plano.
 * Callback sem rede,
 * simulação ou gzip. Reserva durável antes do passo; falha individual não
 * monopoliza a fila. Erro inesperado continua sendo erro do job. */
export async function comEfeitoNativoDeDireitos<T>(
  config: CoordenacaoDeEfeitos,
  fase: "recuperacao" | "drenagem" | "diario" | "dados" | "cadastro",
  executar: (tx: Transacao, operacao: typeof operations.$inferSelect) => Promise<T>,
) {
  const livroId = config.assinatura.livroId,
    token = randomUUID();
  conferirCoordenacaoDeDireitos(config);
  const banco = bancoDaCoordenacao(config);
  const possuiDados = sql`exists(select 1 from ${subjects} where ${subjects.operationId}=${operations.id} and ${subjects.phase}='selected' and (
    exists(select 1 from ${keys} where ${keys.profileId}=${subjects.profileReference}) or
    exists(select 1 from ${achievements} where ${achievements.profileId}=${subjects.profileReference})))`;
  const baseDoCadastro = sql`exists(select 1 from ${subjects} where ${subjects.operationId}=${operations.id} and ${subjects.phase}='selected') and
    not exists(select 1 from ${worlds} where ${worlds.operationId}=${operations.id} and (${worlds.phase} in ('draining','frozen','snapshots') or exists(select 1 from ${journal} where ${journal.spaceId}=${worlds.spaceId})))`;
  const elegivel =
    fase === "recuperacao"
      ? sql`exists(select 1 from recreio.rights_worlds w join recreio.spaces s on s.id=w.space_id
          where w.operation_id=${operations.id} and w.phase='draining' and (s.revision>0 or s.journal_seq>0)
            and not exists(select 1 from recreio.space_leases l where l.space_id=s.id and l.released_at is null)
            and not exists(select 1 from recreio.space_snapshots f where f.space_id=s.id and f.revision=s.revision and f.journal_seq=s.journal_seq))`
      : fase === "drenagem"
        ? sql`exists(select 1 from ${worlds} where ${worlds.operationId}=${operations.id} and ${worlds.phase}='draining')`
        : fase === "diario"
          ? sql`exists(select 1 from ${worlds} where ${worlds.operationId}=${operations.id} and ${worlds.phase}='dependencies' and exists(select 1 from ${journal} where ${journal.spaceId}=${worlds.spaceId}))`
          : fase === "dados"
            ? sql`(${baseDoCadastro}) and (${possuiDados})`
            : sql`(${baseDoCadastro}) and not (${possuiDados})`;
  const reservada = await banco.transaction(async (tx) => {
    await limites(tx);
    const [op] = await tx
      .select()
      .from(operations)
      .where(
        and(
          eq(operations.ledgerId, livroId),
          escopoDaCoordenacao(config),
          escopoFinanceiroDosEfeitos(),
          inArray(operations.state, ["admitted", "running"]),
          sql`${operations.nextAttemptAt}<=${AGORA}`,
          or(isNull(operations.leaseUntil), sql`${operations.leaseUntil}<=${AGORA}`),
          elegivel,
        ),
      )
      .orderBy(operations.nextAttemptAt, operations.id)
      .limit(1)
      .for("update", { skipLocked: true });
    if (!op) return null;
    const [linha] = await tx
      .update(operations)
      .set({
        state: "running",
        leaseToken: token,
        leaseUntil: sql`${AGORA}+interval '2 minutes'`,
        attempts: sql`${operations.attempts}+1`,
        updatedAt: AGORA,
      })
      .where(eq(operations.id, op.id))
      .returning();
    assertAllowed(linha, "DIREITOS_POSSE", "Reserva não disponível.");
    return linha;
  });
  if (!reservada) return { situacao: "ociosa" as const };
  const posse = and(
    eq(operations.id, reservada.id),
    eq(operations.state, "running"),
    eq(operations.leaseToken, token),
    sql`${operations.leaseUntil}>${AGORA}`,
  );
  try {
    assertAllowed(
      config.prova.referencias.some(
        (r) =>
          r.operacaoId === reservada.id &&
          r.revisao === reservada.revision &&
          r.sha256 === reservada.intentSha256,
      ),
      "DIREITOS_LIVRO",
      "Intenção ausente do prefixo verificado.",
    );
    return await banco.transaction(async (tx) => {
      await limites(tx);
      const [op] = await tx.select().from(operations).where(posse).for("update");
      assertAllowed(op, "DIREITOS_POSSE", "A reserva do processamento terminou.");
      assertAllowed(
        op.kind === reservada.kind &&
          op.intentSha256 === reservada.intentSha256 &&
          op.signedIntent.equals(reservada.signedIntent),
        "DIREITOS_INTEGRIDADE",
        "A intenção nativa mudou.",
      );
      const { plano } = await conferirIntencaoDaCoordenacao(tx, op, config);
      await conferirFinanceiroDosEfeitos(tx, op, plano);
      const resultado = await executar(tx, op);
      const liberadas = await tx
        .update(operations)
        .set({ leaseToken: null, leaseUntil: null, nextAttemptAt: AGORA, updatedAt: AGORA })
        .where(posse)
        .returning({ id: operations.id });
      assertAllowed(
        liberadas.length === 1,
        "DIREITOS_POSSE",
        "A reserva venceu durante o processamento.",
      );
      return resultado;
    });
  } catch (erro) {
    if (erro instanceof AppError && erro.code === "DIREITOS_POSSE")
      return { situacao: "posse_perdida" as const, operacaoId: reservada.id };
    const integridade =
      erro instanceof FalhaDoLivroDeDireitos ||
      erro instanceof ZodError ||
      (erro instanceof AppError &&
        ["DIREITOS", "DIREITOS_LIVRO", "DIREITOS_INTEGRIDADE"].includes(erro.code));
    const dependencia = erro instanceof AppError && erro.code === "DIREITOS_DEPENDENCIA";
    if (integridade || dependencia)
      return banco.transaction(async (tx) => {
        await limites(tx);
        const linhas = await tx
          .update(operations)
          .set({
            state: "review",
            reviewCode: dependencia ? "dependency" : "integrity",
            leaseToken: null,
            leaseUntil: null,
            updatedAt: AGORA,
          })
          .where(posse)
          .returning({ id: operations.id });
        if (!linhas.length) return { situacao: "posse_perdida" as const, operacaoId: reservada.id };
        await logAuditEventStrict(
          "recreio.rights_processing_blocked",
          reservada.requesterUserId,
          {
            app: "recreio",
            operationId: reservada.id,
            kind: reservada.kind,
            reasonCode: dependencia ? "dependency" : "integrity",
          },
          { writer: tx },
        );
        return { situacao: "revisao" as const, operacaoId: reservada.id };
      });
    // Registra só a próxima tentativa, preservando o erro original e a
    // ausência de efeitos (a transação acima já reverteu).
    try {
      await banco
        .update(operations)
        .set({
          leaseToken: null,
          leaseUntil: null,
          nextAttemptAt: sql`${AGORA}+interval '1 minute'`,
          updatedAt: AGORA,
        })
        .where(posse);
    } catch (adiamento) {
      throw new AggregateError([erro, adiamento], "Rights step and retry scheduling failed");
    }
    throw erro;
  }
}
