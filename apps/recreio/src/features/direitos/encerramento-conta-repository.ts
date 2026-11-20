import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, db, eq, inArray, isNull, or, sql } from "@informach/db";
import {
  recreioRightsOperations as operations,
  recreioAccountParticipations as participations,
  recreioRightsSubjects as subjects,
  users,
} from "@informach/db/schema";
import { ContaIdSchema } from "@informach/recreio";
import { serializarContaNativa } from "@/features/account/autoridade-repository";
import { assertAllowed } from "@/lib/errors";
import { AGORA, type Transacao } from "@/lib/repository";
import {
  conferirConclusaoDosPerfis,
  conferirPrazosDaConclusao,
} from "./conclusao-perfis-repository";
import type { CoordenacaoDeEfeitos } from "./efeitos-repository";
import { retirarLoteDaContaEncerrada } from "./encerramento-conta-lotes-repository";
import {
  conferirFinanceiroDosEfeitos,
  escopoFinanceiroDosEfeitos,
} from "./encerramento-efeitos-repository";
import { lerPreparacaoInterativaDaOperacao } from "./fonte-intencao-repository";
import { conferirIntencaoNativa } from "./intencao-nativa";
import { referenciasDeMundosDaOperacao } from "./intencao-repository";

const pronta = () =>
  and(
    eq(operations.kind, "encerrar_conta"),
    inArray(operations.state, ["admitted", "running"]),
    escopoFinanceiroDosEfeitos(),
    sql`${operations.nextAttemptAt}<=${AGORA}`,
    or(isNull(operations.leaseUntil), sql`${operations.leaseUntil}<=${AGORA}`),
    sql`not exists(select 1 from recreio.rights_subjects s where s.operation_id=${operations.id} and
    (s.phase not in ('minimized','removed') or (s.phase='minimized' and s.retained_until<=${AGORA}))) and
    not exists(select 1 from recreio.rights_worlds w where w.operation_id=${operations.id} and w.phase<>'completed')`,
  );
async function limites(tx: Transacao) {
  await tx.execute(sql`set local statement_timeout='5s'`);
  await tx.execute(sql`set local lock_timeout='2s'`);
  await tx.execute(sql`set local transaction_timeout='15s'`);
}

/** One local SQL pass; no provider/storage I/O. Discovery never authorizes.
 * Identity UPDATE precedes operation/participation locks, so all native
 * writers/copy publications finish before the account's final revision. */
