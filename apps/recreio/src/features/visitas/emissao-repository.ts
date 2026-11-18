import "server-only";
import { createHash } from "node:crypto";
import { logAuditEventStrict } from "@informach/auth";
import { and, eq, gt, or, sql } from "@informach/db";
import {
  recreioVisitInviteWorldApprovals as approvals,
  recreioSpaceVisitInvites as invites,
  recreioSpaceMembers as members,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import { ErroDoRecreio, podeConvidar } from "@informach/recreio";
import {
  CONVITES_DE_VISITA_PENDENTES_MAX,
  type NovoConviteDeVisita,
  RECIBOS_DE_VISITA_POR_PERFIL_MAX,
} from "@informach/recreio/contrato";
import type { AutorDeMundos } from "@/features/autoridade-de-jogo/mundos-repository";
import {
  amizadeAtualDoConvite,
  conferirConteudoDoConvite,
} from "@/features/mundos/convites-dirigidos-amizade-repository";
import { comJogadorSocial } from "@/features/social/autoridade-repository";
import { assertAllowed } from "@/lib/errors";
import { comJogadorEAnfitriaoNaVisita } from "./contexto-repository";
import { reciboDoConviteDeVisita as recibo } from "./recibos";

type Convite = typeof invites.$inferSelect;
function hashDoPedido(autor: AutorDeMundos, pedido: NovoConviteDeVisita) {
  return createHash("sha256")
    .update("recreio:visit-invite:v1\n")
    .update(JSON.stringify([autor.perfilId, pedido.mundoId, pedido.perfilId, pedido.presencaId]))
    .digest("hex");
}
function conferirRecibo(convite: Convite, hash: string, agora: Date, jogo: string) {
  assertAllowed(
    convite.requestHash === hash && convite.retainUntil > agora,
    "CONFLITO",
    "Esta tentativa mudou ou venceu. Confira os convites antes de preparar outra.",
  );
  return recibo(convite, jogo);
}

/** Só a própria tentativa, sem identidade da outra ponta ou presença atual; não exige plano nativo. */
export function recuperarTentativaDeVisita(autor: AutorDeMundos, pedido: NovoConviteDeVisita) {
  return comJogadorSocial(autor, null, async (tx, ctx) => {
    const [anterior] = await tx
      .select({ convite: invites, jogo: spaces.gameId })
      .from(invites)
      .innerJoin(spaces, eq(spaces.id, invites.spaceId))
      .where(
        and(
          eq(invites.originProfileId, autor.perfilId),
          eq(invites.clientKey, pedido.pedidoId),
          "sid" in autor ? eq(spaces.gameId, autor.jogo) : undefined,
        ),
      );
    return anterior
      ? conferirRecibo(
          anterior.convite,
          hashDoPedido(autor, pedido),
          await ctx.conferirPrazo(),
          anterior.jogo,
        )
      : null;
  });
}

/** Cria somente convite de visita, sem concessão, SID ou participação permanente. */
export function gravarConviteDeVisita(autor: AutorDeMundos, pedido: NovoConviteDeVisita) {
  return comJogadorEAnfitriaoNaVisita(
    autor,
    {
      mundoId: pedido.mundoId,
      origemId: autor.perfilId,
      destinoId: pedido.perfilId,
      pedidoId: pedido.pedidoId,
    },
    pedido.presencaId,
    async (tx, ctx, anfitriao) => {
      const [anterior] = await tx
        .select()
        .from(invites)
        .where(
          and(eq(invites.originProfileId, autor.perfilId), eq(invites.clientKey, pedido.pedidoId)),
        );
      if (anterior)
        return conferirRecibo(
          anterior,
          hashDoPedido(autor, pedido),
          await ctx.conferirPrazo(),
          ctx.mundo.gameId,
        );
      const amizade = await amizadeAtualDoConvite(tx, ctx);
      await conferirConteudoDoConvite(tx, ctx);
      const permissao = podeConvidar(anfitriao.membro.role, ctx.mundo.membersInvite);
      assertAllowed(
        permissao.pode,
        "PERMISSAO",
        "Este mundo não permite convites de participantes.",
      );
      const [participante] = await tx
        .select({ estado: members.state })
        .from(members)
        .where(and(eq(members.spaceId, ctx.mundo.id), eq(members.profileId, pedido.perfilId)));
      if (participante && participante.estado !== "former") throw new ErroDoRecreio("JA_MEMBRO");
      const agora = await anfitriao.conferirPrazo(),
        [pendente] = await tx
          .select({ id: invites.id })
          .from(invites)
          .where(
            and(
              eq(invites.spaceId, ctx.mundo.id),
              eq(invites.originProfileId, autor.perfilId),
              eq(invites.targetProfileId, pedido.perfilId),
              eq(invites.hostPresenceId, pedido.presencaId),
              eq(invites.state, "pending"),
            ),
          );
      assertAllowed(
        !pendente,
        "PEDIDO_PENDENTE",
        "Já existe um convite pendente para este contato.",
      );
      const [abertos] = await tx
          .select({ total: sql<number>`count(*)::int` })
          .from(invites)
          .where(
            and(
              eq(invites.spaceId, ctx.mundo.id),
              eq(invites.state, "pending"),
              gt(invites.expiresAt, agora),
            ),
          ),
        [retidos] = await tx
          .select({ total: sql<number>`count(*)::int` })
          .from(invites)
          .where(
            or(
              eq(invites.originProfileId, autor.perfilId),
              eq(invites.targetProfileId, pedido.perfilId),
            ),
          );
      assertAllowed(
        (abertos?.total ?? 0) < CONVITES_DE_VISITA_PENDENTES_MAX &&
          (retidos?.total ?? 0) < RECIBOS_DE_VISITA_POR_PERFIL_MAX,
        "LIMITE_DE_CONTATOS",
        "Confira os convites existentes antes de preparar outro.",
      );
      const origem = ctx.composicao.perfis.find((p) => p.id === autor.perfilId),
        destino = ctx.composicao.perfis.find((p) => p.id === pedido.perfilId);
      assertAllowed(origem && destino, "PEDIDO", "Convite não disponível.");
      const criadoEm = await anfitriao.conferirPrazo(),
        [convite] = await tx
          .insert(invites)
          .values({
            spaceId: ctx.mundo.id,
            hostPresenceId: anfitriao.presenca.id,
            hostSessionId: anfitriao.presenca.hostSessionId,
            hostMemberId: anfitriao.membro.id,
            originProfileId: autor.perfilId,
            targetProfileId: pedido.perfilId,
            clientKey: pedido.pedidoId,
            requestHash: hashDoPedido(autor, pedido),
            managementRevision: ctx.mundo.managementRevision,
            friendshipRevision: amizade.revision,
            originPolicyVersion: origem.policyVersion,
            targetPolicyVersion: destino.policyVersion,
            originAccessGeneration:
              ctx.origem.fato.tipo === "protegido"
                ? ctx.origem.fato.responsabilidade.geracao
                : null,
            targetAccessGeneration:
              ctx.destino.fato.tipo === "protegido"
                ? ctx.destino.fato.responsabilidade.geracao
                : null,
            createdAt: criadoEm,
            expiresAt: new Date(
              Math.min(criadoEm.getTime() + 86_400_000, anfitriao.presenca.validUntil.getTime()),
            ),
            retainUntil: new Date(criadoEm.getTime() + 30 * 86_400_000),
          })
          .returning();
      assertAllowed(convite, "CONFLITO", "Não foi possível confirmar o convite.");
      if (!permissao.precisaDeAprovacao)
        await tx.insert(approvals).values({
          inviteId: convite.id,
          spaceId: ctx.mundo.id,
          approvedByMemberId: anfitriao.membro.id,
          approvedByUserId: ctx.contaId,
          actorKind: "jogador",
          managementRevision: ctx.mundo.managementRevision,
          createdAt: criadoEm,
        });
      await logAuditEventStrict(
        "recreio.visit_invite_created",
        ctx.contaId,
        {
          app: "recreio",
          spaceId: ctx.mundo.id,
          inviteId: convite.id,
          memberId: anfitriao.membro.id,
          profileId: autor.perfilId,
          targetProfileId: pedido.perfilId,
          worldApproved: !permissao.precisaDeAprovacao,
        },
        { writer: tx },
      );
      assertAllowed(
        convite.expiresAt > (await anfitriao.conferirPrazo()),
        "PEDIDO",
        "O convite venceu.",
      );
      return recibo(convite, ctx.mundo.gameId);
    },
  );
}
