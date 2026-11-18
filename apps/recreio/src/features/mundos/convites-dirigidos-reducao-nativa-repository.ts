import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, db, eq, or } from "@informach/db";
import { recreioDirectedSpaceInvites as invites } from "@informach/db/schema";
import { MundoIdSchema, PerfilIdSchema } from "@informach/recreio";
import type { EncerramentoParentalDeConviteSchema } from "@informach/recreio/contrato";
import type { z } from "zod";
import type { AutorNativoRecente } from "@/features/account/autoridade-repository";
import { comResponsavelSocialNativo } from "@/features/social/responsavel-contexto-repository";
import { assertAllowed } from "@/lib/errors";
import { travarMundoDoConvite } from "./convites-dirigidos-contexto-repository";

/** Só a própria responsabilidade; encerrar convite não remove participação já aceita. */
export async function encerrarConvitePeloResponsavel(
  autor: AutorNativoRecente,
  pedido: z.infer<typeof EncerramentoParentalDeConviteSchema>,
) {
  const [pista] = await db
    .select()
    .from(invites)
    .where(
      and(
        eq(invites.id, pedido.conviteId),
        or(
          eq(invites.originProfileId, pedido.perfilId),
          eq(invites.targetProfileId, pedido.perfilId),
        ),
      ),
    );
  assertAllowed(pista, "PEDIDO", "Convite não disponível para este perfil.");
  const pontas = {
    mundoId: MundoIdSchema.parse(pista.spaceId),
    origemId: PerfilIdSchema.parse(pista.originProfileId),
    destinoId: PerfilIdSchema.parse(pista.targetProfileId),
  };
  return comResponsavelSocialNativo(
    autor,
    pedido.perfilId,
    {
      origemId: pedido.perfilId,
      destinoId: null,
      finalidade: "protecao",
      antesDosPerfis: async (tx) => {
        await travarMundoDoConvite(tx, pontas);
      },
    },
    async (tx, ctx) => {
      const [convite] = await tx
        .select()
        .from(invites)
        .where(eq(invites.id, pedido.conviteId))
        .for("update");
      assertAllowed(
        convite &&
          convite.spaceId === pontas.mundoId &&
          convite.originProfileId === pontas.origemId &&
          convite.targetProfileId === pontas.destinoId &&
          convite.retainUntil > (await ctx.conferirPrazo()),
        "PEDIDO",
        "Convite não disponível.",
      );
      if (convite.state !== "pending") return { estado: convite.state };
      const agora = await ctx.conferirPrazo(),
        estado =
          convite.expiresAt <= agora
            ? ("expired" as const)
            : convite.originProfileId === pedido.perfilId
              ? ("revoked" as const)
              : ("declined" as const);
      await tx
        .update(invites)
        .set({ state: estado, finishedAt: agora })
        .where(eq(invites.id, convite.id));
      await logAuditEventStrict(
        "recreio.directed_invite_closed",
        autor.contaId,
        {
          app: "recreio",
          spaceId: pontas.mundoId,
          inviteId: convite.id,
          state: estado,
          profileId: pedido.perfilId,
          actorKind: "responsavel",
        },
        { writer: tx },
      );
      return { estado };
    },
  );
}
