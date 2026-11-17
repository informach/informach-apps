import "server-only";
import { and, eq, or } from "@informach/db";
import {
  recreioSocialBlocks as blocks,
  recreioFriendships as friends,
  recreioFriendRequests as requests,
} from "@informach/db/schema";
import { contatoDisponivel } from "@informach/recreio";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { env } from "@/lib/env";
import { assertAllowed } from "@/lib/errors";
import { parSocial } from "./amizade-repository";
import { gravarAprovacaoSocial } from "./consentimentos-repository";
import type { RenovacaoDeAmizade } from "./regras";
import { comResponsavelPorPedido } from "./responsavel-repository";

/** Nova decisão explícita sobre uma relação ainda ativa; nunca reativa amizade removida. */
export async function renovarAprovacaoNoBanco(
  autor: AutorNativoRecente,
  entrada: RenovacaoDeAmizade,
) {
  return comResponsavelPorPedido(autor, entrada.pedidoId, entrada.perfilId, async (tx, atual) => {
    const destino = atual.destino;
    assertAllowed(
      destino &&
        env.RECREIO_FAMILY_MODE === "play" &&
        atual.versaoDoMenor === entrada.versao &&
        contatoDisponivel(atual.origem) &&
        contatoDisponivel(destino),
      "CONFLITO",
      "A supervisão mudou. Reabra o contato antes de confirmar.",
    );
    const [pedido] = await tx
      .select()
      .from(requests)
      .where(eq(requests.id, entrada.pedidoId))
      .for("update");
    const [menor, maior] = parSocial(atual.origem.id, destino.id);
    const [amizade] = await tx
      .select()
      .from(friends)
      .where(and(eq(friends.lowerProfileId, menor), eq(friends.higherProfileId, maior)))
      .for("update");
    assertAllowed(
      pedido?.state === "accepted" &&
        amizade?.state === "active" &&
        amizade.requestId === pedido.id &&
        amizade.revision === entrada.revisaoDaAmizade,
      "CONFLITO",
      "O contato mudou. Reabra a tela antes de confirmar.",
    );
    const [bloqueio] = await tx
      .select({ id: blocks.actorProfileId })
      .from(blocks)
      .where(
        and(
          eq(blocks.blocked, true),
          or(
            and(eq(blocks.actorProfileId, menor), eq(blocks.targetProfileId, maior)),
            and(eq(blocks.actorProfileId, maior), eq(blocks.targetProfileId, menor)),
          ),
        ),
      )
      .limit(1);
    assertAllowed(!bloqueio, "CONTATO", "Contato não disponível.");
    await gravarAprovacaoSocial(tx, atual, pedido.id, "recreio.friend_approval_renewed");
    return { pedidoId: pedido.id, estado: "accepted" as const };
  });
}
