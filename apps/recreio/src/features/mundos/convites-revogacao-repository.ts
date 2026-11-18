import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, asc, eq, inArray } from "@informach/db";
import {
  recreioDirectedSpaceInvites as directed,
  recreioSpaceInvites as invites,
} from "@informach/db/schema";
import { AGORA, type Transacao } from "@/lib/repository";

/** Chamar sob a trava do mundo, antes do cursor; só aplicar após reler os prazos. */
export async function prepararRevogacaoDeConvites(
  tx: Transacao,
  mundoId: string,
  membroId: string,
) {
  const linhas = await tx
    .select({ id: invites.id })
    .from(invites)
    .where(
      and(
        eq(invites.spaceId, mundoId),
        eq(invites.invitedByMemberId, membroId),
        inArray(invites.state, ["sent", "pending_approval"]),
      ),
    )
    .orderBy(asc(invites.id))
    .for("update");
  const dirigidos = await tx
    .select({ id: directed.id })
    .from(directed)
    .where(
      and(
        eq(directed.spaceId, mundoId),
        eq(directed.invitedByMemberId, membroId),
        eq(directed.state, "pending"),
      ),
    )
    .orderBy(directed.id)
    .for("update");
  return async (
    contaId: string,
    motivo:
      | "steward_changed"
      | "member_removed"
      | "coadmin_removed"
      | "world_archived"
      | "member_left",
  ) => {
    if (linhas.length + dirigidos.length === 0) return;
    if (linhas.length > 0)
      await tx
        .update(invites)
        .set({ state: "revoked" })
        .where(
          inArray(
            invites.id,
            linhas.map((x) => x.id),
          ),
        );
    if (dirigidos.length > 0)
      await tx
        .update(directed)
        .set({ state: "revoked", finishedAt: AGORA })
        .where(
          inArray(
            directed.id,
            dirigidos.map((x) => x.id),
          ),
        );
    await logAuditEventStrict(
      "recreio.space_invites_revoked",
      contaId,
      {
        app: "recreio",
        spaceId: mundoId,
        memberId: membroId,
        reason: motivo,
        count: linhas.length + dirigidos.length,
        directedCount: dirigidos.length,
      },
      { writer: tx },
    );
  };
}
