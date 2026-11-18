import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, asc, db, eq, gt, isNull, ne, or, sql } from "@informach/db";
import {
  recreioGameSessions as games,
  recreioStewardshipGuardianApprovals as guardianApprovals,
  recreioSpaceMembers as members,
  recreioProfiles as profiles,
  recreioMinorProtection as protection,
  recreioSpaceStewardshipRequests as requests,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import type { PerfilId } from "@informach/recreio";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { encerrarSessoesAbertas, travarEncerramentos } from "@/features/sessao-de-jogo/repository";
import { assertAllowed } from "@/lib/errors";
import { AGORA, type Transacao } from "@/lib/repository";
import { prepararRevogacaoDeConvites } from "./convites-revogacao-repository";
import {
  comGestaoNativaDoMundo,
  comParticipacaoNativaDoMundo,
  type contextoNativoDoMundo,
} from "./gestao-nativa-repository";
import { type AutorDaResponsabilidade, contextoDaGestao, limitarGestao } from "./gestao-repository";

export type { AutorDaResponsabilidade, LoginDaResponsabilidade } from "./gestao-repository";

const VALIDADE_MS = 24 * 60 * 60_000;
type Pedido = typeof requests.$inferSelect;
type EstadoFinal = Exclude<Pedido["state"], "pending">;

function exigirParticipantes(ctx: Awaited<ReturnType<typeof contextoDaGestao>>) {
  assertAllowed(
    ctx.proprio.state !== "former" && ctx.outro.state !== "former",
    "MUNDO",
    "Participação indisponível.",
  );
  assertAllowed(
    ctx.mundo.estado === "active" || ctx.mundo.estado === "hibernating",
    "MUNDO",
    "Este mundo não está disponível para transferência.",
  );
  assertAllowed(
    ctx.outro.profileId && ctx.outroAdulto,
    "MUNDO",
    "Participação adulta indisponível.",
  );
  return ctx.outro.profileId;
}

async function concluir(
  tx: Transacao,
  pedido: Pedido,
  estado: EstadoFinal,
  agora: Date,
  contaId: string,
  atuacao?: { actorKind: "responsavel" | "jogador"; profileId: string },
) {
  await tx
    .update(requests)
    .set({ state: estado, completedAt: agora })
    .where(eq(requests.id, pedido.id));
  const eventos = {
    accepted: "recreio.space_stewardship_accepted",
    declined: "recreio.space_stewardship_declined",
    revoked: "recreio.space_stewardship_revoked",
    expired: "recreio.space_stewardship_expired",
  } as const;
  await logAuditEventStrict(
    eventos[estado],
    contaId,
    {
      app: "recreio",
      spaceId: pedido.spaceId,
      requestId: pedido.id,
      fromMemberId: pedido.fromMemberId,
      toMemberId: pedido.toMemberId,
      ...atuacao,
    },
    { writer: tx },
  );
  return { pedidoId: pedido.id, estado };
}

export async function proporResponsabilidade(
  autor: AutorDaResponsabilidade,
  mundoId: string,
  destinatarioId: string,
) {
  return db.transaction(async (tx) => {
    await limitarGestao(tx);
    const ctx = await contextoDaGestao(tx, autor, mundoId, destinatarioId);
    exigirParticipantes(ctx);
    assertAllowed(
      ctx.proprio.role === "steward" && ctx.mundo.responsavel === autor.perfilId,
      "RESPONSAVEL",
      "Somente o responsável atual pode propor a transferência.",
    );
    const [pendente] = await tx
      .select()
      .from(requests)
      .where(and(eq(requests.spaceId, mundoId), eq(requests.state, "pending")))
      .for("update");
    const agora = await ctx.conferirPrazo(true);
    if (pendente) {
      if (pendente.expiresAt <= agora)
        await concluir(tx, pendente, "expired", agora, autor.contaId);
      else {
        assertAllowed(
          pendente.fromMemberId === ctx.proprio.id && pendente.toMemberId === ctx.outro.id,
          "PEDIDO_PENDENTE",
          "Cancele a proposta atual antes de escolher outra pessoa.",
        );
        return { pedidoId: pendente.id, estado: pendente.state };
      }
    }
    const [pedido] = await tx
      .insert(requests)
      .values({
        spaceId: mundoId,
        fromMemberId: ctx.proprio.id,
        toMemberId: ctx.outro.id,
        createdAt: agora,
        expiresAt: new Date(agora.getTime() + VALIDADE_MS),
      })
      .returning();
    assertAllowed(pedido, "MUNDO", "Não foi possível preparar a proposta.");
    await logAuditEventStrict(
      "recreio.space_stewardship_requested",
      autor.contaId,
      {
        app: "recreio",
        spaceId: mundoId,
        requestId: pedido.id,
        fromMemberId: ctx.proprio.id,
        toMemberId: ctx.outro.id,
      },
      { writer: tx },
    );
    return { pedidoId: pedido.id, estado: pedido.state };
  });
}

export async function responderResponsabilidade(
  autor: AutorDaResponsabilidade,
  mundoId: string,
  pedidoId: string,
  resposta: "accepted" | "declined" | "revoked",
) {
  const [parental] = await db
    .select({ de: requests.fromMemberId })
    .from(guardianApprovals)
    .innerJoin(requests, eq(requests.id, guardianApprovals.requestId))
    .innerJoin(
      members,
      and(
        eq(members.spaceId, requests.spaceId),
        eq(members.profileId, autor.perfilId),
        eq(members.id, requests.toMemberId),
      ),
    )
    .where(
      and(eq(requests.id, pedidoId), eq(requests.spaceId, mundoId), eq(requests.state, "pending")),
    );
  if (parental && resposta !== "revoked")
    return responderPropostaParental(autor, mundoId, pedidoId, parental.de, resposta);
  return db.transaction(async (tx) => {
    await limitarGestao(tx);
    // Descoberta restrita a um pedido do próprio vínculo; não trava mundos alheios.
    const [antes] = await tx
      .select({ de: requests.fromMemberId, para: requests.toMemberId, proprio: members.id })
      .from(requests)
      .innerJoin(
        members,
        and(eq(members.spaceId, requests.spaceId), eq(members.profileId, autor.perfilId)),
      )
      .where(and(eq(requests.id, pedidoId), eq(requests.spaceId, mundoId)));
    assertAllowed(
      antes && (resposta === "revoked" ? antes.proprio === antes.de : antes.proprio === antes.para),
      "MUNDO",
      "Proposta indisponível.",
    );
    const ctx = await contextoDaGestao(
      tx,
      autor,
      mundoId,
      resposta === "revoked" ? antes.para : antes.de,
    );
    const [pedido] = await tx
      .select()
      .from(requests)
      .where(and(eq(requests.id, pedidoId), eq(requests.spaceId, mundoId)))
      .for("update");
    assertAllowed(
      pedido &&
        pedido.fromMemberId === antes.de &&
        pedido.toMemberId === antes.para &&
        ctx.proprio.id === antes.proprio,
      "MUNDO",
      "Proposta indisponível.",
    );
    if (pedido.state !== "pending") {
      await ctx.conferirPrazo(false);
      return { pedidoId: pedido.id, estado: pedido.state };
    }
    assertAllowed(ctx.proprio.state !== "former", "MUNDO", "Participação indisponível.");
    if (resposta === "accepted") {
      const perfilDoResponsavel = exigirParticipantes(ctx);
      assertAllowed(
        ctx.outro.role === "steward" && ctx.mundo.responsavel === perfilDoResponsavel,
        "RESPONSAVEL",
        "A responsabilidade por este mundo mudou. Confira a proposta atual.",
      );
      const revogarConvites = await prepararRevogacaoDeConvites(tx, mundoId, ctx.outro.id);
      const filtro = sql`${games.spaceId} = ${mundoId} and ${games.profileId} in (${autor.perfilId}, ${perfilDoResponsavel})`;
      await travarEncerramentos(tx);
      await tx
        .select({ id: games.id })
        .from(games)
        .where(and(isNull(games.endedAt), filtro))
        .for("update");
      const agora = await ctx.conferirPrazo(true);
      if (pedido.expiresAt <= agora) return concluir(tx, pedido, "expired", agora, autor.contaId);
      await revogarConvites(autor.contaId, "steward_changed");
      await tx.update(members).set({ role: "member" }).where(eq(members.id, ctx.outro.id));
      await tx.update(members).set({ role: "steward" }).where(eq(members.id, ctx.proprio.id));
      await tx
        .update(spaces)
        .set({
          stewardProfileId: autor.perfilId,
          managementRevision: sql`${spaces.managementRevision} + 1`,
        })
        .where(eq(spaces.id, mundoId));
      await encerrarSessoesAbertas(tx, filtro, "permissions_changed", {
        porQuem: "ator",
        contaId: autor.contaId,
      });
      return concluir(tx, pedido, "accepted", agora, autor.contaId);
    }
    if (resposta === "revoked")
      assertAllowed(
        ctx.proprio.role === "steward" && ctx.mundo.responsavel === autor.perfilId,
        "RESPONSAVEL",
        "Somente o responsável atual pode cancelar a proposta.",
      );
    const agora = await ctx.conferirPrazo(false);
    return concluir(
      tx,
      pedido,
      pedido.expiresAt <= agora ? "expired" : resposta,
      agora,
      autor.contaId,
    );
  });
}

/** Quem sai deixa de poder receber ou manter uma oferta pendente. Requer a trava do mundo. */
export async function revogarPropostasDoMembro(
  tx: Transacao,
  mundoId: string,
  membroId: string,
  contaId: string,
) {
  const pendentes = await tx
    .select()
    .from(requests)
    .where(
      and(
        eq(requests.spaceId, mundoId),
        eq(requests.state, "pending"),
        or(eq(requests.fromMemberId, membroId), eq(requests.toMemberId, membroId)),
      ),
    )
    .orderBy(asc(requests.id))
    .for("update");
  if (pendentes.length === 0) return;
  const [linha] = await tx
    .select({ agora: sql<Date>`${AGORA}`.mapWith(spaces.createdAt) })
    .from(spaces)
    .where(eq(spaces.id, mundoId));
  assertAllowed(linha, "AUTH", "Não foi possível conferir o prazo da proposta.");
  for (const pedido of pendentes)
    await concluir(
      tx,
      pedido,
      pedido.expiresAt <= linha.agora ? "expired" : "revoked",
      linha.agora,
      contaId,
    );
}

type GestaoNativa = Awaited<ReturnType<typeof contextoNativoDoMundo>>;
type AutorParental = { responsavel: AutorNativoRecente; perfilId: PerfilId };

export function lerTransferenciaDoMenor(
  autor: AutorParental,
  mundoId: string,
  apos: string | null,
) {
  return comGestaoNativaDoMundo(
    autor,
    mundoId,
    undefined,
    async (tx, ctx) => {
      assertAllowed(
        ctx.porResponsavel && ctx.responsavel,
        "RESPONSAVEL",
        "A responsabilidade pelo mundo mudou.",
      );
      const candidatos = await tx
        .select({ id: members.id, apelido: profiles.nickname })
        .from(members)
        .innerJoin(profiles, eq(profiles.id, members.profileId))
        .where(
          and(
            eq(members.spaceId, mundoId),
            ne(members.id, ctx.proprio.id),
            ne(members.state, "former"),
            eq(profiles.kind, "adult"),
            eq(profiles.status, "active"),
            apos ? gt(members.id, apos) : undefined,
          ),
        )
        .orderBy(asc(members.id))
        .limit(11);
      const [pedido] = await tx
        .select()
        .from(requests)
        .where(
          and(
            eq(requests.spaceId, mundoId),
            eq(requests.fromMemberId, ctx.proprio.id),
            eq(requests.state, "pending"),
          ),
        )
        .limit(1);
      const [destino] = pedido
        ? await tx
            .select({ apelido: profiles.nickname })
            .from(members)
            .innerJoin(profiles, eq(profiles.id, members.profileId))
            .where(
              and(
                eq(members.spaceId, mundoId),
                eq(members.id, pedido.toMemberId),
                ne(members.state, "former"),
                eq(profiles.kind, "adult"),
                eq(profiles.status, "active"),
              ),
            )
        : [];
      const [prova] = pedido
        ? await tx
            .select()
            .from(guardianApprovals)
            .where(eq(guardianApprovals.requestId, pedido.id))
        : [];
      const atual = pedido ? await provaParentalAtual(tx, ctx, autor.perfilId) : null;
      const agora = await ctx.conferirPrazo(false);
      return {
        mundo: { id: ctx.mundo.id, nome: ctx.mundo.name },
        revisao: ctx.mundo.managementRevision,
        podePropor: ["active", "hibernating"].includes(ctx.mundo.status),
        candidatos: candidatos.slice(0, 10),
        proximo: candidatos.length > 10 ? (candidatos[9]?.id ?? null) : null,
        proposta: pedido
          ? {
              id: pedido.id,
              destinatario: destino?.apelido ?? null,
              expiraEm: pedido.expiresAt.toISOString(),
              vigente: pedido.expiresAt > agora,
              autorizacaoAtual: Boolean(prova && atual && mesmaProva(prova, atual)),
            }
          : null,
      };
    },
    true,
  );
}

/** O vínculo da prova é relido; a linha sozinha nunca comprova cuidado atual. */
async function provaParentalAtual(tx: Transacao, ctx: GestaoNativa, perfilId: string) {
  const perfil = ctx.composicao.perfis.find((p) => p.id === perfilId),
    vinculo = ctx.composicao.vinculos.find((v) => v.profileId === perfilId),
    conta = ctx.composicao.contas.find((c) => c.id === vinculo?.guardianUserId),
    agora = await ctx.conferirPrazo(false);
  const [protecao] = await tx
    .select()
    .from(protection)
    .where(eq(protection.profileId, perfilId))
    .for("share");
  assertAllowed(
    perfil?.kind === "minor" &&
      perfil.status === "active" &&
      vinculo &&
      conta?.emailVerified &&
      !(conta.banned && (!conta.banExpiresAt || conta.banExpiresAt > agora)) &&
      protecao?.guardianLinkId === vinculo.id,
    "RESPONSAVEL",
    "A responsabilidade pelo perfil mudou. Cancele a proposta e confira os cuidados atuais.",
  );
  return {
    profileId: perfil.id,
    guardianLinkId: vinculo.id,
    approvedByUserId: vinculo.guardianUserId,
    accessGeneration: protecao.accessGeneration,
    policyVersion: perfil.policyVersion,
    managementRevision: ctx.mundo.managementRevision,
  };
}
function mesmaProva(
  a: typeof guardianApprovals.$inferSelect,
  b: Awaited<ReturnType<typeof provaParentalAtual>>,
) {
  return (
    a.profileId === b.profileId &&
    a.guardianLinkId === b.guardianLinkId &&
    a.approvedByUserId === b.approvedByUserId &&
    a.accessGeneration === b.accessGeneration &&
    a.policyVersion === b.policyVersion &&
    a.managementRevision === b.managementRevision
  );
}

export function proporResponsabilidadeDoMenor(
  autor: AutorParental,
  mundoId: string,
  destinatarioId: string,
  revisao: number,
) {
  return comGestaoNativaDoMundo(autor, mundoId, destinatarioId, async (tx, ctx) => {
    assertAllowed(
      ctx.porResponsavel &&
        ctx.responsavel &&
        ctx.alvo &&
        ctx.alvo.id !== ctx.proprio.id &&
        ctx.alvo.state !== "former" &&
        ctx.perfilAlvo?.kind === "adult" &&
        ctx.perfilAlvo.status === "active",
      "RESPONSAVEL",
      "Escolha outro participante adulto atual para receber este mundo.",
    );
    assertAllowed(
      ["active", "hibernating"].includes(ctx.mundo.status) &&
        ctx.mundo.managementRevision === revisao,
      "CONFLITO",
      "A gestão mudou. Atualize o mundo antes de preparar a transferência.",
    );
    const prova = await provaParentalAtual(tx, ctx, autor.perfilId);
    assertAllowed(
      prova.approvedByUserId === ctx.contaId,
      "RESPONSAVEL",
      "A responsabilidade pelo perfil mudou.",
    );
    const agora = await ctx.conferirPrazo();
    const [pendente] = await tx
      .select()
      .from(requests)
      .where(and(eq(requests.spaceId, mundoId), eq(requests.state, "pending")))
      .for("update");
    if (pendente) {
      if (pendente.expiresAt <= agora)
        await concluir(tx, pendente, "expired", agora, ctx.contaId, {
          actorKind: "responsavel",
          profileId: autor.perfilId,
        });
      else {
        const [anterior] = await tx
          .select()
          .from(guardianApprovals)
          .where(eq(guardianApprovals.requestId, pendente.id));
        assertAllowed(
          pendente.fromMemberId === ctx.proprio.id &&
            pendente.toMemberId === ctx.alvo.id &&
            anterior &&
            mesmaProva(anterior, prova),
          "PEDIDO_PENDENTE",
          "Cancele a proposta atual antes de preparar outra transferência.",
        );
        return { pedidoId: pendente.id, estado: pendente.state };
      }
    }
    const [pedido] = await tx
      .insert(requests)
      .values({
        spaceId: mundoId,
        fromMemberId: ctx.proprio.id,
        toMemberId: ctx.alvo.id,
        createdAt: agora,
        expiresAt: new Date(agora.getTime() + VALIDADE_MS),
      })
      .returning();
    assertAllowed(pedido, "MUNDO", "Não foi possível preparar a proposta.");
    await tx.insert(guardianApprovals).values({ requestId: pedido.id, ...prova, createdAt: agora });
    await logAuditEventStrict(
      "recreio.space_stewardship_requested",
      ctx.contaId,
      {
        app: "recreio",
        spaceId: mundoId,
        requestId: pedido.id,
        fromMemberId: pedido.fromMemberId,
        toMemberId: pedido.toMemberId,
        actorKind: "responsavel",
        profileId: autor.perfilId,
      },
      { writer: tx },
    );
    await ctx.conferirPrazo();
    return { pedidoId: pedido.id, estado: pedido.state };
  });
}

export async function cancelarResponsabilidadeDoMenor(
  autor: AutorParental,
  mundoId: string,
  pedidoId: string,
) {
  const [pista] = await db
    .select({ destino: requests.toMemberId })
    .from(requests)
    .innerJoin(
      members,
      and(
        eq(members.id, requests.fromMemberId),
        eq(members.spaceId, requests.spaceId),
        eq(members.profileId, autor.perfilId),
      ),
    )
    .where(and(eq(requests.id, pedidoId), eq(requests.spaceId, mundoId)));
  assertAllowed(pista, "MUNDO", "Proposta indisponível.");
  return comGestaoNativaDoMundo(autor, mundoId, pista.destino, async (tx, ctx) => {
    assertAllowed(
      ctx.porResponsavel && ctx.responsavel,
      "RESPONSAVEL",
      "A responsabilidade pelo mundo mudou.",
    );
    const [pedido] = await tx
      .select()
      .from(requests)
      .where(and(eq(requests.id, pedidoId), eq(requests.spaceId, mundoId)))
      .for("update");
    assertAllowed(
      pedido && pedido.fromMemberId === ctx.proprio.id && pedido.toMemberId === ctx.alvo?.id,
      "MUNDO",
      "Proposta indisponível.",
    );
    if (pedido.state !== "pending") return { pedidoId: pedido.id, estado: pedido.state };
    const agora = await ctx.conferirPrazo();
    return concluir(
      tx,
      pedido,
      pedido.expiresAt <= agora ? "expired" : "revoked",
      agora,
      ctx.contaId,
      { actorKind: "responsavel", profileId: autor.perfilId },
    );
  });
}

async function responderPropostaParental(
  autor: AutorDaResponsabilidade,
  mundoId: string,
  pedidoId: string,
  origemId: string,
  resposta: "accepted" | "declined",
) {
  return comParticipacaoNativaDoMundo(
    autor,
    mundoId,
    origemId,
    async (tx, ctx) => {
      const [pedido] = await tx
        .select()
        .from(requests)
        .where(and(eq(requests.id, pedidoId), eq(requests.spaceId, mundoId)))
        .for("update");
      assertAllowed(
        pedido &&
          pedido.fromMemberId === ctx.alvo?.id &&
          pedido.toMemberId === ctx.proprio.id &&
          !ctx.porResponsavel,
        "MUNDO",
        "Proposta indisponível.",
      );
      if (pedido.state !== "pending") return { pedidoId: pedido.id, estado: pedido.state };
      const atuacao = { actorKind: "jogador" as const, profileId: autor.perfilId };
      let agora = await ctx.conferirPrazo(resposta === "accepted");
      if (pedido.expiresAt <= agora)
        return concluir(tx, pedido, "expired", agora, ctx.contaId, atuacao);
      if (resposta === "declined")
        return concluir(tx, pedido, "declined", agora, ctx.contaId, atuacao);
      const origem = ctx.alvo;
      assertAllowed(
        origem?.profileId &&
          origem.state !== "former" &&
          origem.role === "steward" &&
          ctx.mundo.stewardProfileId === origem.profileId &&
          ["active", "hibernating"].includes(ctx.mundo.status),
        "RESPONSAVEL",
        "A responsabilidade pelo mundo mudou. Confira a proposta atual.",
      );
      const [prova] = await tx
        .select()
        .from(guardianApprovals)
        .where(eq(guardianApprovals.requestId, pedido.id))
        .for("share");
      assertAllowed(
        prova && mesmaProva(prova, await provaParentalAtual(tx, ctx, origem.profileId)),
        "CONFLITO",
        "A autorização do responsável mudou. Cancele a proposta e prepare uma nova transferência.",
      );
      assertAllowed(
        ctx.mundo.managementRevision < 2147483646,
        "CONFLITO",
        "Não foi possível atualizar a gestão.",
      );
      const revogar = await prepararRevogacaoDeConvites(tx, mundoId, origem.id),
        filtro = sql`${games.spaceId}=${mundoId} and ${games.profileId} in (${autor.perfilId},${origem.profileId})`;
      await travarEncerramentos(tx);
      await tx
        .select({ id: games.id })
        .from(games)
        .where(and(isNull(games.endedAt), filtro))
        .for("update");
      agora = await ctx.conferirPrazo();
      if (pedido.expiresAt <= agora)
        return concluir(tx, pedido, "expired", agora, ctx.contaId, atuacao);
      await revogar(ctx.contaId, "steward_changed");
      await tx.update(members).set({ role: "member" }).where(eq(members.id, origem.id));
      await tx.update(members).set({ role: "steward" }).where(eq(members.id, ctx.proprio.id));
      await tx
        .update(spaces)
        .set({
          stewardProfileId: autor.perfilId,
          managementRevision: sql`${spaces.managementRevision}+1`,
        })
        .where(eq(spaces.id, mundoId));
      await encerrarSessoesAbertas(tx, filtro, "permissions_changed", {
        porQuem: "ator",
        contaId: ctx.contaId,
      });
      const recibo = await concluir(tx, pedido, "accepted", agora, ctx.contaId, atuacao);
      assertAllowed(
        pedido.expiresAt > (await ctx.conferirPrazo()),
        "CONFLITO",
        "A proposta venceu antes da confirmação.",
      );
      return recibo;
    },
    resposta !== "accepted",
  );
}
