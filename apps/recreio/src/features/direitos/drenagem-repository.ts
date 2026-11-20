import "server-only";
import { logAuditEventStrict } from "@informach/auth/audit";
import { and, eq, isNull, sql } from "@informach/db";
import {
  recreioSpaceLeases as leases,
  recreioRightsWorldProjection,
  recreioGameSessions as sessions,
  recreioSpaceSnapshots as snapshots,
  recreioSpaces as spaces,
  recreioRightsWorlds as worlds,
} from "@informach/db/schema";
import { ContaIdSchema } from "@informach/recreio";
import { serializarContaNativa } from "@/features/account/serializacao-repository";
import { assertAllowed } from "@/lib/errors";
import { AGORA } from "@/lib/repository";
import { type CoordenacaoDeEfeitos, comEfeitoNativoDeDireitos } from "./efeitos-repository";

/** A posse que já existia conserva seu protocolo para salvar e sair. Não
 * presume que lease vencida salvou: só a foto cobrindo o diário permite cercar
 * a posse e iniciar o tratamento dos bytes. Nenhum diário é descartado. */
export function concluirProximaDrenagem(config: CoordenacaoDeEfeitos) {
  return comEfeitoNativoDeDireitos(config, "drenagem", async (tx, op) => {
    await serializarContaNativa(tx, ContaIdSchema.parse(op.requesterUserId));
    const [passo] = await tx
      .select()
      .from(worlds)
      .where(and(eq(worlds.operationId, op.id), eq(worlds.phase, "draining")))
      .orderBy(worlds.spaceId)
      .limit(1);
    assertAllowed(passo, "DIREITOS_INTEGRIDADE", "Etapa de drenagem ausente.");
    const [mundo] = await tx
      .select()
      .from(spaces)
      .where(eq(spaces.id, passo.spaceId))
      .for("update");
    assertAllowed(
      mundo &&
        mundo.rightsOperationId === op.id &&
        mundo.rightsDraining &&
        mundo.status === "archived" &&
        mundo.leaseEpoch === passo.sourceLeaseEpoch &&
        mundo.managementRevision === passo.sourceManagementRevision &&
        mundo.revision >= passo.sourceRevision &&
        mundo.journalSeq >= passo.sourceJournalSeq &&
        passo.snapshotCursor === 0,
      "DIREITOS_INTEGRIDADE",
      "A drenagem do mundo precisa de revisão.",
    );
    const [posse] = await tx
      .select({ id: leases.id })
      .from(leases)
      .where(and(eq(leases.spaceId, mundo.id), isNull(leases.releasedAt)))
      .limit(1);
    const [sessao] = await tx
      .select({ id: sessions.id })
      .from(sessions)
      .where(and(eq(sessions.spaceId, mundo.id), isNull(sessions.endedAt)))
      .limit(1);
    assertAllowed(!sessao, "DIREITOS_INTEGRIDADE", "Persistem sessões abertas durante a drenagem.");
    if (posse) return { situacao: "aguardando_salvamento" as const, operacaoId: op.id };
    const [foto] = await tx
      .select({ diario: snapshots.journalSeq })
      .from(snapshots)
      .where(and(eq(snapshots.spaceId, mundo.id), eq(snapshots.revision, mundo.revision)))
      .limit(1);
    const coberto =
      mundo.revision === 0 ? mundo.journalSeq === 0 && !foto : foto?.diario === mundo.journalSeq;
    if (!coberto) return { situacao: "recuperacao_pendente" as const, operacaoId: op.id };
    const cerca = sql`${spaces.leaseEpoch}+1`,
      gestao = sql`${spaces.managementRevision}+1`;
    await tx
      .update(spaces)
      .set({
        rightsDraining: false,
        leaseEpoch: cerca,
        managementRevision: gestao,
        rightsFrozenState: recreioRightsWorldProjection({
          ...spaces,
          leaseEpoch: cerca,
          managementRevision: gestao,
        }),
        updatedAt: AGORA,
      })
      .where(eq(spaces.id, mundo.id));
    await tx
      .update(worlds)
      .set({
        phase: "frozen",
        sourceRevision: mundo.revision,
        sourceJournalSeq: mundo.journalSeq,
        sourceLeaseEpoch: mundo.leaseEpoch,
        sourceManagementRevision: mundo.managementRevision,
      })
      .where(
        and(
          eq(worlds.operationId, op.id),
          eq(worlds.spaceId, mundo.id),
          eq(worlds.phase, "draining"),
        ),
      );
    await logAuditEventStrict(
      "recreio.rights_world_drained",
      op.requesterUserId,
      { app: "recreio", operationId: op.id, worldCount: 1 },
      { writer: tx },
    );
    return { situacao: "mundo_drenado" as const, operacaoId: op.id };
  });
}
