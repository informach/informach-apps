import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, db, eq, inArray, isNull, or, sql } from "@informach/db";
import {
  recreioRightsOperations as operations,
  recreioRightsSubjects as subjects,
} from "@informach/db/schema";
import { assertAllowed } from "@/lib/errors";
import { AGORA } from "@/lib/repository";
import {
  conferirConclusaoDosPerfis,
  conferirPrazosDaConclusao,
} from "./conclusao-perfis-repository";
import type { CoordenacaoDeEfeitos } from "./efeitos-repository";
import { lerPreparacaoInterativaDaOperacao } from "./fonte-intencao-repository";
import { conferirIntencaoNativa } from "./intencao-nativa";
import { referenciasDeMundosDaOperacao } from "./intencao-repository";

/** Conclusão da retirada, com retenções mínimas explícitas. Não encerra a
 * conta, não muda faturas e não apresenta referência retida como anônima. */
export async function concluirProximaRetirada(config: CoordenacaoDeEfeitos) {
  const livroId = config.assinatura.livroId;
  assertAllowed(
    config.prova.cabecalho.documento.livroId === livroId &&
      config.prova.cabecalho.documento.estado === "aberto" &&
      config.prova.cabecalho.chaveId === config.assinatura.chaveAtiva,
    "DIREITOS_LIVRO",
    "Livro indisponível para conclusão.",
  );
  let selecionada: string | null = null;
  try {
    return await db.transaction(async (tx) => {
      await tx.execute(sql`set local statement_timeout='5s'`);
      await tx.execute(sql`set local lock_timeout='2s'`);
      await tx.execute(sql`set local transaction_timeout='15s'`);
      const [op] = await tx
        .select()
        .from(operations)
        .where(
          and(
            eq(operations.ledgerId, livroId),
            eq(operations.kind, "retirar_perfil"),
            inArray(operations.state, ["admitted", "running"]),
            sql`${operations.nextAttemptAt}<=${AGORA}`,
            or(isNull(operations.leaseUntil), sql`${operations.leaseUntil}<=${AGORA}`),
            sql`exists(select 1 from recreio.rights_subjects s where s.operation_id=${operations.id}) and
        not exists(select 1 from recreio.rights_subjects s where s.operation_id=${operations.id} and
          (s.phase not in ('minimized','removed') or (s.phase='minimized' and s.retained_until<=${AGORA}))) and
        not exists(select 1 from recreio.rights_worlds w where w.operation_id=${operations.id} and w.phase<>'completed')`,
          ),
        )
        .orderBy(operations.nextAttemptAt, operations.id)
        .limit(1)
        .for("update", { skipLocked: true });
      if (!op) return { situacao: "ociosa" as const };
      selecionada = op.id;
      assertAllowed(
        config.prova.referencias.some(
          (r) =>
            r.operacaoId === op.id && r.revisao === op.revision && r.sha256 === op.intentSha256,
        ),
        "DIREITOS_LIVRO",
        "Intenção ausente do prefixo verificado.",
      );
      const preparacao = await lerPreparacaoInterativaDaOperacao(tx, op);
      const alvos = await tx
        .select()
        .from(subjects)
        .where(eq(subjects.operationId, op.id))
        .orderBy(subjects.profileReference)
        .for("update");
      conferirIntencaoNativa(
        op,
        preparacao,
        alvos.map((s) => ({ id: s.profileReference })),
        config.assinatura,
        await referenciasDeMundosDaOperacao(tx, op.id),
      );
      const retidos = await conferirConclusaoDosPerfis(tx, op, alvos);
      // O CHECK impede completed com lease: concluir e liberar no mesmo comando.
      await tx
        .update(operations)
        .set({
          state: "completed",
          completedAt: AGORA,
          leaseToken: null,
          leaseUntil: null,
          nextAttemptAt: AGORA,
          updatedAt: AGORA,
        })
        .where(eq(operations.id, op.id));
      await logAuditEventStrict(
        "recreio.rights_withdrawal_completed",
        op.requesterUserId,
        {
          app: "recreio",
          operationId: op.id,
          profileCount: alvos.length,
          retainedCount: retidos.length,
        },
        { writer: tx },
      );
      await conferirPrazosDaConclusao(tx, op.id);
      return {
        situacao: "retirada_concluida" as const,
        operacaoId: op.id,
        referenciasRetidas: retidos.length,
      };
    });
  } catch (erro) {
    if (selecionada)
      try {
        await db
          .update(operations)
          .set({ nextAttemptAt: sql`${AGORA}+interval '1 minute'`, updatedAt: AGORA })
          .where(
            and(
              eq(operations.id, selecionada),
              eq(operations.ledgerId, livroId),
              inArray(operations.state, ["admitted", "running"]),
              or(isNull(operations.leaseUntil), sql`${operations.leaseUntil}<=${AGORA}`),
            ),
          );
      } catch (falhaDaFila) {
        throw new AggregateError([erro, falhaDaFila], "Falha na conclusão e no reagendamento.");
      }
    throw erro;
  }
}
