import "server-only";
import { and, eq, gt, isNull, lte, sql } from "@informach/db";
import {
  recreioDeviceSessions as devices,
  recreioGameSessions as games,
  recreioSessionSavePermits as permits,
} from "@informach/db/schema";
import { ErroDoRecreio } from "@informach/recreio";
import type { Transacao } from "@/lib/repository";

/** Chamador conserva perfil/mutex: o finalizador e a abertura não se ultrapassam. */
export async function aguardarSalvamentoAnterior(
  tx: Transacao,
  entrada: { perfilId: string; versaoDaPolitica: number; agora: Date },
) {
  const [pendente] = await tx
    .select({ id: permits.id })
    .from(permits)
    .innerJoin(games, eq(games.id, permits.sessionId))
    .innerJoin(devices, eq(devices.id, games.deviceSessionId))
    .where(
      and(
        eq(permits.profileId, entrada.perfilId),
        eq(permits.policyVersion, entrada.versaoDaPolitica),
        eq(permits.status, "ready"),
        // Sem admissão autoritativa no primeiro mundo, não há fila de mundo
        // deste SID a persistir. Isso não vale para dados de perfil.
        sql`(${permits.mode}<>'server' or ${games.spaceId} is not null)`,
        gt(permits.expiresAt, entrada.agora),
        isNull(games.checkpointFrozenAt),
        isNull(devices.revokedAt),
        gt(devices.expiresAt, entrada.agora),
        sql`(${games.endedAt} is not null or ${lte(games.expiresAt, entrada.agora)})`,
        sql`(${games.endReason} is null or ${games.endReason} in ('left','expired','access_lost'))`,
        sql`(${games.endedAt} is null or ${games.endedAt}+interval '30 seconds'>${entrada.agora.toISOString()}::timestamptz)`,
        // Um recibo histórico não pode impedir o sucessor que já foi admitido.
        sql`not exists (select 1 from recreio.game_sessions posterior
          where posterior.profile_id=${games.profileId} and posterior.id<>${games.id}
          and (posterior.ended_at is null or posterior.ended_seq>${games.endedSeq}))`,
      ),
    )
    .limit(1);
  if (pendente) throw new ErroDoRecreio("CHECKPOINT_PENDENTE", { motivo: "saving" });
}
