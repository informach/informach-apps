import "server-only";
import { randomUUID } from "node:crypto";
import { logAuditEventStrict } from "@informach/auth";
import { and, db, eq, isNull, or, sql } from "@informach/db";
import {
  recreioRightsOperations as operations,
  recreioRightsPreparations as preparations,
  recreioRightsSubjects as subjects,
} from "@informach/db/schema";
import { ZodError } from "zod";
import { AppError } from "@/lib/errors";
import { AGORA } from "@/lib/repository";
import { conferirIntencaoNativa } from "./intencao-nativa";
import type { criarArmazenamentoDoLivro } from "./livro/armazenamento";
import type { criarAssinaturaDoLivro } from "./livro/assinatura";
import { FalhaDoLivroDeDireitos } from "./livro/contrato";
import { admitirIntencaoNoLivro } from "./livro/publicacao";

/** Uma operação por passagem. Lease só limita o worker; CAS e conciliação do
 * livro impedem duplicação se o worker antigo terminar depois de perder lease.
 * Nenhuma rede ocorre sob transação ou trava do banco. */
export async function publicarProximoConsentimento(config: {
  assinatura: ReturnType<typeof criarAssinaturaDoLivro>;
  storage: ReturnType<typeof criarArmazenamentoDoLivro>;
}) {
  const token = randomUUID();
  const reservada = await db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout='5s'`);
    await tx.execute(sql`set local lock_timeout='2s'`);
    await tx.execute(sql`set local transaction_timeout='15s'`);
    const [linha] = await tx
      .select()
      .from(operations)
      .where(
        and(
          eq(operations.ledgerId, config.assinatura.livroId),
          eq(operations.state, "publishing"),
          sql`${operations.nextAttemptAt}<=${AGORA}`,
          or(isNull(operations.leaseUntil), sql`${operations.leaseUntil}<=${AGORA}`),
        ),
      )
      .orderBy(operations.nextAttemptAt, operations.id)
      .limit(1)
      .for("update", { skipLocked: true });
    if (!linha) return null;
    const [atual] = await tx
      .update(operations)
      .set({
        leaseToken: token,
        leaseUntil: sql`${AGORA}+interval '2 minutes'`,
        attempts: sql`${operations.attempts}+1`,
        updatedAt: AGORA,
      })
      .where(eq(operations.id, linha.id))
      .returning();
    if (!atual) throw new Error("Rights operation reservation absent");
    const [preparacao] = await tx
      .select()
      .from(preparations)
      .where(eq(preparations.id, atual.preparationId));
    const selecionados = await tx
      .select({ id: subjects.profileReference })
      .from(subjects)
      .where(eq(subjects.operationId, atual.id))
      .orderBy(subjects.profileReference);
    return { atual, preparacao, selecionados };
  });
  if (!reservada) return { situacao: "ociosa" as const };
  const { atual, preparacao, selecionados } = reservada;
  const posse = and(
    eq(operations.id, atual.id),
    eq(operations.state, "publishing"),
    eq(operations.leaseToken, token),
    sql`${operations.leaseUntil}>${AGORA}`,
  );
  let prova: Awaited<ReturnType<typeof admitirIntencaoNoLivro>>;
  try {
    conferirIntencaoNativa(atual, preparacao, selecionados, config.assinatura);
    prova = await admitirIntencaoNoLivro({
      ...config,
      bytes: atual.signedIntent,
      instante: new Date().toISOString(),
    });
  } catch (erro) {
    const integridadeNativa =
      erro instanceof ZodError || (erro instanceof AppError && erro.code === "DIREITOS");
    if (!(erro instanceof FalhaDoLivroDeDireitos) && !integridadeNativa) throw erro;
    const codigo = erro instanceof FalhaDoLivroDeDireitos ? erro.codigo : "INTEGRIDADE";
    const revisao = ["INTEGRIDADE", "CONFIGURACAO", "AUSENTE", "ENCERRADO", "LIMITE"].includes(
      codigo,
    );
    const motivo =
      codigo === "INTEGRIDADE"
        ? "integrity"
        : codigo === "LIMITE"
          ? "dependency"
          : "ledger_unavailable";
    const linhas = await db
      .update(operations)
      .set({
        state: revisao ? "review" : "publishing",
        reviewCode: revisao ? motivo : null,
        leaseToken: null,
        leaseUntil: null,
        nextAttemptAt: sql`${AGORA}+interval '1 minute'`,
        updatedAt: AGORA,
      })
      .where(posse)
      .returning({ id: operations.id });
    return {
      situacao: linhas.length
        ? revisao
          ? ("revisao" as const)
          : ("adiada" as const)
        : ("posse_perdida" as const),
      operacaoId: atual.id,
    };
  }
  // Erro ou resposta perdida do commit não é convertido em falha do provedor.
  // A próxima passagem lê o estado e concilia o prefixo, sem novo consentimento.
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout='5s'`);
    await tx.execute(sql`set local lock_timeout='2s'`);
    await tx.execute(sql`set local transaction_timeout='15s'`);
    const [admitida] = await tx
      .update(operations)
      .set({
        state: "admitted",
        admittedHeadSha256: prova.cabecalhoSha256,
        admittedAt: AGORA,
        leaseToken: null,
        leaseUntil: null,
        updatedAt: AGORA,
      })
      .where(posse)
      .returning({ id: operations.id });
    if (!admitida) return { situacao: "posse_perdida" as const, operacaoId: atual.id };
    await logAuditEventStrict(
      "recreio.rights_admitted",
      atual.requesterUserId,
      { app: "recreio", operationId: atual.id, kind: atual.kind },
      { writer: tx },
    );
    return { situacao: "admitida" as const, operacaoId: atual.id };
  });
}