export async function concluirProximoEncerramento(config: CoordenacaoDeEfeitos) {
  const livroId = config.assinatura.livroId;
  assertAllowed(
    config.prova.cabecalho.documento.livroId === livroId &&
      config.prova.cabecalho.documento.estado === "aberto" &&
      config.prova.cabecalho.chaveId === config.assinatura.chaveAtiva,
    "DIREITOS_LIVRO",
    "Livro indisponível para conclusão.",
  );
  const [pista] = await db
    .select({ id: operations.id, contaId: operations.requesterUserId })
    .from(operations)
    .where(and(eq(operations.ledgerId, livroId), pronta()))
    .orderBy(operations.nextAttemptAt, operations.id)
    .limit(1);
  if (!pista) return { situacao: "ociosa" as const };
  try {
    return await db.transaction(async (tx) => {
      await limites(tx);
      await serializarContaNativa(tx, ContaIdSchema.parse(pista.contaId));
      const [conta] = await tx
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(eq(users.id, pista.contaId))
        .for("update");
      assertAllowed(conta, "DIREITOS_INTEGRIDADE", "A identidade original exige revisão.");
      const [op] = await tx
        .select()
        .from(operations)
        .where(
          and(
            eq(operations.id, pista.id),
            eq(operations.requesterUserId, conta.id),
            eq(operations.ledgerId, livroId),
            pronta(),
          ),
        )
        .for("update", { skipLocked: true });
      if (!op) return { situacao: "ociosa" as const };
      assertAllowed(
        config.prova.referencias.some(
          (r) =>
            r.operacaoId === op.id && r.revisao === op.revision && r.sha256 === op.intentSha256,
        ),
        "DIREITOS_LIVRO",
        "Consentimento ausente do prefixo verificado.",
      );
      const preparacao = await lerPreparacaoInterativaDaOperacao(tx, op);
      const alvos = await tx
        .select()
        .from(subjects)
        .where(eq(subjects.operationId, op.id))
        .orderBy(subjects.profileReference)
        .limit(257)
        .for("update");
      const { plano } = conferirIntencaoNativa(
        op,
        preparacao,
        alvos.map((s) => ({ id: s.profileReference })),
        config.assinatura,
        await referenciasDeMundosDaOperacao(tx, op.id),
      );
      await conferirFinanceiroDosEfeitos(tx, op, plano);
      const retidos = await conferirConclusaoDosPerfis(tx, op, alvos);
      const [residual] = await tx.execute<{ pendente: boolean }>(sql`select
        exists(select 1 from recreio.profiles p where p.user_id=${conta.id}) or
        exists(select 1 from recreio.guardian_links g where g.guardian_user_id=${conta.id}) or
        exists(select 1 from recreio.paired_credentials c where c.guardian_user_id=${conta.id}) or
        exists(select 1 from recreio.device_sessions d where d.user_id=${conta.id} and d.active_profile_id is not null)
        as pendente`);
      assertAllowed(
        residual && !residual.pendente,
        "DIREITOS_INTEGRIDADE",
        "Persistem perfis ou responsabilidades fora do recibo mínimo.",
      );
      const lote = await retirarLoteDaContaEncerrada(tx, conta);
      if (lote.count > 0) {
        await tx
          .update(operations)
          .set({
            state: "running",
            attempts: sql`${operations.attempts}+1`,
            nextAttemptAt: AGORA,
            updatedAt: AGORA,
          })
          .where(eq(operations.id, op.id));
        await logAuditEventStrict(
          "recreio.account_closure_data_removed",
          conta.id,
          { app: "recreio", operationId: op.id, domain: lote.domain, count: lote.count },
          { writer: tx },
        );
        return {
          situacao: "dados_da_conta_retirados" as const,
          operacaoId: op.id,
          dominio: lote.domain,
          quantidade: lote.count,
        };
      }
      const [instante] = await tx
        .select({ agora: sql<Date>`${AGORA}`.mapWith(participations.updatedAt) })
        .from(participations)
        .where(eq(participations.userId, conta.id));
      assertAllowed(instante, "DIREITOS_INTEGRIDADE", "Participação indisponível para conclusão.");
      const [fechada] = await tx
        .update(participations)
        .set({ state: "closed", revision: 3, closedAt: instante.agora, updatedAt: instante.agora })
        .where(
          and(
            eq(participations.userId, conta.id),
            eq(participations.operationId, op.id),
            eq(participations.state, "closing"),
            eq(participations.revision, 2),
          ),
        )
        .returning({ id: participations.userId });
      assertAllowed(fechada, "DIREITOS_INTEGRIDADE", "A barreira mudou antes da conclusão.");
      await tx
        .update(operations)
        .set({
          state: "completed",
          completedAt: instante.agora,
          leaseToken: null,
          leaseUntil: null,
          attempts: sql`${operations.attempts}+1`,
          nextAttemptAt: instante.agora,
          updatedAt: instante.agora,
        })
        .where(eq(operations.id, op.id));
      await logAuditEventStrict(
        "recreio.account_closure_completed",
        conta.id,
        {
          app: "recreio",
          operationId: op.id,
          profileCount: alvos.length,
          retainedCount: retidos.length,
          policyVersion: "encerramento-conta-2026-11-19-v1",
          globalIdentityPreserved: true,
          financialRecordsPreserved: true,
        },
        { writer: tx },
      );
      await conferirPrazosDaConclusao(tx, op.id);
      return {
        situacao: "conta_encerrada" as const,
        operacaoId: op.id,
        referenciasRetidas: retidos.length,
      };
    });
  } catch (erro) {
    try {
      await db
        .update(operations)
        .set({ nextAttemptAt: sql`${AGORA}+interval '1 minute'`, updatedAt: AGORA })
        .where(
          and(
            eq(operations.id, pista.id),
            eq(operations.ledgerId, livroId),
            inArray(operations.state, ["admitted", "running"]),
            or(isNull(operations.leaseUntil), sql`${operations.leaseUntil}<=${AGORA}`),
          ),
        );
    } catch (falhaDaFila) {
      throw new AggregateError([erro, falhaDaFila], "Account closure and retry scheduling failed");
    }
    throw erro;
  }
}
