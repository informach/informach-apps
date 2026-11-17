import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, eq, or, sql } from "@informach/db";
import {
  recreioFriendships as friends,
  recreioGameSessions as games,
  recreioSpaceInvites as invites,
  recreioSpaceMembers as members,
  recreioProfiles as profiles,
  recreioMinorProtection as protection,
  type recreioSafetyReports as reports,
  recreioFriendRequests as requests,
} from "@informach/db/schema";
import { ContaIdSchema, PerfilIdSchema } from "@informach/recreio";
import type { ComandoDeModeracao } from "@informach/recreio/contrato";
import { revogarAparelhosDoMenorSobTrava } from "@/features/protecao/repository";
import { encerrarSessoesAbertas } from "@/features/sessao-de-jogo/encerramento-repository";
import { invalidarIngressosDoPerfil } from "@/features/sessao-de-jogo/ingressos-repository";
import { parSocial } from "@/features/social/amizade-repository";
import type { ComposicaoSocial } from "@/features/social/composicao-repository";
import { removerContatoSobTrava } from "@/features/social/protecao-repository";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";

type Caso = typeof reports.$inferSelect;

/** Todas as pontas já estão admitidas: contas → mundo (se houver) → perfis → caso. */
export async function aplicarEfeitoDeModeracao(
  tx: Transacao,
  comando: ComandoDeModeracao,
  caso: Caso,
  composicao: ComposicaoSocial,
  contaId: string,
  conferirPrazo: () => Promise<Date>,
  mundoId: string | null,
) {
  if (comando.operacao === "analisar") {
    assertAllowed(
      caso.state === "aberta" || caso.state === "recurso",
      "CONFLITO",
      "O caso mudou. Reabra a fila.",
    );
    return { estado: "em_analise" as const, decisao: caso.decision };
  }
  if (comando.operacao === "concluir") {
    assertAllowed(
      caso.state === "em_analise",
      "CONFLITO",
      "O caso precisa estar em análise antes da conclusão.",
    );
    return { estado: "resolvida" as const, decisao: comando.decisao };
  }
  assertAllowed(
    caso.state === "aberta" || caso.state === "em_analise" || caso.state === "recurso",
    "CONFLITO",
    "O caso não está aberto para esta ação.",
  );
  if (comando.operacao === "suspender_perfil" || comando.operacao === "reativar_perfil") {
    assertAllowed(
      caso.targetProfileId === comando.perfilId,
      "CONFLITO",
      "O perfil não corresponde ao alvo confirmado deste caso.",
    );
    const perfil = composicao.perfis.find((p) => p.id === comando.perfilId);
    const estado = comando.operacao === "suspender_perfil" ? "suspended" : "active";
    assertAllowed(
      perfil && perfil.policyVersion === comando.versaoDoPerfil && perfil.status !== estado,
      "CONFLITO",
      "O perfil mudou. Confira a situação atual antes de agir.",
    );
    assertAllowed(
      (estado === "suspended" &&
        ["risco_confirmado", "medida_preventiva"].includes(comando.motivo)) ||
        (estado === "active" &&
          ["recurso_procedente", "correcao_operacional"].includes(comando.motivo)),
      "CONFLITO",
      "O motivo não corresponde à ação.",
    );
    const perfilId = PerfilIdSchema.parse(perfil.id),
      agora = await conferirPrazo();
    if (perfil.kind === "minor" && estado === "suspended") {
      const [atual] = await tx
        .select({ vinculoId: protection.guardianLinkId })
        .from(protection)
        .where(eq(protection.profileId, perfilId))
        .for("update");
      assertAllowed(
        atual &&
          composicao.vinculos.some((v) => v.profileId === perfilId && v.id === atual.vinculoId),
        "CONFLITO",
        "A responsabilidade mudou. Confira o caso novamente.",
      );
      await revogarAparelhosDoMenorSobTrava(tx, perfilId, agora);
    }
    await tx
      .update(profiles)
      .set({ status: estado, policyVersion: perfil.policyVersion + 1, updatedAt: agora })
      .where(eq(profiles.id, perfilId));
    await invalidarIngressosDoPerfil(tx, perfilId);
    await encerrarSessoesAbertas(tx, sql`${games.profileId}=${perfilId}`, "permissions_changed", {
      porQuem: "ator",
      contaId: ContaIdSchema.parse(contaId),
    });
    return { estado: "em_analise" as const, decisao: caso.decision };
  }
  if (comando.operacao === "desfazer_amizade") {
    assertAllowed(
      caso.reporterProfileId && caso.targetProfileId,
      "CONFLITO",
      "As referências do contato não estão mais disponíveis.",
    );
    const a = PerfilIdSchema.parse(caso.reporterProfileId),
      b = PerfilIdSchema.parse(caso.targetProfileId),
      [menor, maior] = parSocial(a, b);
    const [amizade] = await tx
      .select({ revisao: friends.revision, estado: friends.state })
      .from(friends)
      .where(and(eq(friends.lowerProfileId, menor), eq(friends.higherProfileId, maior)))
      .for("update");
    assertAllowed(
      amizade?.estado === "active" && amizade.revisao === comando.revisaoDaAmizade,
      "CONFLITO",
      "A amizade mudou. Confira a situação atual antes de agir.",
    );
    await removerContatoSobTrava(tx, { perfilId: a, alvoId: b, contaId, conferirPrazo });
    const pendentes = await tx
      .update(requests)
      .set({ state: "revoked", finishedAt: await conferirPrazo() })
      .where(
        and(
          eq(requests.state, "pending"),
          or(
            and(eq(requests.originProfileId, a), eq(requests.targetProfileId, b)),
            and(eq(requests.originProfileId, b), eq(requests.targetProfileId, a)),
          ),
        ),
      )
      .returning({ id: requests.id });
    for (const pedido of pendentes)
      await logAuditEventStrict(
        "recreio.friend_request_revoked",
        contaId,
        { app: "recreio", profileId: a, requestId: pedido.id },
        { writer: tx },
      );
    return { estado: "em_analise" as const, decisao: caso.decision };
  }
  const [convite] = await tx
    .select({
      id: invites.id,
      estado: invites.state,
      mundoId: invites.spaceId,
      remetenteId: invites.invitedByMemberId,
      destinatarioId: invites.targetProfileId,
    })
    .from(invites)
    .where(eq(invites.id, comando.conviteId))
    .for("update");
  assertAllowed(
    convite && convite.mundoId === mundoId && ["pending_approval", "sent"].includes(convite.estado),
    "CONFLITO",
    "O convite mudou ou já foi utilizado.",
  );
  const [remetente] = await tx
    .select({ perfilId: members.profileId })
    .from(members)
    .where(and(eq(members.id, convite.remetenteId), eq(members.spaceId, convite.mundoId)))
    .for("share");
  assertAllowed(
    caso.targetProfileId &&
      remetente?.perfilId === caso.targetProfileId &&
      (convite.destinatarioId === null || convite.destinatarioId === caso.reporterProfileId),
    "CONFLITO",
    "O convite não corresponde às pontas deste caso.",
  );
  await tx.update(invites).set({ state: "revoked" }).where(eq(invites.id, convite.id));
  return { estado: "em_analise" as const, decisao: caso.decision };
}
