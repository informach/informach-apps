import "server-only";
import { and, eq, isNull, sql } from "@informach/db";
import { recreioGameTickets as tickets } from "@informach/db/schema";
import type { PerfilId, SessaoDeAparelhoId } from "@informach/recreio";
import type { Transacao } from "@/lib/repository";

/** Chamador já trava perfil ou aparelho: emissão anterior confirma antes, posterior espera. */
async function invalidar(tx: Transacao, escopo: ReturnType<typeof sql>) {
  await tx
    .delete(tickets)
    .where(
      and(escopo, isNull(tickets.consumedAt), sql`${tickets.expiresAt}>statement_timestamp()`),
    );
}
export function invalidarIngressosDoPerfil(tx: Transacao, perfilId: PerfilId) {
  return invalidar(tx, sql`${eq(tickets.profileId, perfilId)}`);
}
export function invalidarIngressosDoAparelho(tx: Transacao, aparelhoId: SessaoDeAparelhoId) {
  return invalidar(tx, sql`${eq(tickets.deviceSessionId, aparelhoId)}`);
}
