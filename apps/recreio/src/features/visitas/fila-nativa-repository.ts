import "server-only";
import { and, desc, eq, gt, lt, or, sql } from "@informach/db";
import { recreioSpaceVisitInvites as invites } from "@informach/db/schema";
import { MundoIdSchema } from "@informach/recreio";
import { ConsultaDeVisitasSchema } from "@informach/recreio/contrato";
import {
  type AutorDaGestaoDeMundo,
  identidadeDoGestor,
} from "@/features/mundos/gestao-nativa-autor";
import { comGestaoNativaDoMundo } from "@/features/mundos/gestao-nativa-repository";
import { limitarTentativas } from "@/lib/rate-limit";

/** Pendências técnicas do mundo administrado. Nomes/autoridade positiva exigem o painel atual. */
export async function visitasAguardandoOMundo(
  autor: AutorDaGestaoDeMundo,
  mundoId: unknown,
  entrada: unknown,
) {
  const id = MundoIdSchema.parse(mundoId),
    consulta = ConsultaDeVisitasSchema.parse(entrada);
  await limitarTentativas({
    chave: `visita-fila-nativa:${identidadeDoGestor(autor).contaId}`,
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
            gt(invites.retainUntil, agora),
            eq(invites.managementRevision, ctx.mundo.managementRevision),
            sql`not exists(select 1 from recreio.visit_invite_world_approvals a where a.invite_id=${invites.id})`,
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
        convites: itens.map((c) => ({
          id: c.id,
          criadoEm: c.criadoEm.toISOString(),
          expiraEm: c.expiraEm.toISOString(),
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
