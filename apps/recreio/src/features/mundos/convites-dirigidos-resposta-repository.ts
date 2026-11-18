import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, db, eq } from "@informach/db";
import {
  recreioDirectedSpaceInvites as invites,
  recreioSpaceMembers as members,
} from "@informach/db/schema";
import { ErroDoRecreio, MundoIdSchema, PerfilIdSchema, podeConvidar } from "@informach/recreio";
import type { AutorDeMundos } from "@/features/autoridade-de-jogo/mundos-repository";
import { comConsultaSocialNoMundo } from "@/features/social/autoridade-repository";
import { assertAllowed } from "@/lib/errors";
import {
  amizadeAtualDoConvite,
  conferirConteudoDoConvite,
} from "./convites-dirigidos-amizade-repository";
import {
  comJogadorNoConvite,
  travarMundoDoConvite,
} from "./convites-dirigidos-contexto-repository";
import {
  aprovacoesDoConvite,
  conferirRevisoesDoConvite,
  resumoDoConvite,
} from "./convites-dirigidos-estado-repository";

async function pistaDaParte(autor: AutorDeMundos, conviteId: string, parte: "origem" | "destino") {
  const [pista] = await db
    .select()
    .from(invites)
    .where(
      and(
        eq(invites.id, conviteId),
        eq(parte === "origem" ? invites.originProfileId : invites.targetProfileId, autor.perfilId),
      ),
    );
  assertAllowed(pista, "PEDIDO", "Convite não disponível.");
  return {
    mundoId: MundoIdSchema.parse(pista.spaceId),
    origemId: PerfilIdSchema.parse(pista.originProfileId),
    destinoId: PerfilIdSchema.parse(pista.targetProfileId),
    conviteId,
  };
}

export async function aceitarConviteDirigidoNoBanco(autor: AutorDeMundos, conviteId: string) {
  const pontas = await pistaDaParte(autor, conviteId, "destino");
  return comJogadorNoConvite(autor, pontas, async (tx, ctx) => {
    const [convite] = await tx
      .select()
      .from(invites)
      .where(eq(invites.id, conviteId))
      .for("update");
    assertAllowed(
      convite?.targetProfileId === autor.perfilId &&
        convite.spaceId === ctx.mundo.id &&
        convite.originProfileId === pontas.origemId &&
        convite.retainUntil > (await ctx.conferirPrazo()),
      "PEDIDO",
      "Convite não disponível.",
    );
    // Replay mostra o fato anterior; nunca cria nem restaura participação após uma saída.
    if (convite.state === "accepted")
      return resumoDoConvite(convite, ctx.mundo.gameId, {
        mundo: true,
        origem: true,
        destino: true,
      });
    assertAllowed(
      convite.state === "pending" &&
        convite.expiresAt > (await ctx.conferirPrazo()) &&
        (ctx.mundo.status === "active" || ctx.mundo.status === "hibernating"),
      "PEDIDO",
      "O convite não está mais disponível.",
    );
    const amizade = await amizadeAtualDoConvite(tx, ctx);
    conferirRevisoesDoConvite(ctx, convite, amizade.revision);
    const [emissor] = await tx
      .select()
      .from(members)
      .where(
        and(
          eq(members.id, convite.invitedByMemberId),
          eq(members.spaceId, ctx.mundo.id),
          eq(members.profileId, pontas.origemId),
        ),
      );
    assertAllowed(
      emissor?.state === "active" &&
        podeConvidar(emissor.role, ctx.mundo.membersInvite).pode &&
        (emissor.role !== "coadmin" || ctx.origem.fato.tipo === "adulto") &&
        (emissor.role !== "steward" || ctx.mundo.stewardProfileId === emissor.profileId),
      "PEDIDO",
      "O emissor não pode mais convidar para este mundo.",
    );
    const aprovacao = await aprovacoesDoConvite(tx, ctx, convite);
    assertAllowed(
      aprovacao.mundo && aprovacao.origem && aprovacao.destino,
      "CONFLITO",
      "O convite ainda precisa das aprovações indicadas.",
    );
    const { manifesto, membros: total } = await conferirConteudoDoConvite(tx, ctx);
    if (total >= (manifesto.capacidades.mundos?.membrosMax ?? 0))
      throw new ErroDoRecreio("MUNDO_CHEIO");
    const [existente] = await tx
      .select()
      .from(members)
      .where(and(eq(members.spaceId, ctx.mundo.id), eq(members.profileId, autor.perfilId)))
      .for("update");
    assertAllowed(
      !existente ||
        (existente.state === "former" &&
          existente.leftAt !== null &&
          existente.leftAt < convite.createdAt),
      "PEDIDO",
      "Já existe uma participação ou este convite é anterior à saída.",
    );
    const agora = await ctx.conferirPrazo();
    const dados = {
      role: "member" as const,
      state: "active" as const,
      participation: convite.participation,
      invitedByMemberId: convite.invitedByMemberId,
      joinedAt: agora,
      leftAt: null,
    };
    const [membro] = existente
      ? await tx
          .update(members)
          .set(dados)
          .where(eq(members.id, existente.id))
          .returning({ id: members.id })
      : await tx
          .insert(members)
          .values({ spaceId: ctx.mundo.id, profileId: autor.perfilId, ...dados })
          .returning({ id: members.id });
    assertAllowed(membro, "CONFLITO", "Não foi possível confirmar a participação.");
    const [aceito] = await tx
      .update(invites)
      .set({ state: "accepted", finishedAt: agora })
      .where(eq(invites.id, convite.id))
      .returning();
    assertAllowed(aceito, "CONFLITO", "Não foi possível confirmar o convite.");
    await logAuditEventStrict(
      "recreio.space_invite_accepted",
      ctx.contaId,
      {
        app: "recreio",
        spaceId: ctx.mundo.id,
        inviteId: convite.id,
        profileId: autor.perfilId,
        memberId: membro.id,
        directed: true,
      },
      { writer: tx },
    );
    await logAuditEventStrict(
      "recreio.space_member_joined",
      ctx.contaId,
      {
        app: "recreio",
        spaceId: ctx.mundo.id,
        memberId: membro.id,
        profileId: autor.perfilId,
        role: "member",
        invitedByMemberId: convite.invitedByMemberId,
      },
      { writer: tx },
    );
    assertAllowed(
      convite.expiresAt > (await ctx.conferirPrazo()),
      "PEDIDO",
      "O convite venceu antes da confirmação.",
    );
    return resumoDoConvite(aceito, ctx.mundo.gameId, aprovacao);
  });
}

