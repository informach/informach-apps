import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, asc, db, eq, inArray, isNull, ne, or, sql } from "@informach/db";
import {
  recreioDeviceSessions as devices,
  recreioGameSessions as games,
  recreioSpaceMembers as members,
  recreioProfiles as profiles,
  recreioSpaceStewardshipRequests as requests,
  recreioSpaces as spaces,
} from "@informach/db/schema";
import { encerrarSessoesAbertas, travarEncerramentos } from "@/features/sessao-de-jogo/repository";
import { assertAllowed } from "@/lib/errors";
import { AGORA, type Transacao } from "@/lib/repository";
import type { AutorDaSaida } from "./saida-repository";

/** Somente o adapter servidor preenche esta prova a partir do Better Auth. */
export type LoginDaResponsabilidade = {
  authSessionId: string;
  criadoEm: Date;
  expiraEm: Date;
};
export type AutorDaResponsabilidade = AutorDaSaida & { login: LoginDaResponsabilidade };
const LOGIN_RECENTE_MS = 10 * 60_000;
const VALIDADE_MS = 24 * 60 * 60_000;
type Pedido = typeof requests.$inferSelect;
type EstadoFinal = Exclude<Pedido["state"], "pending">;

async function limitarTransacao(tx: Transacao) {
  await tx.execute(sql`set local statement_timeout = '5s'`);
  await tx.execute(sql`set local lock_timeout = '1s'`);
  await tx.execute(sql`set local transaction_timeout = '15s'`);
}

/** A prova não é um campo HTTP; seu ID deve coincidir com o login do aparelho travado. */
async function contexto(
  tx: Transacao,
  autor: AutorDaResponsabilidade,
  mundoId: string,
  outroMembroId: string,
) {
  const [vinculo] = await tx
    .select({ id: members.id })
    .from(members)
    .where(and(eq(members.spaceId, mundoId), eq(members.profileId, autor.perfilId)));
  assertAllowed(vinculo, "MUNDO", "Mundo indisponível.");
  // Descobrir apenas o vínculo necessário; a autoridade será relida sob as travas.
  const [outroAntes] = await tx
    .select({ perfilId: members.profileId })
    .from(members)
    .where(and(eq(members.id, outroMembroId), eq(members.spaceId, mundoId)));
  assertAllowed(outroAntes?.perfilId, "MUNDO", "Participação indisponível.");
  const perfis = await tx
    .select({
      id: profiles.id,
      contaId: profiles.userId,
      tipo: profiles.kind,
      estado: profiles.status,
    })
    .from(profiles)
    .where(inArray(profiles.id, [autor.perfilId, outroAntes.perfilId]))
    .orderBy(asc(profiles.id))
    .for("share");
  const perfil = perfis.find((item) => item.id === autor.perfilId);
  assertAllowed(
    perfil?.contaId === autor.contaId && perfil.tipo === "adult" && perfil.estado === "active",
    "AUTH",
    "Entre no seu perfil adulto para continuar.",
  );
  const outroPerfil = perfis.find((item) => item.id === outroAntes.perfilId);
  assertAllowed(
    outroPerfil?.tipo === "adult" && outroPerfil.estado === "active",
    "MUNDO",
    "Participação adulta indisponível.",
  );
  const [aparelho] = await tx
    .select({ id: devices.id, authSessionId: devices.authSessionId, expiraEm: devices.expiresAt })
    .from(devices)
    .where(
      and(
        eq(devices.id, autor.sessaoDeAparelhoId),
        eq(devices.userId, autor.contaId),
        eq(devices.activeProfileId, autor.perfilId),
        eq(devices.kind, "account"),
        isNull(devices.revokedAt),
      ),
    )
    .for("share");
  assertAllowed(aparelho, "AUTH", "Entre novamente para continuar.");
  const [mundo] = await tx
    .select({ id: spaces.id, responsavel: spaces.stewardProfileId, estado: spaces.status })
    .from(spaces)
    .where(and(eq(spaces.id, mundoId), ne(spaces.status, "deleted")))
    .for("update");
  assertAllowed(mundo, "MUNDO", "Mundo indisponível.");
  const vinculos = await tx
    .select()
    .from(members)
    .where(and(eq(members.spaceId, mundo.id), inArray(members.id, [vinculo.id, outroMembroId])))
    .orderBy(asc(members.id))
    .for("update");
  const proprio = vinculos.find((item) => item.id === vinculo.id);
  const outro = vinculos.find((item) => item.id === outroMembroId);
  assertAllowed(proprio?.profileId === perfil.id, "MUNDO", "Participação indisponível.");
  assertAllowed(
    outro?.profileId === outroPerfil.id && outro.id !== proprio.id,
    "MUNDO",
    "Participação indisponível.",
  );
  async function conferirPrazo(recente: boolean) {
    const [linha] = await tx
      .select({ agora: sql<Date>`${AGORA}`.mapWith(spaces.createdAt) })
      .from(spaces)
      .where(eq(spaces.id, mundoId));
    assertAllowed(linha, "AUTH", "Entre novamente para continuar.");
    const agora = linha.agora;
    assertAllowed(
      aparelho.authSessionId === autor.login.authSessionId &&
        aparelho.expiraEm > agora &&
        autor.login.expiraEm > agora,
      "AUTH",
      "Entre novamente para continuar.",
    );
    if (recente)
      assertAllowed(
        Number.isFinite(autor.login.criadoEm.getTime()) &&
          autor.login.criadoEm <= agora &&
          agora.getTime() - autor.login.criadoEm.getTime() < LOGIN_RECENTE_MS,
        "LOGIN_RECENTE",
        "Entre novamente para confirmar esta mudança de responsabilidade.",
      );
    return agora;
  }
  await conferirPrazo(false);
  return { mundo, proprio, outro, conferirPrazo };
}

function exigirParticipantes(ctx: Awaited<ReturnType<typeof contexto>>) {
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
    await limitarTransacao(tx);
    const ctx = await contexto(tx, autor, mundoId, destinatarioId);
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
    await limitarTransacao(tx);
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
    const ctx = await contexto(tx, autor, mundoId, resposta === "revoked" ? antes.para : antes.de);
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
    exigirParticipantes(ctx);
    const responsavel = resposta === "revoked" ? ctx.proprio : ctx.outro;
    assertAllowed(
      responsavel.role === "steward" && ctx.mundo.responsavel === responsavel.profileId,
      "RESPONSAVEL",
      "A responsabilidade por este mundo mudou. Confira a proposta atual.",
    );
    if (resposta === "accepted") {
      const filtro = sql`${games.spaceId} = ${mundoId} and ${games.profileId} in (${autor.perfilId}, ${ctx.outro.profileId})`;
      await travarEncerramentos(tx);
      await tx
        .select({ id: games.id })
        .from(games)
        .where(and(isNull(games.endedAt), filtro))
        .for("update");
      const agora = await ctx.conferirPrazo(true);
      if (pedido.expiresAt <= agora) return concluir(tx, pedido, "expired", agora, autor.contaId);
      await tx.update(members).set({ role: "member" }).where(eq(members.id, ctx.outro.id));
      await tx.update(members).set({ role: "steward" }).where(eq(members.id, ctx.proprio.id));
      await tx
        .update(spaces)
        .set({ stewardProfileId: autor.perfilId })
        .where(eq(spaces.id, mundoId));
      await encerrarSessoesAbertas(tx, filtro, "permissions_changed", { porQuem: "conta" });
      return concluir(tx, pedido, "accepted", agora, autor.contaId);
    }
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
