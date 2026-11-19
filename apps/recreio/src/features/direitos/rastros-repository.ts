import "server-only";
import { recreioProfileWorldTraces as traces } from "@informach/db/schema";
import type { Transacao } from "@/lib/repository";

/** Só depois da admissão autoritativa, nas mesmas travas/transação que liga o
 * SID ao mundo. Não concede acesso ou substitui membro/concessão de visita. */
export async function registrarRastroPessoalDoMundo(
  tx: Transacao,
  perfilId: string,
  mundoId: string,
) {
  await tx
    .insert(traces)
    .values({ profileId: perfilId, spaceId: mundoId })
    .onConflictDoNothing({ target: [traces.profileId, traces.spaceId] });
}