/** Reduzir acesso permanece disponível sem assinatura e com contatos novos desligados. */
export async function encerrarConviteDirigidoNoBanco(
  autor: AutorDeMundos,
  conviteId: string,
  acao: "recusar" | "revogar",
) {
  const pontas = await pistaDaParte(autor, conviteId, acao === "revogar" ? "origem" : "destino");
  let jogo: string | undefined;
  return comConsultaSocialNoMundo(
    autor,
    async (tx) => {
      jogo = (await travarMundoDoConvite(tx, pontas)).gameId;
    },
    async (tx, atual) => {
      const [convite] = await tx
        .select()
        .from(invites)
        .where(eq(invites.id, conviteId))
        .for("update");
      assertAllowed(
        convite &&
          convite.spaceId === pontas.mundoId &&
          convite.originProfileId === pontas.origemId &&
          convite.targetProfileId === pontas.destinoId &&
          convite.retainUntil > (await atual.conferirPrazo()),
        "PEDIDO",
        "Convite não disponível.",
      );
      assertAllowed(
        jogo && (!("sid" in autor) || autor.jogo === jogo),
        "PEDIDO",
        "Convite não disponível.",
      );
      if (convite.state !== "pending")
        return resumoDoConvite(convite, jogo, { mundo: false, origem: false, destino: false });
      const agora = await atual.conferirPrazo(),
        state =
          convite.expiresAt <= agora
            ? ("expired" as const)
            : acao === "revogar"
              ? ("revoked" as const)
              : ("declined" as const);
      const [encerrado] = await tx
        .update(invites)
        .set({ state, finishedAt: agora })
        .where(eq(invites.id, conviteId))
        .returning();
      assertAllowed(encerrado, "CONFLITO", "Não foi possível confirmar o encerramento.");
      await logAuditEventStrict(
        "recreio.directed_invite_closed",
        atual.contaId,
        { app: "recreio", spaceId: pontas.mundoId, inviteId: conviteId, state },
        { writer: tx },
      );
      return resumoDoConvite(encerrado, jogo, { mundo: false, origem: false, destino: false });
    },
  );
}
