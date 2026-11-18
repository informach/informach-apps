import "server-only";
import type { recreioSpaceVisitInvites, recreioWorldVisits } from "@informach/db/schema";
import { MundoIdSchema } from "@informach/recreio";
import type { ReciboDeConviteDeVisita, ReciboDeVisita } from "@informach/recreio/contrato";

export function reciboDoConviteDeVisita(
  convite: typeof recreioSpaceVisitInvites.$inferSelect,
  jogo: string,
): ReciboDeConviteDeVisita {
  return {
    conviteId: convite.id,
    mundoId: MundoIdSchema.parse(convite.spaceId),
    jogo,
    estado: convite.state,
    criadoEm: convite.createdAt.toISOString(),
    expiraEm: convite.expiresAt.toISOString(),
  };
}
export function reciboDaVisita(visita: typeof recreioWorldVisits.$inferSelect): ReciboDeVisita {
  return {
    visitaId: visita.id,
    mundoId: MundoIdSchema.parse(visita.spaceId),
    estado: visita.state,
    expiraEm: visita.expiresAt.toISOString(),
  };
}
