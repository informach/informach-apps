import "server-only";
import { logAuditEventStrict } from "@informach/auth/audit";
import { and, eq, inArray, isNull, or, sql } from "@informach/db";
import {
  recreioProfileCreationRequests as creationRequests,
  recreioDeviceSessions as devices,
  recreioDirectedSpaceInvites as directed,
  recreioGroupInvites as groupInvites,
  recreioGuardianLinks as guardians,
  recreioSpaceInvites as invites,
  recreioSpaceMembers as members,
  recreioMinorProfiles as minors,
  recreioProfiles as profiles,
  recreioRightsProfileProjection,
  recreioSpaces as spaces,
  recreioRightsSubjects as subjects,
  recreioProfileWorldTraces as traces,
  recreioRightsWorlds as worlds,
} from "@informach/db/schema";
import { ContaIdSchema } from "@informach/recreio";
import { z } from "zod";
import { serializarContaNativa } from "@/features/account/serializacao-repository";
import { assertAllowed } from "@/lib/errors";
import { AGORA } from "@/lib/repository";
import { autoridadeDoPerfilCongelado } from "./coordenacao-repository";
import { type CoordenacaoDeEfeitos, comEfeitoNativoDeDireitos } from "./efeitos-repository";
import { expurgarLoteDeReferenciasSociais } from "./referencias-lotes-repository";

/** Cadastro e metadados nativos, depois de fotos/diário/dados pessoais.
 * Não remove conteúdo dos demais nem encerra contrato/identidade global.
 * A referência restante tem estado próprio, sem login ou dados de cadastro. */
