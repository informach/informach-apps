import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, asc, eq, inArray } from "@informach/db";
import { recreioSpaceInvites as invites } from "@informach/db/schema";
import type { Transacao } from "@/lib/repository";

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
  return async (contaId: string, motivo: "steward_changed" | "member_removed") => {
    if (linhas.length === 0) return;
    await tx
      .update(invites)
      .set({ state: "revoked" })
      .where(
        inArray(
          invites.id,
          linhas.map((x) => x.id),
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
        count: linhas.length,
      },
      { writer: tx },
    );
  };
}
