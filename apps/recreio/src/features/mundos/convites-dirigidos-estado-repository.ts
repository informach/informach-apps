import "server-only";
import { and, eq } from "@informach/db";
import {
  recreioDirectedInviteWorldApprovals as approvals,
  recreioDirectedInviteGuardianApprovals as guardians,
  type recreioDirectedSpaceInvites as invites,
  recreioSpaceMembers as members,
  recreioMinorProtection as protection,
} from "@informach/db/schema";
import { MundoIdSchema } from "@informach/recreio";
import type { ConviteDirigido } from "@informach/recreio/contrato";
import { ComposicaoSocialMudou } from "@/features/social/composicao-repository";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import type { ContextoDeConvite } from "./convites-dirigidos-contexto-repository";

export type ConviteDoMundo = typeof invites.$inferSelect;
type ConviteComRevisoes = Pick<
  ConviteDoMundo,
  | "spaceId"
  | "originProfileId"
  | "targetProfileId"
  | "managementRevision"
  | "friendshipRevision"
  | "originAccessGeneration"
  | "targetAccessGeneration"
  | "originPolicyVersion"
  | "targetPolicyVersion"
>;
export function conferirRevisoesDoConvite(
  ctx: ContextoDeConvite,
  convite: ConviteComRevisoes,
  revisaoDaAmizade: number,
) {
  assertAllowed(
    convite.spaceId === ctx.mundo.id &&
      convite.originProfileId === ctx.origem.fato.id &&
      convite.targetProfileId === ctx.destino.fato.id &&
      convite.managementRevision === ctx.mundo.managementRevision &&
      convite.friendshipRevision === revisaoDaAmizade &&
      convite.originAccessGeneration ===
        (ctx.origem.fato.tipo === "protegido" ? ctx.origem.fato.responsabilidade.geracao : null) &&
      convite.targetAccessGeneration ===
        (ctx.destino.fato.tipo === "protegido"
          ? ctx.destino.fato.responsabilidade.geracao
          : null) &&
      convite.originPolicyVersion ===
        ctx.composicao.perfis.find((p) => p.id === convite.originProfileId)?.policyVersion &&
      convite.targetPolicyVersion ===
        ctx.composicao.perfis.find((p) => p.id === convite.targetProfileId)?.policyVersion,
    "CONFLITO",
    "O convite mudou. Prepare outro com as regras atuais.",
  );
}

export async function aprovacoesDoConvite(
  tx: Transacao,
  ctx: ContextoDeConvite,
  convite: ConviteDoMundo,
) {
  if (convite.state !== "pending") return { mundo: false, origem: false, destino: false };
  const parentais = await tx.select().from(guardians).where(eq(guardians.inviteId, convite.id));
  const parental = (atual: ContextoDeConvite["origem"]) => {
    const fato = atual.fato;
    if (fato.tipo === "adulto") return true;
    const r = parentais.find((p) => p.profileId === fato.id);
    return (
      !!r &&
      r.approvedByUserId === fato.responsabilidade.contaId &&
      r.guardianLinkId === fato.responsabilidade.vinculoId &&
      r.accessGeneration === fato.responsabilidade.geracao &&
      r.policyVersion === ctx.composicao.perfis.find((p) => p.id === fato.id)?.policyVersion
    );
  };
  const [decisao] = await tx
    .select({ membro: members, recibo: approvals })
    .from(approvals)
    .innerJoin(
      members,
      and(eq(members.spaceId, approvals.spaceId), eq(members.id, approvals.approvedByMemberId)),
    )
    .where(eq(approvals.inviteId, convite.id));
  let mundo = false;
  if (
    decisao &&
    decisao.recibo.managementRevision === ctx.mundo.managementRevision &&
    decisao.membro.state !== "former" &&
    decisao.membro.profileId
  ) {
    const perfil = ctx.composicao.perfis.find((p) => p.id === decisao.membro.profileId);
    if (!perfil) throw new ComposicaoSocialMudou();
    const gestor =
      (decisao.membro.role === "steward" && ctx.mundo.stewardProfileId === perfil.id) ||
      (decisao.membro.role === "coadmin" && perfil.kind === "adult");
    const propriaParticipacao =
      decisao.membro.state === "active" &&
      decisao.membro.id === convite.invitedByMemberId &&
      decisao.membro.role === "member" &&
      ctx.mundo.membersInvite === "yes" &&
      decisao.membro.participation !== null &&
      decisao.membro.participation === convite.participation;
    const [protecao] =
      decisao.recibo.actorKind === "responsavel"
        ? await tx.select().from(protection).where(eq(protection.profileId, perfil.id))
        : [];
    const responsavelAtual =
      decisao.recibo.actorKind !== "responsavel" ||
      (perfil.kind === "minor" &&
        decisao.recibo.policyVersion === perfil.policyVersion &&
        protecao?.guardianLinkId === decisao.recibo.guardianLinkId &&
        protecao?.accessGeneration === decisao.recibo.accessGeneration &&
        ctx.composicao.vinculos.some(
          (v) =>
            v.id === decisao.recibo.guardianLinkId &&
            v.profileId === perfil.id &&
            v.guardianUserId === decisao.recibo.approvedByUserId,
        ));
    const contaId =
      perfil.kind === "adult"
        ? perfil.userId
        : ctx.composicao.vinculos.find((v) => v.profileId === perfil.id)?.guardianUserId;
    const conta = ctx.composicao.contas.find((c) => c.id === contaId),
      agora = await ctx.conferirPrazo();
    mundo =
      perfil.status === "active" &&
      (gestor || propriaParticipacao) &&
      responsavelAtual &&
      Boolean(conta?.emailVerified) &&
      !(conta?.banned && (!conta.banExpiresAt || conta.banExpiresAt > agora));
  }
  return { mundo, origem: parental(ctx.origem), destino: parental(ctx.destino) };
}

export function resumoDoConvite(
  convite: ConviteDoMundo,
  jogo: string,
  aprovacao: { mundo: boolean; origem: boolean; destino: boolean },
): ConviteDirigido {
  return {
    conviteId: convite.id,
    mundoId: MundoIdSchema.parse(convite.spaceId),
    jogo,
    estado: convite.state,
    expiraEm: convite.expiresAt.toISOString(),
    aguardaMundo: convite.state === "pending" && !aprovacao.mundo,
    aguardaOrigem: convite.state === "pending" && !aprovacao.origem,
    aguardaDestino: convite.state === "pending" && !aprovacao.destino,
  };
}
