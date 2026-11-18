import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, db, eq, isNull, sql } from "@informach/db";
import {
  recreioSpaceVisitInvites as invites,
  recreioSpaceMembers as members,
  recreioSpaces as spaces,
  recreioWorldVisits as visits,
} from "@informach/db/schema";
import { ErroDoRecreio, MundoIdSchema, PerfilIdSchema } from "@informach/recreio";
import type { ResultadoDaDecisaoDeVisita } from "@informach/recreio/contrato";
import type { AutorDeMundos } from "@/features/autoridade-de-jogo/mundos-repository";
import {
  amizadeAtualDoConvite,
  conferirConteudoDoConvite,
} from "@/features/mundos/convites-dirigidos-amizade-repository";
import {
  aprovacoesDaVisita,
  conferirRevisoesDoConvite,
} from "@/features/mundos/convites-dirigidos-estado-repository";
import { comJogadorSocial } from "@/features/social/autoridade-repository";
import { assertAllowed } from "@/lib/errors";
import type { Transacao } from "@/lib/repository";
import { comJogadorEAnfitriaoNaVisita } from "./contexto-repository";
import { reciboDaVisita, reciboDoConviteDeVisita } from "./recibos";

export type ConviteDeVisita = typeof invites.$inferSelect;
/** O chamador conserva SHARE/UPDATE no convite para não ler metade de um expurgo. */
export async function decisaoDaVisitaSobTrava(
  tx: Transacao,
  convite: ConviteDeVisita,
  jogo: string,
): Promise<ResultadoDaDecisaoDeVisita> {
  const [visita] = await tx.select().from(visits).where(eq(visits.inviteId, convite.id));
  if ((convite.state === "accepted") !== Boolean(visita))
    throw new Error("Convite de visita e concessão não correspondem ao mesmo aceite.");
  return {
    convite: reciboDoConviteDeVisita(convite, jogo),
    visita: visita ? reciboDaVisita(visita) : null,
  };
}

/** Fato anterior do destinatário, sem conceder ou reativar entrada; identidade nativa não exige plano. */
export function recuperarDecisaoConcluida(autor: AutorDeMundos, conviteId: string) {
  return comJogadorSocial(autor, null, async (tx, ctx) => {
    const [convite] = await tx
      .select()
      .from(invites)
      .where(and(eq(invites.id, conviteId), eq(invites.targetProfileId, autor.perfilId)))
      .for("share");
    assertAllowed(
      convite && convite.retainUntil > (await ctx.conferirPrazo()),
      "PEDIDO",
      "Convite não disponível.",
    );
    const [mundo] = await tx
      .select({ jogo: spaces.gameId })
      .from(spaces)
      .where(eq(spaces.id, convite.spaceId));
    if (!mundo) throw new Error("Convite de visita sem mundo correspondente.");
    assertAllowed(
      !("sid" in autor) || mundo.jogo === autor.jogo,
      "PEDIDO",
      "Convite não disponível.",
    );
    if (convite.state === "pending") return null;
    return decisaoDaVisitaSobTrava(tx, convite, mundo.jogo);
  });
}

