import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, db, eq } from "@informach/db";
import {
  recreioFriendConsents as consents,
  recreioFriendRequests as requests,
} from "@informach/db/schema";
import { contatoDisponivel, PerfilIdSchema } from "@informach/recreio";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import type { ReferenciaDeJogador } from "@/features/autoridade-de-jogo/aparelho-repository";
import { assertAllowed } from "@/lib/errors";
import { concluirAmizade } from "./amizade-repository";
import { comJogadorSocial } from "./autoridade-repository";
import type { AprovacaoDeAmizade } from "./regras";
import { comResponsavelPorPedido } from "./responsavel-repository";

export async function aceitarPedidoNoBanco(referencia: ReferenciaDeJogador, pedidoId: string) {
  const [pista] = await db
    .select({ origem: requests.originProfileId })
    .from(requests)
    .where(and(eq(requests.id, pedidoId), eq(requests.targetProfileId, referencia.perfilId)));
  assertAllowed(pista, "PEDIDO", "Pedido não disponível.");
  return comJogadorSocial(referencia, PerfilIdSchema.parse(pista.origem), async (tx, atual) => {
    const [pedido] = await tx
      .select()
      .from(requests)
      .where(
        and(
          eq(requests.id, pedidoId),
          eq(requests.targetProfileId, referencia.perfilId),
          eq(requests.originProfileId, pista.origem),
        ),
      )
      .for("update");
    assertAllowed(pedido && atual.destino, "PEDIDO", "Pedido não disponível.");
    // O ator é o destinatário. O motor recebe as pontas na ordem original do pedido.
    const orientada = { ...atual, origem: atual.destino, destino: atual.origem };
    if (pedido.state === "accepted") return { pedidoId: pedido.id, estado: "accepted" as const };
    assertAllowed(
      pedido.state === "pending" &&
        pedido.expiresAt > (await atual.conferirPrazo()) &&
        contatoDisponivel(atual.origem) &&
        contatoDisponivel(atual.destino),
      "PEDIDO",
      "O pedido não está mais disponível.",
    );
    if (!pedido.targetAcceptedAt) {
      const agora = await atual.conferirPrazo();
      await tx.update(requests).set({ targetAcceptedAt: agora }).where(eq(requests.id, pedido.id));
      pedido.targetAcceptedAt = agora;
      await logAuditEventStrict(
        "recreio.friend_request_accepted",
        atual.contaId,
        { app: "recreio", requestId: pedido.id, profileId: referencia.perfilId },
        { writer: tx },
      );
    }
    return concluirAmizade(tx, orientada, pedido);
  });
}

export async function aprovarPedidoNoBanco(autor: AutorNativoRecente, entrada: AprovacaoDeAmizade) {
  return comResponsavelPorPedido(autor, entrada.pedidoId, entrada.perfilId, async (tx, atual) => {
    const [pedido] = await tx
      .select()
      .from(requests)
      .where(eq(requests.id, entrada.pedidoId))
      .for("update");
    assertAllowed(pedido, "PEDIDO", "Pedido não disponível.");
    if (pedido.state === "accepted") return { pedidoId: pedido.id, estado: "accepted" as const };
    assertAllowed(
      pedido.state === "pending" && pedido.expiresAt > (await atual.conferirPrazo()),
      "PEDIDO",
      "O pedido não está mais disponível.",
    );
    assertAllowed(
      atual.versaoDoMenor === entrada.versao && contatoDisponivel(atual.menor),
      "CONFLITO",
      "A supervisão mudou. Reabra o pedido antes de continuar.",
    );
    const [anterior] = await tx
      .select()
      .from(consents)
      .where(and(eq(consents.requestId, pedido.id), eq(consents.profileId, entrada.perfilId)))
      .for("update");
    const identidade = atual.menor.responsabilidade;
    if (
      !anterior ||
      anterior.approvedByUserId !== autor.contaId ||
      anterior.guardianLinkId !== identidade.vinculoId ||
      anterior.accessGeneration !== identidade.geracao
    ) {
      await tx
        .insert(consents)
        .values({
          requestId: pedido.id,
          profileId: entrada.perfilId,
          guardianLinkId: identidade.vinculoId,
          approvedByUserId: autor.contaId,
          accessGeneration: identidade.geracao,
        })
        .onConflictDoUpdate({
          target: [consents.requestId, consents.profileId],
          set: {
            guardianLinkId: identidade.vinculoId,
            approvedByUserId: autor.contaId,
            accessGeneration: identidade.geracao,
            createdAt: await atual.conferirPrazo(),
          },
        });
      await logAuditEventStrict(
        "recreio.friend_approval_recorded",
        autor.contaId,
        { app: "recreio", requestId: pedido.id, profileId: entrada.perfilId },
        { writer: tx },
      );
    }
    return concluirAmizade(tx, atual, pedido);
  });
}
