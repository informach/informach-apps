import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, asc, db, eq, isNull, or, sql } from "@informach/db";
import {
  recreioGameSessions as games,
  recreioSpaceMembers as members,
  recreioSpaceStewardshipRequests as requests,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import { encerrarSessoesAbertas, travarEncerramentos } from "@/features/sessao-de-jogo/repository";
import { assertAllowed } from "@/lib/errors";
import { AGORA, type Transacao } from "@/lib/repository";
import { prepararRevogacaoDeConvites } from "./convites-revogacao-repository";
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
