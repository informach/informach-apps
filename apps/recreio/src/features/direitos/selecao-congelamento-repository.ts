import "server-only";
import { and, eq, isNull, sql } from "@informach/db";
import {
  recreioGameSessions as games,
  recreioSpaceLeases as leases,
  recreioSpaceMembers as members,
  recreioProfiles as profiles,
  recreioRightsProfileProjection,
  recreioRightsWorldDrainingProjection,
  recreioRightsWorldProjection,
  recreioSpaceSnapshots as snapshots,
  recreioSpaces as spaces,
  recreioRightsSubjects as subjects,
  recreioRightsWorlds as worlds,
} from "@informach/db/schema";
import { assertAllowed } from "@/lib/errors";
import { AGORA, type Transacao } from "@/lib/repository";
import type { PlanoDeDireitos } from "./preparacao-contrato";

/** SQL preparation shared by native admission and the future private recovery
 * coordinator. Caller holds the selected world/profile locks and has already
 * verified the original decision. These helpers issue no consent or authority,
 * do not read the singleton and never perform network or game simulation. */
export async function inspecionarDrenagemDaSelecao(
  tx: Transacao,
  ids: readonly string[],
  mundos: readonly (typeof spaces.$inferSelect)[],
) {
  assertAllowed(
    mundos.length === 0 || ids.length > 0,
    "DIREITOS_INTEGRIDADE",
    "Seleção pessoal ausente.",
  );
  const drenando = new Set<string>();
  for (const mundo of mundos) {
    assertAllowed(
      mundo.rightsOperationId === null && !mundo.rightsDraining,
      "MUNDO_EM_USO",
      "Um mundo já tem retirada em andamento.",
    );
    const outrosAtuais = await tx.$count(
      members,
      and(
        eq(members.spaceId, mundo.id),
        sql`${members.profileId} is not null and ${members.profileId} not in (${sql.join(
          ids.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})`,
        sql`${members.state}<>'former'`,
      ),
    );
    assertAllowed(
      outrosAtuais === 0 || !ids.some((id) => id === mundo.stewardProfileId),
      "RESPONSABILIDADE",
      "Transfira a responsabilidade pelo mundo compartilhado antes de retirar este perfil.",
    );
    const [posse] = await tx
      .select({ id: leases.id })
      .from(leases)
      .where(and(eq(leases.spaceId, mundo.id), isNull(leases.releasedAt)))
      .limit(1);
    const [sessao] = await tx
      .select({ id: games.id })
      .from(games)
      .where(and(eq(games.spaceId, mundo.id), isNull(games.endedAt)))
      .limit(1);
    const [foto] = await tx
      .select({ diario: snapshots.journalSeq })
      .from(snapshots)
      .where(and(eq(snapshots.spaceId, mundo.id), eq(snapshots.revision, mundo.revision)))
      .limit(1);
    const fotoCompleta =
      mundo.revision === 0 ? mundo.journalSeq === 0 && !foto : foto?.diario === mundo.journalSeq;
    if (mundo.status === "active" || posse || sessao || !fotoCompleta) drenando.add(mundo.id);
  }
  return drenando;
}

export async function congelarSelecaoDeDireitos(
  tx: Transacao,
  selecao: {
    operacaoId: string;
    plano: PlanoDeDireitos;
    alvos: readonly (typeof profiles.$inferSelect)[];
    mundos: readonly (typeof spaces.$inferSelect)[];
    drenando: ReadonlySet<string>;
  },
) {
  const { operacaoId, plano, alvos, mundos, drenando } = selecao;
  assertAllowed(
    new Set(alvos.map((p) => p.id)).size === alvos.length &&
      new Set(mundos.map((m) => m.id)).size === mundos.length &&
      alvos.every(
        (p) =>
          p.rightsOperationId === null &&
          plano.perfis.some((s) => s.id === p.id && s.tipo === p.kind),
      ) &&
      mundos.every((m) => plano.mundos.some((s) => s.id === m.id && s.jogo === m.gameId)) &&
      [...drenando].every((id) => mundos.some((m) => m.id === id)),
    "DIREITOS_INTEGRIDADE",
    "A seleção de congelamento exige revisão.",
  );
  for (const perfil of alvos) {
    const original = plano.perfis.find((p) => p.id === perfil.id);
    assertAllowed(original, "ESCOPO", "Perfil fora da prévia.");
    await tx.insert(subjects).values({
      operationId: operacaoId,
      profileReference: perfil.id,
      liveProfileId: perfil.id,
      policyVersion: perfil.policyVersion,
      guardianReference: original.responsabilidadeId,
    });
    const versao = sql`${profiles.policyVersion}+1`;
    await tx
      .update(profiles)
      .set({
        status: "suspended",
        policyVersion: versao,
        rightsOperationId: operacaoId,
        rightsFrozenState: recreioRightsProfileProjection({
          ...profiles,
          status: sql`'suspended'`,
          policyVersion: versao,
        }),
        updatedAt: AGORA,
      })
      .where(eq(profiles.id, perfil.id));
  }
  for (const mundo of mundos) {
    const drenar = drenando.has(mundo.id);
    await tx.insert(worlds).values({
      operationId: operacaoId,
      spaceId: mundo.id,
      sourceStatus: mundo.status === "active" ? "hibernating" : mundo.status,
      phase: drenar ? "draining" : "frozen",
      sourceRevision: mundo.revision,
      sourceJournalSeq: mundo.journalSeq,
      sourceLeaseEpoch: mundo.leaseEpoch,
      sourceManagementRevision: mundo.managementRevision,
    });
    const cerca = drenar ? sql`${spaces.leaseEpoch}` : sql`${spaces.leaseEpoch}+1`,
      gestao = drenar ? sql`${spaces.managementRevision}` : sql`${spaces.managementRevision}+1`;
    const projetar = drenar ? recreioRightsWorldDrainingProjection : recreioRightsWorldProjection;
    await tx
      .update(spaces)
      .set({
        status: "archived",
        leaseEpoch: cerca,
        managementRevision: gestao,
        rightsOperationId: operacaoId,
        rightsDraining: drenar,
        rightsFrozenState: projetar({
          ...spaces,
          status: sql`'archived'`,
          leaseEpoch: cerca,
          managementRevision: gestao,
        }),
        updatedAt: AGORA,
      })
      .where(eq(spaces.id, mundo.id));
  }
}
