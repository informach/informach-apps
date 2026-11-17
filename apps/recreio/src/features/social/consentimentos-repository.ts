import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, eq } from "@informach/db";
import { recreioFriendConsents as consents } from "@informach/db/schema";
import type { Transacao } from "@/lib/repository";
import type { ContextoDoResponsavelSocial } from "./responsavel-repository";

export async function gravarAprovacaoSocial(
  tx: Transacao,
  atual: ContextoDoResponsavelSocial,
  pedidoId: string,
  evento: "recreio.friend_approval_recorded" | "recreio.friend_approval_renewed",
) {
  const [anterior] = await tx
    .select()
    .from(consents)
    .where(and(eq(consents.requestId, pedidoId), eq(consents.profileId, atual.menor.id)))
    .for("update");
  const identidade = atual.menor.responsabilidade;
  if (
    anterior?.approvedByUserId === atual.contaId &&
    anterior.guardianLinkId === identidade.vinculoId &&
    anterior.accessGeneration === identidade.geracao
  )
    return;
  await tx
    .insert(consents)
    .values({
      requestId: pedidoId,
      profileId: atual.menor.id,
      guardianLinkId: identidade.vinculoId,
      approvedByUserId: atual.contaId,
      accessGeneration: identidade.geracao,
    })
    .onConflictDoUpdate({
      target: [consents.requestId, consents.profileId],
      set: {
        guardianLinkId: identidade.vinculoId,
        approvedByUserId: atual.contaId,
        accessGeneration: identidade.geracao,
        createdAt: await atual.conferirPrazo(),
      },
    });
  await logAuditEventStrict(
    evento,
    atual.contaId,
    { app: "recreio", requestId: pedidoId, profileId: atual.menor.id },
    { writer: tx },
  );
}