/** Aceita uma concessão temporária; nunca cria/restaura participação ou sessão de jogo. */
export async function aceitarConviteDeVisitaNoBanco(autor: AutorDeMundos, conviteId: string) {
  const [pista] = await db
    .select()
    .from(invites)
    .where(and(eq(invites.id, conviteId), eq(invites.targetProfileId, autor.perfilId)));
  assertAllowed(pista, "PEDIDO", "Convite não disponível.");
  const pontas = {
    mundoId: MundoIdSchema.parse(pista.spaceId),
    origemId: PerfilIdSchema.parse(pista.originProfileId),
    destinoId: PerfilIdSchema.parse(pista.targetProfileId),
    conviteId,
  };
  return comJogadorEAnfitriaoNaVisita(
    autor,
    pontas,
    pista.hostPresenceId,
    async (tx, ctx, anfitriao) => {
      const [convite] = await tx
        .select()
        .from(invites)
        .where(eq(invites.id, conviteId))
        .for("update");
      assertAllowed(
        convite &&
          convite.spaceId === ctx.mundo.id &&
          convite.targetProfileId === autor.perfilId &&
          convite.originProfileId === pontas.origemId &&
          convite.hostPresenceId === anfitriao.presenca.id &&
          convite.retainUntil > (await anfitriao.conferirPrazo()),
        "PEDIDO",
        "Convite não disponível.",
      );
      if (convite.state !== "pending")
        return decisaoDaVisitaSobTrava(tx, convite, ctx.mundo.gameId);
      const amizade = await amizadeAtualDoConvite(tx, ctx);
      conferirRevisoesDoConvite(ctx, convite, amizade.revision);
      await conferirConteudoDoConvite(tx, ctx);
      const aprovacoes = await aprovacoesDaVisita(tx, ctx, convite);
      assertAllowed(
        aprovacoes.mundo && aprovacoes.origem && aprovacoes.destino,
        "PEDIDO",
        "O convite ainda precisa das aprovações atuais.",
      );
      const [membro] = await tx
        .select({ estado: members.state })
        .from(members)
        .where(and(eq(members.spaceId, ctx.mundo.id), eq(members.profileId, autor.perfilId)));
      if (membro && membro.estado !== "former") throw new ErroDoRecreio("JA_MEMBRO");
      const agora = await anfitriao.conferirPrazo(),
        expiraEm = new Date(
          Math.min(convite.expiresAt.getTime(), anfitriao.presenca.validUntil.getTime()),
        );
      assertAllowed(expiraEm > agora, "PEDIDO", "O convite venceu.");
      const [anterior] = await tx
        .select()
        .from(visits)
        .where(
          and(
            eq(visits.spaceId, ctx.mundo.id),
            eq(visits.visitorProfileId, autor.perfilId),
            isNull(visits.endedAt),
          ),
        )
        .for("update");
      if (anterior) {
        assertAllowed(
          anterior.expiresAt <= agora,
          "CONFLITO",
          "Encerre a visita anterior antes de aceitar outra neste mundo.",
        );
        await tx
          .update(visits)
          .set({ state: "expired", endedAt: agora, updatedAt: agora, endReason: "expired" })
          .where(eq(visits.id, anterior.id));
        await logAuditEventStrict(
          "recreio.visit_closed",
          null,
          {
            app: "recreio",
            spaceId: anterior.spaceId,
            inviteId: anterior.inviteId,
            visitId: anterior.id,
            profileId: anterior.visitorProfileId,
            reason: "expired",
          },
          { writer: tx },
        );
      }
      const [aceito] = await tx
        .update(invites)
        .set({ state: "accepted", finishedAt: agora })
        .where(
          and(
            eq(invites.id, convite.id),
            eq(invites.state, "pending"),
            sql`${invites.expiresAt}>clock_timestamp()`,
          ),
        )
        .returning();
      assertAllowed(aceito, "PEDIDO", "O convite venceu antes da confirmação.");
      const [visita] = await tx
        .insert(visits)
        .values({
          inviteId: convite.id,
          spaceId: ctx.mundo.id,
          visitorProfileId: autor.perfilId,
          hostPresenceId: anfitriao.presenca.id,
          acceptedAt: agora,
          updatedAt: agora,
          expiresAt: expiraEm,
        })
        .returning();
      assertAllowed(visita, "CONFLITO", "Não foi possível confirmar a visita.");
      await logAuditEventStrict(
        "recreio.visit_invite_accepted",
        ctx.contaId,
        {
          app: "recreio",
          spaceId: ctx.mundo.id,
          inviteId: convite.id,
          visitId: visita.id,
          profileId: autor.perfilId,
        },
        { writer: tx },
      );
      assertAllowed(
        expiraEm > (await anfitriao.conferirPrazo()),
        "PEDIDO",
        "O prazo venceu antes da confirmação.",
      );
      return {
        convite: reciboDoConviteDeVisita(aceito, ctx.mundo.gameId),
        visita: reciboDaVisita(visita),
      };
    },
  );
}
