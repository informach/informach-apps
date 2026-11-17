import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, eq, inArray, isNull, sql } from "@informach/db";
import {
  recreioDirectedSpaceInvites as directed,
  recreioGameSessions as games,
  recreioSpaceInvites as invites,
  recreioSpaceLeases as leases,
  recreioSpaceMembers as members,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import { encerrarSessoesAbertas } from "@/features/sessao-de-jogo/encerramento-repository";
import { assertAllowed } from "@/lib/errors";
import { AGORA } from "@/lib/repository";
import type { GestaoDoMundo } from "./administracao";
import { prepararRevogacaoDeConvites } from "./convites-revogacao-repository";
import type { AutorDaGestaoDeMundo } from "./gestao-nativa-autor";
import { comGestaoNativaDoMundo } from "./gestao-nativa-repository";
import { revogarPropostasDoMembro } from "./responsabilidade-repository";

export function registrarGestaoDoMundo(autor: AutorDaGestaoDeMundo, pedido: GestaoDoMundo) {
  return comGestaoNativaDoMundo(
    autor,
    pedido.mundoId,
    pedido.operacao === "coadministracao" ? pedido.membroId : undefined,
    async (tx, ctx) => {
      assertAllowed(
        ctx.responsavel,
        "RESPONSAVEL",
        "Somente o responsável atual pode alterar a gestão deste mundo.",
      );
      assertAllowed(
        ctx.mundo.managementRevision === pedido.versaoDaGestao,
        "CONFLITO",
        "A gestão mudou. Atualize a página e confira a revisão antes de continuar.",
      );
      await ctx.conferirPrazo();
      let mudou = false;
      if (pedido.operacao === "coadministracao") {
        const alvo = ctx.alvo;
        assertAllowed(
          alvo &&
            alvo.id !== ctx.proprio.id &&
            alvo.state !== "former" &&
            alvo.role !== "steward" &&
            alvo.profileId !== ctx.mundo.stewardProfileId &&
            ctx.perfilAlvo?.kind === "adult" &&
            ctx.perfilAlvo.status === "active",
          "PARTICIPACAO",
          "Escolha outra participação adulta atual deste mundo.",
        );
        mudou = alvo.role !== pedido.papel;
        if (mudou) {
          const revogar = await prepararRevogacaoDeConvites(tx, ctx.mundo.id, alvo.id);
          await tx.update(members).set({ role: pedido.papel }).where(eq(members.id, alvo.id));
          if (pedido.papel === "member") await revogar(ctx.contaId, "coadmin_removed");
          await encerrarSessoesAbertas(
            tx,
            sql`${games.spaceId} = ${ctx.mundo.id} and ${games.profileId} = ${alvo.profileId}`,
            "permissions_changed",
            { porQuem: "ator", contaId: ctx.contaId },
          );
        }
      } else if (pedido.operacao === "convites") {
        mudou = ctx.mundo.membersInvite !== pedido.membrosConvidam;
        if (mudou)
          await tx
            .update(spaces)
            .set({ membersInvite: pedido.membrosConvidam })
            .where(eq(spaces.id, ctx.mundo.id));
      } else {
        const arquivar = pedido.operacao === "arquivar";
        assertAllowed(
          arquivar
            ? ["active", "hibernating", "archived"].includes(ctx.mundo.status)
            : ["archived", "hibernating"].includes(ctx.mundo.status),
          "MUNDO",
          "Este mundo não está disponível para esta alteração.",
        );
        mudou = arquivar ? ctx.mundo.status !== "archived" : ctx.mundo.status === "archived";
        if (mudou) {
          // Nada encerra uma partida ou inventa um ACK para conseguir arquivar.
          const [sessao] = await tx
            .select({ id: games.id })
            .from(games)
            .where(and(eq(games.spaceId, ctx.mundo.id), isNull(games.endedAt)))
            .limit(1);
          const [posse] = await tx
            .select({ id: leases.id })
            .from(leases)
            .where(and(eq(leases.spaceId, ctx.mundo.id), isNull(leases.releasedAt)))
            .limit(1);
          assertAllowed(
            !sessao && !posse,
            "MUNDO_OCUPADO",
            "Todos precisam sair pelo jogo. Aguarde o salvamento e o encerramento do servidor antes de continuar.",
          );
          await tx
            .update(spaces)
            .set({
              status: arquivar ? "archived" : "hibernating",
              archivedAt: arquivar ? AGORA : null,
            })
            .where(eq(spaces.id, ctx.mundo.id));
          if (arquivar) {
            const emissores = await tx
              .selectDistinct({ membroId: invites.invitedByMemberId })
              .from(invites)
              .where(
                and(
                  eq(invites.spaceId, ctx.mundo.id),
                  inArray(invites.state, ["sent", "pending_approval"]),
                ),
              )
              .orderBy(invites.invitedByMemberId);
            const dirigidos = await tx
              .selectDistinct({ membroId: directed.invitedByMemberId })
              .from(directed)
              .where(and(eq(directed.spaceId, ctx.mundo.id), eq(directed.state, "pending")));
            for (const membroId of [
              ...new Set([...emissores, ...dirigidos].map((e) => e.membroId)),
            ].sort()) {
              const revogar = await prepararRevogacaoDeConvites(tx, ctx.mundo.id, membroId);
              await revogar(ctx.contaId, "world_archived");
            }
            await revogarPropostasDoMembro(tx, ctx.mundo.id, ctx.proprio.id, ctx.contaId);
          }
        }
      }
      if (!mudou) return { alterou: false, revisao: ctx.mundo.managementRevision };
      const revisao = ctx.mundo.managementRevision + 1;
      await tx
        .update(spaces)
        .set({ managementRevision: revisao, updatedAt: AGORA })
        .where(eq(spaces.id, ctx.mundo.id));
      await logAuditEventStrict(
        "recreio.space_management_changed",
        ctx.contaId,
        {
          app: "recreio",
          spaceId: ctx.mundo.id,
          profileId: autor.perfilId,
          operation: pedido.operacao,
          revision: revisao,
          ...(ctx.porResponsavel ? { actorKind: "responsavel" } : {}),
          ...(pedido.operacao === "coadministracao"
            ? { memberId: pedido.membroId, role: pedido.papel }
            : {}),
          ...(pedido.operacao === "convites" ? { membersInvite: pedido.membrosConvidam } : {}),
        },
        { writer: tx },
      );
      return { alterou: true, revisao };
    },
  );
}
