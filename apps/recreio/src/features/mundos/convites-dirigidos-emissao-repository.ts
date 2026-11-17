import "server-only";
import { createHash } from "node:crypto";
import { logAuditEventStrict } from "@informach/auth";
import { and, eq, gt, inArray, sql } from "@informach/db";
import {
  recreioDirectedInviteWorldApprovals as approvals,
  recreioSpaceInvites as codes,
  recreioDirectedSpaceInvites as invites,
  recreioSpaceMembers as members,
} from "@informach/db/schema";
import { podeConvidar } from "@informach/recreio";
import type { NovoConviteDirigido } from "@informach/recreio/contrato";
import type { AutorDeMundos } from "@/features/autoridade-de-jogo/mundos-repository";
import { assertAllowed } from "@/lib/errors";
import {
  amizadeAtualDoConvite,
  conferirConteudoDoConvite,
} from "./convites-dirigidos-amizade-repository";
import { comJogadorNoConvite } from "./convites-dirigidos-contexto-repository";
import { aprovacoesDoConvite, resumoDoConvite } from "./convites-dirigidos-estado-repository";

/** Um UUID por tentativa; corpo divergente nunca recupera nem substitui um pedido anterior. */
export function gravarConviteDirigido(autor: AutorDeMundos, pedido: NovoConviteDirigido) {
  const resumo = createHash("sha256")
    .update(
      `recreio:directed-invite:v1:${JSON.stringify([autor.perfilId, pedido.mundoId, pedido.perfilId, pedido.participacao])}`,
    )
    .digest("hex");
  return comJogadorNoConvite(
    autor,
    {
      mundoId: pedido.mundoId,
      origemId: autor.perfilId,
      destinoId: pedido.perfilId,
      pedidoId: pedido.pedidoId,
    },
    async (tx, ctx) => {
      const [anterior] = await tx
        .select()
        .from(invites)
        .where(
          and(eq(invites.originProfileId, autor.perfilId), eq(invites.clientKey, pedido.pedidoId)),
        );
      if (anterior) {
        assertAllowed(
          anterior.requestHash === resumo && anterior.retainUntil > (await ctx.conferirPrazo()),
          "CONFLITO",
          "Esta tentativa mudou ou venceu. Confira seus convites antes de preparar outra.",
        );
        return resumoDoConvite(
          anterior,
          ctx.mundo.gameId,
          await aprovacoesDoConvite(tx, ctx, anterior),
        );
      }
      const amizade = await amizadeAtualDoConvite(tx, ctx),
        { manifesto } = await conferirConteudoDoConvite(tx, ctx);
      assertAllowed(
        ctx.mundo.status === "active" || ctx.mundo.status === "hibernating",
        "MUNDO",
        "Mundo indisponível.",
      );
      const [emissor] = await tx
        .select()
        .from(members)
        .where(
          and(
            eq(members.spaceId, ctx.mundo.id),
            eq(members.profileId, autor.perfilId),
            eq(members.state, "active"),
          ),
        );
      assertAllowed(
        emissor && (emissor.role !== "coadmin" || ctx.origem.fato.tipo === "adulto"),
        "PEDIDO",
        "Convite não disponível.",
      );
      assertAllowed(
        emissor.role !== "steward" || ctx.mundo.stewardProfileId === autor.perfilId,
        "PEDIDO",
        "Convite não disponível.",
      );
      const permissao = podeConvidar(emissor.role, ctx.mundo.membersInvite);
      assertAllowed(permissao.pode, "PERMISSAO", "Este mundo não permite convites de membros.");
      const mundoAprovou =
        !permissao.precisaDeAprovacao &&
        (emissor.role !== "member" ||
          (emissor.participation !== null && emissor.participation === pedido.participacao));
      const agora = await ctx.conferirPrazo();
      const [abertos] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(invites)
        .where(
          and(
            eq(invites.spaceId, ctx.mundo.id),
            eq(invites.state, "pending"),
            gt(invites.expiresAt, agora),
          ),
        );
      const [retidos] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(invites)
        .where(eq(invites.originProfileId, autor.perfilId));
      const [codigos] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(codes)
        .where(
          and(
            eq(codes.spaceId, ctx.mundo.id),
            inArray(codes.state, ["sent", "pending_approval"]),
            gt(codes.expiresAt, agora),
          ),
        );
      assertAllowed(
        (abertos?.total ?? 0) + (codigos?.total ?? 0) <
          (manifesto.capacidades.mundos?.membrosMax ?? 0) && (retidos?.total ?? 0) < 1000,
        "LIMITE_DE_CONTATOS",
        "Há muitos convites guardados. Confira os existentes antes de preparar outro.",
      );
      const origem = ctx.composicao.perfis.find((p) => p.id === autor.perfilId),
        destino = ctx.composicao.perfis.find((p) => p.id === pedido.perfilId);
      assertAllowed(origem && destino, "PEDIDO", "Convite não disponível.");
      const criadoEm = await ctx.conferirPrazo();
      const [convite] = await tx
        .insert(invites)
        .values({
          spaceId: ctx.mundo.id,
          invitedByMemberId: emissor.id,
          originProfileId: autor.perfilId,
          targetProfileId: pedido.perfilId,
          clientKey: pedido.pedidoId,
          requestHash: resumo,
          participation: pedido.participacao,
          managementRevision: ctx.mundo.managementRevision,
          friendshipRevision: amizade.revision,
          originPolicyVersion: origem.policyVersion,
          targetPolicyVersion: destino.policyVersion,
          originAccessGeneration:
            ctx.origem.fato.tipo === "protegido" ? ctx.origem.fato.responsabilidade.geracao : null,
          targetAccessGeneration:
            ctx.destino.fato.tipo === "protegido"
              ? ctx.destino.fato.responsabilidade.geracao
              : null,
          createdAt: criadoEm,
          expiresAt: new Date(criadoEm.getTime() + 86400000),
          retainUntil: new Date(criadoEm.getTime() + 30 * 86400000),
        })
        .returning();
      assertAllowed(convite, "CONFLITO", "Não foi possível confirmar o convite.");
      if (mundoAprovou)
        await tx.insert(approvals).values({
          inviteId: convite.id,
          spaceId: ctx.mundo.id,
          approvedByMemberId: emissor.id,
          approvedByUserId: ctx.contaId,
          actorKind: "jogador",
          managementRevision: ctx.mundo.managementRevision,
          createdAt: criadoEm,
        });
      await logAuditEventStrict(
        "recreio.space_invite_created",
        ctx.contaId,
        {
          app: "recreio",
          spaceId: ctx.mundo.id,
          inviteId: convite.id,
          memberId: emissor.id,
          form: "member",
          directed: true,
        },
        { writer: tx },
      );
      assertAllowed(convite.expiresAt > (await ctx.conferirPrazo()), "PEDIDO", "O convite venceu.");
      return resumoDoConvite(
        convite,
        ctx.mundo.gameId,
        await aprovacoesDoConvite(tx, ctx, convite),
      );
    },
  );
}
