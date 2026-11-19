import "server-only";
import { eq } from "@informach/db";
import { recreioSpaces as spaces, recreioRightsWorlds as worlds } from "@informach/db/schema";
import type { Transacao } from "@/lib/repository";
import { MAX_MUNDOS_DOS_DIREITOS } from "./preparacao-contrato";

/** Metadados sob a trava da operação. Um recibo/barreira local não pode
 * ampliar os mundos da seleção assinada. O item excedente força recusa, sem
 * carregar um conjunto sem limite se a persistência estiver inconsistente. */
export function referenciasDeMundosDaOperacao(tx: Transacao, operacaoId: string) {
  return tx
    .select({ id: worlds.spaceId, jogo: spaces.gameId })
    .from(worlds)
    .innerJoin(spaces, eq(spaces.id, worlds.spaceId))
    .where(eq(worlds.operationId, operacaoId))
    .orderBy(worlds.spaceId)
    .limit(MAX_MUNDOS_DOS_DIREITOS + 1);
}
