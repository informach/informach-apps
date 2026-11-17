import "server-only";
import { and, db, eq, or } from "@informach/db";
import {
  recreioGuardianLinks as guardians,
  recreioFriendRequests as requests,
} from "@informach/db/schema";
import { type PerfilId, PerfilIdSchema } from "@informach/recreio";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import {
  type ContextoDeSupervisaoSocial,
  comResponsavelSocialNativo,
} from "./responsavel-contexto-repository";

export type ContextoDoResponsavelSocial = ContextoDeSupervisaoSocial & {
  destino: NonNullable<ContextoDeSupervisaoSocial["destino"]>;
};

/** Ser pagante não é ser responsável por este perfil. Não exige jogador do adulto. */
export async function comResponsavelPorPedido<T>(
  autor: AutorNativoRecente,
  pedidoId: string,
  perfilId: PerfilId,
  executar: (tx: Transacao, atual: ContextoDoResponsavelSocial) => Promise<T>,
) {
  const [pista] = await db
    .select({ origem: requests.originProfileId, destino: requests.targetProfileId })
    .from(requests)
    .innerJoin(
      guardians,
      and(eq(guardians.profileId, perfilId), eq(guardians.guardianUserId, autor.contaId)),
    )
    .where(
      and(
        eq(requests.id, pedidoId),
        or(
          eq(requests.originProfileId, guardians.profileId),
          eq(requests.targetProfileId, guardians.profileId),
        ),
      ),
    );
  assertAllowed(pista, "PEDIDO", "Pedido não disponível.");
  return comResponsavelSocialNativo(
    autor,
    perfilId,
    {
      origemId: PerfilIdSchema.parse(pista.origem),
      destinoId: PerfilIdSchema.parse(pista.destino),
      finalidade: "contato",
    },
    async (tx, atual) => {
      const [pedido] = await tx
        .select({ id: requests.id })
        .from(requests)
        .where(
          and(
            eq(requests.id, pedidoId),
            eq(requests.originProfileId, pista.origem),
            eq(requests.targetProfileId, pista.destino),
          ),
        )
        .for("share");
      assertAllowed(pedido && atual.destino, "PEDIDO", "Pedido não disponível.");
      return executar(tx, { ...atual, destino: atual.destino });
    },
  );
}
