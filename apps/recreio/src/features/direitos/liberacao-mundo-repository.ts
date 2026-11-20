import "server-only";
import { logAuditEventStrict } from "@informach/auth/audit";
import { and, eq, sql } from "@informach/db";
import {
  recreioSpaceMembers as members,
  recreioSpaces as spaces,
  recreioRightsSubjects as subjects,
  recreioRightsWorlds as worlds,
} from "@informach/db/schema";
import { assertAllowed } from "@/lib/errors";
import { AGORA } from "@/lib/repository";
import { conferirPerfisMinimizados } from "./conclusao-perfis-repository";
import { type CoordenacaoDeEfeitos, comEfeitoNativoDeDireitos } from "./efeitos-repository";

/** One world per transaction, after personal/game effects, including when all
 * signed subjects were already absent from the backup. Never infers a steward
 * or manufactures an acceptance; shared worlds keep their actual custodian. */
export function liberarProximoMundoDeDireitos(config: CoordenacaoDeEfeitos) {
  return comEfeitoNativoDeDireitos(config, "liberacao", async (tx, op) => {
    const [passo] = await tx
      .select()
      .from(worlds)
      .where(and(eq(worlds.operationId, op.id), eq(worlds.phase, "dependencies")))
      .orderBy(worlds.spaceId)
      .limit(1);
    assertAllowed(passo, "DIREITOS_INTEGRIDADE", "Etapa de liberação ausente.");
    const [mundo] = await tx
      .select()
      .from(spaces)
      .where(eq(spaces.id, passo.spaceId))
      .for("update");
    assertAllowed(
      mundo &&
        mundo.rightsOperationId === op.id &&
        !mundo.rightsDraining &&
        mundo.status === "archived" &&
        mundo.revision === passo.sourceRevision &&
        mundo.journalSeq === passo.sourceJournalSeq &&
        mundo.leaseEpoch === passo.sourceLeaseEpoch + 1 &&
        mundo.managementRevision === passo.sourceManagementRevision + 1 &&
        passo.snapshotCursor === passo.sourceRevision,
      "DIREITOS_INTEGRIDADE",
      "O processamento do mundo ainda não foi concluído.",
    );
    const alvos = await tx
      .select()
      .from(subjects)
      .where(eq(subjects.operationId, op.id))
      .orderBy(subjects.profileReference)
      .limit(257);
    assertAllowed(
      alvos.length > 0 && alvos.length <= 256,
      "DIREITOS_INTEGRIDADE",
      "Seleção pessoal inconsistente.",
    );
    await conferirPerfisMinimizados(tx, op, alvos);
    const retirados = new Set(alvos.map((a) => a.profileReference)),
      outros = await tx.$count(
        members,
        and(
          eq(members.spaceId, mundo.id),
          sql`${members.profileId} is not null and ${members.state}<>'former'`,
        ),
      ),
      criadoPeloPerfil =
        mundo.createdByProfileId !== null && retirados.has(mundo.createdByProfileId),
      steward =
        mundo.stewardProfileId !== null && retirados.has(mundo.stewardProfileId)
          ? null
          : mundo.stewardProfileId,
      criador = criadoPeloPerfil ? null : mundo.createdByProfileId;
    assertAllowed(
      outros === 0 || (steward !== null && !retirados.has(steward)),
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
        name: criadoPeloPerfil ? "Mundo preservado" : mundo.name,
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
    await logAuditEventStrict(
      "recreio.rights_world_released",
      op.requesterUserId,
      { app: "recreio", operationId: op.id, gameId: mundo.gameId, worldCount: 1 },
      { writer: tx },
    );
    return { situacao: "mundo_liberado" as const, operacaoId: op.id, quantidade: 1 };
  });
}