export function minimizarProximoPerfil(config: CoordenacaoDeEfeitos) {
  return comEfeitoNativoDeDireitos(config, "cadastro", async (tx, op) => {
    await serializarContaNativa(tx, ContaIdSchema.parse(op.requesterUserId));
    const passos = await tx
      .select()
      .from(worlds)
      .where(eq(worlds.operationId, op.id))
      .orderBy(worlds.spaceId);
    const idsMundos = passos.map((p) => p.spaceId);
    const mundos = idsMundos.length
      ? await tx
          .select()
          .from(spaces)
          .where(inArray(spaces.id, idsMundos))
          .orderBy(spaces.id)
          .for("update")
      : [];
    assertAllowed(
      mundos.length === passos.length &&
        passos.every(
          (p) =>
            p.phase === "dependencies" &&
            p.snapshotCursor === p.sourceRevision &&
            mundos.some(
              (m) =>
                m.id === p.spaceId &&
                m.rightsOperationId === op.id &&
                !m.rightsDraining &&
                m.status === "archived" &&
                m.revision === p.sourceRevision &&
                m.journalSeq === p.sourceJournalSeq &&
                m.leaseEpoch === p.sourceLeaseEpoch + 1 &&
                m.managementRevision === p.sourceManagementRevision + 1,
            ),
        ),
      "DIREITOS_INTEGRIDADE",
      "O processamento dos mundos ainda não foi concluído.",
    );
    const [alvo] = await tx
      .select()
      .from(subjects)
      .where(and(eq(subjects.operationId, op.id), eq(subjects.phase, "selected")))
      .orderBy(subjects.profileReference)
      .limit(1);
    assertAllowed(
      alvo?.liveProfileId && alvo.liveProfileId === alvo.profileReference,
      "DIREITOS_INTEGRIDADE",
      "Referência pessoal não disponível.",
    );
    const [perfil] = await tx
      .select()
      .from(profiles)
      .where(eq(profiles.id, alvo.profileReference))
      .for("update");
    const [vinculo] = await tx
      .select()
      .from(guardians)
      .where(eq(guardians.profileId, alvo.profileReference))
      .for("share");
    assertAllowed(
      perfil &&
        perfil.rightsOperationId === op.id &&
        perfil.status === "suspended" &&
        perfil.rightsFrozenState !== null &&
        autoridadeDoPerfilCongelado(config, op, perfil, vinculo, alvo),
      "DIREITOS_INTEGRIDADE",
      "A responsabilidade pessoal congelada mudou.",
    );
    const sociais = await expurgarLoteDeReferenciasSociais(tx, perfil.id);
    if (sociais.count > 0) {
      await logAuditEventStrict(
        "recreio.rights_references_purged",
        op.requesterUserId,
        { app: "recreio", operationId: op.id, domain: sociais.domain, count: sociais.count },
        { writer: tx },
      );
      return {
        situacao: "referencias_sociais_retiradas" as const,
        operacaoId: op.id,
        dominio: sociais.domain,
        quantidade: sociais.count,
      };
    }
    const proprios = await tx
      .select({ id: members.id })
      .from(members)
      .where(eq(members.profileId, perfil.id))
      .orderBy(members.id)
      .for("update");
    const idsMembros = proprios.map((m) => m.id);
    const convitesDoPerfil = or(
      eq(invites.targetProfileId, perfil.id),
      eq(invites.acceptedByProfileId, perfil.id),
      idsMembros.length ? inArray(invites.invitedByMemberId, idsMembros) : undefined,
    );
    // SET NULL de um alvo nunca pode tornar um convite dirigido em código aberto.
    await tx
      .update(invites)
      .set({ state: "revoked" })
      .where(and(convitesDoPerfil, inArray(invites.state, ["pending_approval", "sent"])));
    await tx.update(invites).set({ participation: null }).where(convitesDoPerfil);
    await tx
      .update(directed)
      .set({ participation: null })
      .where(or(eq(directed.originProfileId, perfil.id), eq(directed.targetProfileId, perfil.id)));
    await tx
      .update(directed)
      .set({ state: "revoked", finishedAt: AGORA })
      .where(
        and(
          or(eq(directed.originProfileId, perfil.id), eq(directed.targetProfileId, perfil.id)),
          eq(directed.state, "pending"),
        ),
      );
    await tx
      .update(members)
      .set({
        state: "former",
        participation: null,
        leftAt: sql`coalesce(${members.leftAt},${AGORA})`,
      })
      .where(eq(members.profileId, perfil.id));
    // A aceitação continua registrada, mas a FK composta não pode manter o
    // login do perfil depois que a referência técnica perde user_id.
    await tx
      .update(groupInvites)
      .set({ acceptedProfileId: null, acceptedUserId: null })
      .where(eq(groupInvites.acceptedProfileId, perfil.id));
    await tx.delete(traces).where(eq(traces.profileId, perfil.id));
    await tx.delete(creationRequests).where(eq(creationRequests.profileId, perfil.id));
    if (perfil.kind === "minor") await tx.delete(minors).where(eq(minors.profileId, perfil.id));
    if (perfil.kind === "adult")
      await tx
        .update(devices)
        .set({ activeProfileId: null, profileSelectedAt: null })
        .where(
          and(
            eq(devices.activeProfileId, perfil.id),
            eq(devices.kind, "account"),
            eq(devices.userId, op.requesterUserId),
            isNull(devices.minorContextGeneration),
          ),
        );
    // Não limpar minorContextGeneration: apagar o perfil não desbloqueia gestão.
    await tx
      .update(profiles)
      .set({
        userId: null,
        groupId: null,
        coverageEnabled: false,
        nickname: "Perfil retirado",
        avatar: "padrao",
        updatedAt: AGORA,
        rightsFrozenState: recreioRightsProfileProjection({
          ...profiles,
          userId: sql`null`,
          groupId: sql`null`,
          coverageEnabled: sql`false`,
          nickname: sql`'Perfil retirado'`,
          avatar: sql`'padrao'`,
        }),
      })
      .where(eq(profiles.id, perfil.id));

    // Usar o prazo original máximo, não "agora + 30 dias". Clock materializado
    // mantém precisão PG e coerência dos campos mesmo na fronteira do prazo.
    const [retencao] = await tx.execute<{ phase: string }>(sql`
      with instante as materialized(select statement_timestamp() as agora), limite as materialized(
        select i.agora, greatest(i.agora,
          coalesce((select max(g.expires_at) from recreio.game_sessions g where g.profile_id=${perfil.id}::uuid),i.agora),
          coalesce((select max(p.retain_until) from recreio.world_host_presences p where p.host_profile_id=${perfil.id}::uuid),i.agora),
          coalesce((select max(c.retain_until) from recreio.space_visit_invites c where c.origin_profile_id=${perfil.id}::uuid or c.target_profile_id=${perfil.id}::uuid),i.agora),
          coalesce((select max(c.retain_until) from recreio.directed_space_invites c where c.origin_profile_id=${perfil.id}::uuid or c.target_profile_id=${perfil.id}::uuid),i.agora)
        ) as ate from instante i
      ) update recreio.rights_subjects s set
        phase=case when l.ate>l.agora then 'minimized' else 'purging' end,
        minimized_at=l.agora,retained_until=case when l.ate>l.agora then l.ate else null end,
        retention_policy_version='perfil-2026-11-19'
      from limite l where s.operation_id=${op.id}::uuid and s.profile_reference=${perfil.id}::uuid and s.live_profile_id=${perfil.id}::uuid and s.phase='selected'
      returning s.phase
    `);
    const fase = z.enum(["minimized", "purging"]).parse(retencao?.phase);
    const pendentes = await tx
      .select({ id: subjects.profileReference })
      .from(subjects)
      .where(and(eq(subjects.operationId, op.id), eq(subjects.phase, "selected")))
      .limit(1);
    const liberarMundos = pendentes.length === 0;
    if (liberarMundos) {
      const alvosDaOperacao = await tx
        .select({ id: subjects.profileReference })
        .from(subjects)
        .where(eq(subjects.operationId, op.id))
        .orderBy(subjects.profileReference);
      const retirados = new Set(alvosDaOperacao.map((p) => p.id));
      for (const mundo of mundos) {
        const passo = passos.find((p) => p.spaceId === mundo.id);
        assertAllowed(passo, "DIREITOS_INTEGRIDADE", "Etapa do mundo ausente.");
        const outros = await tx.$count(
          members,
          and(
            eq(members.spaceId, mundo.id),
            sql`${members.profileId} is not null and ${members.profileId}<>${perfil.id}::uuid`,
            sql`${members.state}<>'former'`,
          ),
        );
        const criadoPeloPerfil =
          mundo.createdByProfileId !== null && retirados.has(mundo.createdByProfileId);
        // O rótulo do mundo criado pelo perfil também é retirado; o estado do
        // jogo permanece e o resumo atual já foi regenerado a partir da foto.
        const nome = criadoPeloPerfil ? "Mundo preservado" : mundo.name;
        const steward =
          mundo.stewardProfileId !== null && retirados.has(mundo.stewardProfileId)
            ? null
            : mundo.stewardProfileId;
        const criador = criadoPeloPerfil ? null : mundo.createdByProfileId;
        assertAllowed(
          outros === 0 ||
            (mundo.stewardProfileId !== null && !retirados.has(mundo.stewardProfileId)),
          "DIREITOS_INTEGRIDADE",
          "Um mundo compartilhado ainda precisa de responsável.",
        );
        const estado =
          passo.sourceStatus === "deleted" || (outros === 0 && steward === null && criador === null)
            ? "deleted"
            : passo.sourceStatus;
        await tx
          .update(spaces)
          .set({
            name: nome,
            stewardProfileId: steward,
            createdByProfileId: criador,
            ...(passo.sourceRevision === 0 ? { summary: null } : {}),
            status: estado,
            rightsOperationId: null,
            rightsFrozenState: null,
            updatedAt: AGORA,
          })
          .where(eq(spaces.id, mundo.id));
        await tx
          .update(worlds)
          .set({ phase: "completed", completedAt: AGORA })
          .where(and(eq(worlds.operationId, op.id), eq(worlds.spaceId, mundo.id)));
      }
    }
    await logAuditEventStrict(
      "recreio.rights_profile_minimized",
      op.requesterUserId,
      {
        app: "recreio",
        operationId: op.id,
        kind: op.kind,
        profileCount: 1,
        worldCount: liberarMundos ? mundos.length : 0,
        retained: fase === "minimized",
      },
      { writer: tx },
    );
    return {
      situacao: "perfil_minimizado" as const,
      operacaoId: op.id,
      retido: fase === "minimized",
    };
  });
}
