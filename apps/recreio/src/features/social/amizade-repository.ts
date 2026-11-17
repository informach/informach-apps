import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, eq, or } from "@informach/db";
import {
  recreioSocialBlocks as blocks,
  recreioFriendConsents as consents,
  recreioFriendships as friends,
  recreioFriendRequests as requests,
} from "@informach/db/schema";
import {
  type AprovacaoSocial,
  amizadeDisponivel,
  ContaIdSchema,
  contatoDisponivel,
  type PerfilId,
  PerfilIdSchema,
} from "@informach/recreio";
import { env } from "@/lib/env";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import type { ContextoSocial } from "./autoridade-repository";
import { LIMITE_DE_AMIGOS } from "./regras";

export function parSocial(a: PerfilId, b: PerfilId): [PerfilId, PerfilId] {
  return a < b ? [a, b] : [b, a];
}

export async function concluirAmizade(
  tx: Transacao,
  atual: ContextoSocial,
  pedido: typeof requests.$inferSelect,
) {
  const destino = atual.destino;
  assertAllowed(
    destino && pedido.originProfileId === atual.origem.id && pedido.targetProfileId === destino.id,
    "PEDIDO",
    "Pedido não disponível.",
  );
  if (pedido.state === "accepted") return { pedidoId: pedido.id, estado: "accepted" as const };
  assertAllowed(
    pedido.state === "pending" && pedido.expiresAt > (await atual.conferirPrazo()),
    "PEDIDO",
    "O pedido não está mais disponível.",
  );
  assertAllowed(
    contatoDisponivel(atual.origem) &&
      contatoDisponivel(destino) &&
      ((atual.origem.tipo === "adulto" && destino.tipo === "adulto") ||
        env.RECREIO_FAMILY_MODE === "play"),
    "PEDIDO",
    "O pedido não está mais disponível.",
  );
  const bloqueios = await tx
    .select({ id: blocks.actorProfileId })
    .from(blocks)
    .where(
      and(
        eq(blocks.blocked, true),
        or(
          and(eq(blocks.actorProfileId, atual.origem.id), eq(blocks.targetProfileId, destino.id)),
          and(eq(blocks.actorProfileId, destino.id), eq(blocks.targetProfileId, atual.origem.id)),
        ),
      ),
    )
    .limit(1);
  assertAllowed(bloqueios.length === 0, "PEDIDO", "O pedido não está mais disponível.");
  if (!pedido.targetAcceptedAt) return { pedidoId: pedido.id, estado: "pending" as const };
  const aprovacoes = await tx
    .select()
    .from(consents)
    .where(eq(consents.requestId, pedido.id))
    .for("share");
  const aprovacao = (perfilId: PerfilId): AprovacaoSocial | null => {
    const linha = aprovacoes.find((a) => a.profileId === perfilId);
    return linha?.approvedByUserId
      ? {
          perfilId: PerfilIdSchema.parse(linha.profileId),
          contaId: ContaIdSchema.parse(linha.approvedByUserId),
          vinculoId: linha.guardianLinkId,
          geracao: linha.accessGeneration,
        }
      : null;
  };
  const pronta = amizadeDisponivel(atual.origem, destino, {
    amizadeAceita: true,
    bloqueadoPorUmaDasPartes: bloqueios.length > 0,
    aprovacaoDaOrigem: aprovacao(atual.origem.id),
    aprovacaoDoDestino: aprovacao(destino.id),
  });
  if (!pronta) return { pedidoId: pedido.id, estado: "pending" as const };
  const [menor, maior] = parSocial(atual.origem.id, destino.id);
  const [existente] = await tx
    .select()
    .from(friends)
    .where(and(eq(friends.lowerProfileId, menor), eq(friends.higherProfileId, maior)))
    .for("update");
  assertAllowed(
    !existente || existente.state === "removed",
    "CONFLITO",
    "O contato mudou. Reabra a tela para conferir.",
  );
  for (const perfilId of [menor, maior]) {
    const amigos = await tx
      .select({ id: friends.lowerProfileId })
      .from(friends)
      .where(
        and(
          eq(friends.state, "active"),
          or(eq(friends.lowerProfileId, perfilId), eq(friends.higherProfileId, perfilId)),
        ),
      )
      .limit(LIMITE_DE_AMIGOS);
    assertAllowed(
      amigos.length < LIMITE_DE_AMIGOS,
      "LIMITE_DE_CONTATOS",
      "Não há espaço para outro contato agora. Confira os contatos existentes.",
    );
  }
  const revisao = (existente?.revision ?? 0) + 1;
  assertAllowed(revisao < 2147483647, "CONFLITO", "Não foi possível confirmar o contato.");
  const agora = await atual.conferirPrazo();
  assertAllowed(pedido.expiresAt > agora, "PEDIDO", "O pedido venceu. Prepare um novo pedido.");
  if (existente)
    await tx
      .update(friends)
      .set({
        state: "active",
        requestId: pedido.id,
        revision: revisao,
        updatedAt: agora,
        removedAt: null,
      })
      .where(and(eq(friends.lowerProfileId, menor), eq(friends.higherProfileId, maior)));
  else
    await tx.insert(friends).values({
      lowerProfileId: menor,
      higherProfileId: maior,
      requestId: pedido.id,
      revision: revisao,
      createdAt: agora,
      updatedAt: agora,
    });
  await tx
    .update(requests)
    .set({ state: "accepted", finishedAt: agora })
    .where(eq(requests.id, pedido.id));
  await logAuditEventStrict(
    "recreio.friendship_started",
    atual.contaId,
    {
      app: "recreio",
      requestId: pedido.id,
      profileId: menor,
      targetProfileId: maior,
      revision: revisao,
    },
    { writer: tx },
  );
  assertAllowed(
    pedido.expiresAt > (await atual.conferirPrazo()),
    "PEDIDO",
    "O pedido venceu. Prepare um novo pedido.",
  );
  return { pedidoId: pedido.id, estado: "accepted" as const };
}
