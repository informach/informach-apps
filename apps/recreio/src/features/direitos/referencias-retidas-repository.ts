import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, db, eq, inArray, isNull, or, sql } from "@informach/db";
import {
  recreioRightsOperations as operations,
  recreioRightsPreparations as preparations,
  recreioProfiles as profiles,
  recreioRightsSubjects as subjects,
} from "@informach/db/schema";
import { ContaIdSchema } from "@informach/recreio";
import { serializarContaNativa } from "@/features/account/autoridade-repository";
import { assertAllowed } from "@/lib/errors";
import { AGORA } from "@/lib/repository";
import type { CoordenacaoDeEfeitos } from "./efeitos-repository";
import { conferirIntencaoNativa } from "./intencao-nativa";
import { expurgarLoteDeReferencias } from "./referencias-lotes-repository";

/** Passo SQL curto, sem posse externa: o lock da operação exclui outro
 * executor. Aceita operações concluídas com retenções ainda discriminadas;
 * nunca lhes atribui lease ou muda a data original de conclusão. */
export async function expurgarProximaReferencia(config: CoordenacaoDeEfeitos) {
  const livroId = config.assinatura.livroId;
  assertAllowed(
    config.prova.cabecalho.documento.livroId === livroId &&
      config.prova.cabecalho.documento.estado === "aberto" &&
      config.prova.cabecalho.chaveId === config.assinatura.chaveAtiva,
    "DIREITOS_LIVRO",
    "Livro indisponível para execução.",
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
            inArray(operations.state, ["admitted", "running", "completed"]),
            sql`${operations.nextAttemptAt}<=${AGORA}`,
            or(isNull(operations.leaseUntil), sql`${operations.leaseUntil}<=${AGORA}`),
            sql`exists(select 1 from recreio.rights_subjects s where s.operation_id=${operations.id} and
          (s.phase='purging' or (s.phase='minimized' and s.retained_until<=${AGORA})))`,
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
      const [preparacao] = await tx
        .select()
        .from(preparations)
        .where(eq(preparations.id, op.preparationId));
      const selecionados = await tx
        .select({ id: subjects.profileReference })
        .from(subjects)
        .where(eq(subjects.operationId, op.id))
        .orderBy(subjects.profileReference);
      conferirIntencaoNativa(op, preparacao, selecionados, config.assinatura);
      await serializarContaNativa(tx, ContaIdSchema.parse(op.requesterUserId));
      const [alvo] = await tx
        .select()
        .from(subjects)
        .where(
          and(
            eq(subjects.operationId, op.id),
            or(
              eq(subjects.phase, "purging"),
              and(eq(subjects.phase, "minimized"), sql`${subjects.retainedUntil}<=${AGORA}`),
            ),
          ),
        )
        .orderBy(subjects.profileReference)
        .limit(1)
        .for("update");
      assertAllowed(
        alvo?.liveProfileId === alvo?.profileReference &&
          alvo?.liveProfileId &&
          alvo.retentionPolicyVersion === "perfil-2026-11-19",
        "DIREITOS_INTEGRIDADE",
        "Referência pessoal não disponível.",
      );
      const [perfil] = await tx
        .select()
        .from(profiles)
        .where(eq(profiles.id, alvo.profileReference))
        .for("update");
      assertAllowed(
        perfil &&
          perfil.status === "suspended" &&
          perfil.rightsOperationId === op.id &&
          perfil.rightsFrozenState !== null &&
          perfil.userId === null &&
          perfil.groupId === null &&
          !perfil.coverageEnabled &&
          perfil.nickname === "Perfil retirado" &&
          perfil.avatar === "padrao",
        "DIREITOS_INTEGRIDADE",
        "Cadastro fora da política de minimização.",
      );
      const id = perfil.id;
      // Não apagar um fato vivo, renovar seu prazo ou adotar referência nova
      // surgida após a minimização. Escritores nativos revalidam o perfil sob lock.
      const [conferencia] = await tx.execute<{ pendente: boolean; integro: boolean }>(sql`
        select
          exists(select 1 from recreio.game_sessions g where g.profile_id=${id}::uuid and (g.ended_at is null or g.expires_at>clock_timestamp())) or
          exists(select 1 from recreio.world_host_presences p where p.host_profile_id=${id}::uuid and (p.closed_at is null or p.retain_until>clock_timestamp())) or
          exists(select 1 from recreio.space_visit_invites c where (c.origin_profile_id=${id}::uuid or c.target_profile_id=${id}::uuid) and (c.state='pending' or c.retain_until>clock_timestamp())) or
          exists(select 1 from recreio.directed_space_invites c where (c.origin_profile_id=${id}::uuid or c.target_profile_id=${id}::uuid) and (c.state='pending' or c.retain_until>clock_timestamp())) as pendente,
          not exists(select 1 from recreio.minor_profiles p where p.profile_id=${id}::uuid) and
          not exists(select 1 from recreio.guardian_links p where p.profile_id=${id}::uuid) and
          not exists(select 1 from recreio.profile_data_keys p where p.profile_id=${id}::uuid) and
          not exists(select 1 from recreio.profile_achievements p where p.profile_id=${id}::uuid) and
          not exists(select 1 from recreio.profile_world_traces p where p.profile_id=${id}::uuid) and
          not exists(select 1 from recreio.spaces p where p.steward_profile_id=${id}::uuid or p.created_by_profile_id=${id}::uuid) and
          not exists(select 1 from recreio.space_members p where p.profile_id=${id}::uuid and (p.state<>'former' or p.participation is not null)) as integro
      `);
      assertAllowed(
        conferencia?.integro,
        "DIREITOS_INTEGRIDADE",
        "Persistem vínculos pessoais fora do recibo mínimo.",
      );
      const lote = conferencia.pendente ? null : await expurgarLoteDeReferencias(tx, id);
      if (conferencia.pendente || lote?.pendente) {
        await tx
          .update(operations)
          .set({ nextAttemptAt: sql`${AGORA}+interval '1 minute'`, updatedAt: AGORA })
          .where(eq(operations.id, op.id));
        return { situacao: "retencao_pendente" as const, operacaoId: op.id };
      }
      if (lote && lote.count > 0) {
        await logAuditEventStrict(
          "recreio.rights_references_purged",
          op.requesterUserId,
          { app: "recreio", operationId: op.id, domain: lote.domain, count: lote.count },
          { writer: tx },
        );
        await tx
          .update(operations)
          .set({ nextAttemptAt: AGORA, updatedAt: AGORA })
          .where(eq(operations.id, op.id));
        return {
          situacao: "referencias_expurgadas" as const,
          operacaoId: op.id,
          dominio: lote.domain,
          quantidade: lote.count,
        };
      }
      // SET NULL automático antes deste update violaria o estado minimized.
      // Recibo e remoção física são uma única transação, com rollback estrito.
      const removidos = await tx
        .update(subjects)
        .set({ phase: "removed", liveProfileId: null, completedAt: AGORA })
        .where(
          and(
            eq(subjects.operationId, op.id),
            eq(subjects.profileReference, id),
            eq(subjects.liveProfileId, id),
          ),
        )
        .returning({ id: subjects.profileReference });
      assertAllowed(
        removidos.length === 1,
        "DIREITOS_INTEGRIDADE",
        "Referência já não está disponível.",
      );
      const apagados = await tx
        .delete(profiles)
        .where(and(eq(profiles.id, id), eq(profiles.rightsOperationId, op.id)))
        .returning({ id: profiles.id });
      assertAllowed(apagados.length === 1, "DIREITOS_INTEGRIDADE", "Perfil não foi removido.");
      await logAuditEventStrict(
        "recreio.rights_profile_removed",
        op.requesterUserId,
        { app: "recreio", operationId: op.id, profileCount: 1 },
        { writer: tx },
      );
      await tx
        .update(operations)
        .set({ nextAttemptAt: AGORA, updatedAt: AGORA })
        .where(eq(operations.id, op.id));
      return { situacao: "perfil_removido" as const, operacaoId: op.id };
    });
  } catch (erro) {
    // A falha individual não monopoliza os sujeitos seguintes, e o erro
    // original continua visível ao job. Uma operação concluída não retrocede.
    if (selecionada)
      try {
        await db
          .update(operations)
          .set({ nextAttemptAt: sql`${AGORA}+interval '1 minute'`, updatedAt: AGORA })
          .where(
            and(
              eq(operations.id, selecionada),
              eq(operations.ledgerId, livroId),
              or(isNull(operations.leaseUntil), sql`${operations.leaseUntil}<=${AGORA}`),
            ),
          );
      } catch (falhaDaFila) {
        throw new AggregateError([erro, falhaDaFila], "Falha no expurgo e no reagendamento.");
      }
    throw erro;
  }
}
