import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, eq } from "@informach/db";
import {
  recreioVisitInviteWorldApprovals as approvals,
  recreioVisitInviteGuardianApprovals as guardians,
} from "@informach/db/schema";
import type { PerfilId } from "@informach/recreio";
import type {
  AprovacaoDoMundoParaVisita,
  AprovacaoParentalDeVisita,
} from "@informach/recreio/contrato";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import {
  amizadeAtualDoConvite,
  conferirConteudoDoConvite,
} from "@/features/mundos/convites-dirigidos-amizade-repository";
import { conferirRevisoesDoConvite } from "@/features/mundos/convites-dirigidos-estado-repository";
import { assertAllowed } from "@/lib/errors";
import { comDecisorEAnfitriaoNaVisita } from "./contexto-nativo-repository";

export function aprovarVisitaPeloResponsavel(
  autor: AutorNativoRecente,
  pedido: AprovacaoParentalDeVisita,
) {
  return comDecisorEAnfitriaoNaVisita(
    autor,
    pedido.conviteId,
    { tipo: "responsavel", perfilId: pedido.perfilId },
    async (tx, ctx, convite, decisor, anfitriao) => {
      const amizade = await amizadeAtualDoConvite(tx, ctx);
      conferirRevisoesDoConvite(ctx, convite, amizade.revision);
      await conferirConteudoDoConvite(tx, ctx);
      assertAllowed(
        convite.state === "pending" && convite.expiresAt > (await anfitriao.conferirPrazo()),
        "PEDIDO",
        "O convite não está mais disponível.",
      );
      const fato = decisor.perfil.fato,
        perfil = ctx.composicao.perfis.find((p) => p.id === pedido.perfilId);
      assertAllowed(
        fato.tipo === "protegido" &&
          perfil?.policyVersion === pedido.versaoDaPolitica &&
          fato.responsabilidade.contaId === autor.contaId,
        "CONFLITO",
        "As regras mudaram. Confira o convite antes de decidir.",
      );
      const dados = {
          inviteId: convite.id,
          originProfileId: convite.originProfileId,
          targetProfileId: convite.targetProfileId,
          profileId: pedido.perfilId,
          guardianLinkId: fato.responsabilidade.vinculoId,
          approvedByUserId: autor.contaId,
          accessGeneration: fato.responsabilidade.geracao,
          policyVersion: perfil.policyVersion,
        },
        [anterior] = await tx
          .select()
          .from(guardians)
          .where(and(eq(guardians.inviteId, convite.id), eq(guardians.profileId, pedido.perfilId)));
      if (anterior)
        assertAllowed(
          anterior.approvedByUserId === dados.approvedByUserId &&
            anterior.guardianLinkId === dados.guardianLinkId &&
            anterior.accessGeneration === dados.accessGeneration &&
            anterior.policyVersion === dados.policyVersion,
          "CONFLITO",
          "Esta aprovação mudou. Prepare outro convite.",
        );
      else {
        await tx.insert(guardians).values({ ...dados, createdAt: await anfitriao.conferirPrazo() });
        await logAuditEventStrict(
          "recreio.visit_invite_guardian_approved",
          autor.contaId,
          {
            app: "recreio",
            spaceId: ctx.mundo.id,
            inviteId: convite.id,
            profileId: pedido.perfilId,
            policyVersion: perfil.policyVersion,
          },
          { writer: tx },
        );
      }
      assertAllowed(
        convite.expiresAt > (await anfitriao.conferirPrazo()),
        "PEDIDO",
        "O convite venceu.",
      );
      return { confirmado: true as const };
    },
  );
}

export function aprovarVisitaPeloMundo(
  autor: AutorNativoRecente,
  perfilId: PerfilId,
  pedido: AprovacaoDoMundoParaVisita,
) {
  return comDecisorEAnfitriaoNaVisita(
    autor,
    pedido.conviteId,
    { tipo: "mundo", perfilId },
    async (tx, ctx, convite, decisor, anfitriao) => {
      const amizade = await amizadeAtualDoConvite(tx, ctx);
      conferirRevisoesDoConvite(ctx, convite, amizade.revision);
      await conferirConteudoDoConvite(tx, ctx);
      assertAllowed(
        decisor.membro &&
          ctx.mundo.managementRevision === pedido.versaoDaGestao &&
          convite.state === "pending" &&
          convite.expiresAt > (await anfitriao.conferirPrazo()),
        "CONFLITO",
        "O convite mudou. Confira novamente antes de decidir.",
      );
      const fato = decisor.perfil.fato,
        perfil = ctx.composicao.perfis.find((p) => p.id === perfilId);
      assertAllowed(
        perfil && (!decisor.porResponsavel || fato.tipo === "protegido"),
        "PEDIDO",
        "Esta decisão não está disponível.",
      );
      const dados = {
          inviteId: convite.id,
          spaceId: ctx.mundo.id,
          approvedByMemberId: decisor.membro.id,
          approvedByUserId: autor.contaId,
          actorKind: decisor.porResponsavel ? ("responsavel" as const) : ("jogador" as const),
          managementRevision: ctx.mundo.managementRevision,
          guardianLinkId:
            decisor.porResponsavel && fato.tipo === "protegido"
              ? fato.responsabilidade.vinculoId
              : null,
          accessGeneration:
            decisor.porResponsavel && fato.tipo === "protegido"
              ? fato.responsabilidade.geracao
              : null,
          policyVersion: decisor.porResponsavel ? perfil.policyVersion : null,
        },
        [anterior] = await tx.select().from(approvals).where(eq(approvals.inviteId, convite.id));
      if (anterior)
        assertAllowed(
          anterior.approvedByMemberId === dados.approvedByMemberId &&
            anterior.managementRevision === dados.managementRevision &&
            anterior.actorKind === dados.actorKind &&
            anterior.approvedByUserId === dados.approvedByUserId &&
            anterior.guardianLinkId === dados.guardianLinkId &&
            anterior.accessGeneration === dados.accessGeneration &&
            anterior.policyVersion === dados.policyVersion,
          "CONFLITO",
          "Este convite já tem outra decisão. Confira o recibo.",
        );
      else {
        await tx.insert(approvals).values({ ...dados, createdAt: await anfitriao.conferirPrazo() });
        await logAuditEventStrict(
          "recreio.visit_invite_world_approved",
          autor.contaId,
          {
            app: "recreio",
            spaceId: ctx.mundo.id,
            inviteId: convite.id,
            memberId: decisor.membro.id,
            actorKind: dados.actorKind,
            managementRevision: dados.managementRevision,
          },
          { writer: tx },
        );
      }
      assertAllowed(
        convite.expiresAt > (await anfitriao.conferirPrazo()),
        "PEDIDO",
        "O convite venceu.",
      );
      return { confirmado: true as const };
    },
  );
}
