import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, db, eq, or } from "@informach/db";
import {
  recreioSpaceVisitInvites as invites,
  recreioSpaces as spaces,
  recreioWorldVisits as visits,
} from "@informach/db/schema";
import type { PerfilId } from "@informach/recreio";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import type { AutorDeMundos } from "@/features/autoridade-de-jogo/mundos-repository";
import { comConsultaSocialNoMundo } from "@/features/social/autoridade-repository";
import { comResponsavelSocialNativo } from "@/features/social/responsavel-contexto-repository";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import { type ConviteDeVisita, decisaoDaVisitaSobTrava } from "./resposta-repository";

type Redutor = { perfilId: PerfilId; contaId: string | null; tipo: "jogador" | "responsavel" };
async function travarMundoDoRecibo(tx: Transacao, pista: ConviteDeVisita, jogo?: string) {
  // Redução própria continua possível depois de arquivo/exclusão lógica do mundo.
  const [mundo] = await tx
    .select({ id: spaces.id })
    .from(spaces)
    .where(
      and(eq(spaces.id, pista.spaceId), jogo === undefined ? undefined : eq(spaces.gameId, jogo)),
    )
    .for("update");
  assertAllowed(mundo, "PEDIDO", "Convite não disponível.");
}
async function reduzirSobTrava(
  tx: Transacao,
  ator: Redutor,
  pista: ConviteDeVisita,
  conferirPrazo: () => Promise<Date>,
) {
  const [convite] = await tx
    .select()
    .from(invites)
    .where(
      and(
        eq(invites.id, pista.id),
        eq(invites.spaceId, pista.spaceId),
        eq(invites.originProfileId, pista.originProfileId),
        eq(invites.targetProfileId, pista.targetProfileId),
      ),
    )
    .for("update");
  assertAllowed(
    convite &&
      (convite.originProfileId === ator.perfilId || convite.targetProfileId === ator.perfilId) &&
      convite.retainUntil > (await conferirPrazo()),
    "PEDIDO",
    "Convite não disponível.",
  );
  const [mundo] = await tx
    .select({ jogo: spaces.gameId })
    .from(spaces)
    .where(eq(spaces.id, convite.spaceId));
  if (!mundo) throw new Error("Recibo de visita sem mundo correspondente.");
  const origem = convite.originProfileId === ator.perfilId,
    agora = await conferirPrazo();
  let atual = convite;
  if (convite.state === "pending") {
    const estado =
        convite.expiresAt <= agora
          ? ("expired" as const)
          : origem
            ? ("revoked" as const)
            : ("declined" as const),
      [fechado] = await tx
        .update(invites)
        .set({ state: estado, finishedAt: agora })
        .where(eq(invites.id, convite.id))
        .returning();
    assertAllowed(fechado, "CONFLITO", "O convite mudou antes da confirmação.");
    atual = fechado;
    await logAuditEventStrict(
      "recreio.visit_invite_closed",
      estado === "expired" ? null : ator.contaId,
      {
        app: "recreio",
        spaceId: convite.spaceId,
        inviteId: convite.id,
        state: estado,
        actorProfileId: ator.perfilId,
        actorKind: ator.tipo,
      },
      { writer: tx },
    );
  } else if (convite.state === "accepted") {
    const [visita] = await tx
      .select()
      .from(visits)
      .where(eq(visits.inviteId, convite.id))
      .for("update");
    if (!visita) throw new Error("Convite de visita aceito sem concessão correspondente.");
    if (visita.endedAt === null) {
      const expirada = visita.expiresAt <= agora,
        motivo = expirada
          ? ("expired" as const)
          : origem
            ? ("revoked" as const)
            : ("left" as const);
      await tx
        .update(visits)
        .set({
          state: expirada ? "expired" : "revoked",
          endedAt: agora,
          updatedAt: agora,
          endReason: motivo,
        })
        .where(eq(visits.id, visita.id));
      await logAuditEventStrict(
        "recreio.visit_closed",
        expirada ? null : ator.contaId,
        {
          app: "recreio",
          spaceId: convite.spaceId,
          inviteId: convite.id,
          visitId: visita.id,
          profileId: visita.visitorProfileId,
          reason: motivo,
          actorProfileId: ator.perfilId,
          actorKind: ator.tipo,
        },
        { writer: tx },
      );
    }
  }
  await conferirPrazo();
  return decisaoDaVisitaSobTrava(tx, atual, mundo.jogo);
}

/** Uma ponta pode reduzir só a própria relação, sem exigir plano, amizade ou presença da outra. */
export async function encerrarConviteDeVisitaNoBanco(
  autor: AutorDeMundos,
  conviteId: string,
  acao: "recusar" | "revogar",
) {
  const [pista] = await db
    .select()
    .from(invites)
    .where(
      and(
        eq(invites.id, conviteId),
        eq(acao === "revogar" ? invites.originProfileId : invites.targetProfileId, autor.perfilId),
      ),
    );
  assertAllowed(pista, "PEDIDO", "Convite não disponível.");
  return comConsultaSocialNoMundo(
    autor,
    (tx) => travarMundoDoRecibo(tx, pista, "sid" in autor ? autor.jogo : undefined),
    (tx, ctx) =>
      reduzirSobTrava(
        tx,
        { perfilId: autor.perfilId, contaId: ctx.contaId, tipo: "jogador" },
        pista,
        ctx.conferirPrazo,
      ),
  );
}

export async function encerrarVisitaPeloResponsavel(
  autor: AutorNativoRecente,
  perfilId: PerfilId,
  conviteId: string,
) {
  const [pista] = await db
    .select()
    .from(invites)
    .where(
      and(
        eq(invites.id, conviteId),
        or(eq(invites.originProfileId, perfilId), eq(invites.targetProfileId, perfilId)),
      ),
    );
  assertAllowed(pista, "PEDIDO", "Convite não disponível para este perfil.");
  return comResponsavelSocialNativo(
    autor,
    perfilId,
    {
      origemId: perfilId,
      destinoId: null,
      finalidade: "protecao",
      antesDosPerfis: (tx) => travarMundoDoRecibo(tx, pista),
    },
    (tx, ctx) =>
      reduzirSobTrava(
        tx,
        { perfilId, contaId: autor.contaId, tipo: "responsavel" },
        pista,
        ctx.conferirPrazo,
      ),
  );
}
