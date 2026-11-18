import "server-only";
import { and, desc, eq, gt, lt, or, sql } from "@informach/db";
import { recreioDirectedSpaceInvites as invites } from "@informach/db/schema";
import { MundoIdSchema } from "@informach/recreio";
import { ConsultaDeConvitesDirigidosSchema } from "@informach/recreio/contrato";
import { limitarTentativas } from "@/lib/rate-limit";
import { type AutorDaGestaoDeMundo, identidadeDoGestor } from "./gestao-nativa-autor";
import { comGestaoNativaDoMundo } from "./gestao-nativa-repository";

/** Só pendências sem decisão do mundo; o papel é relido, sem depender de assinatura. */
export async function convitesAguardandoOMundo(
  autor: AutorDaGestaoDeMundo,
  mundoId: unknown,
  entrada: unknown,
) {
  const id = MundoIdSchema.parse(mundoId),
    consulta = ConsultaDeConvitesDirigidosSchema.parse(entrada);
  await limitarTentativas({
    chave: `convite-dirigido-fila:${identidadeDoGestor(autor).contaId}`,
    max: 120,
    janelaEmSegundos: 600,
  });
  return comGestaoNativaDoMundo(
    autor,
    id,
    undefined,
    async (tx, ctx) => {
      const agora = await ctx.conferirPrazo(false);
      const linhas = await tx
        .select({ id: invites.id, criadoEm: invites.createdAt, expiraEm: invites.expiresAt })
        .from(invites)
        .where(
          and(
            eq(invites.spaceId, id),
            eq(invites.state, "pending"),
            gt(invites.expiresAt, agora),
            eq(invites.managementRevision, ctx.mundo.managementRevision),
            sql`not exists(select 1 from recreio.directed_invite_world_approvals a where a.invite_id=${invites.id})`,
            consulta.aposEm && consulta.aposId
              ? or(
                  lt(invites.createdAt, new Date(consulta.aposEm)),
                  and(
                    eq(invites.createdAt, new Date(consulta.aposEm)),
                    lt(invites.id, consulta.aposId),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(desc(invites.createdAt), desc(invites.id))
        .limit(11);
      const itens = linhas.slice(0, 10),
        ultimo = itens.at(-1);
      return {
        mundo: { id, nome: ctx.mundo.name },
        convites: itens.map((x) => ({
          id: x.id,
          expiraEm: x.expiraEm.toISOString(),
          criadoEm: x.criadoEm.toISOString(),
        })),
        proximo:
          linhas.length > 10 && ultimo
            ? { em: ultimo.criadoEm.toISOString(), id: ultimo.id }
            : null,
      };
    },
    true,
  );
}
