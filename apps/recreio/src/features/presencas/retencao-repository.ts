import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { db, sql } from "@informach/db";
import { limitarGestao } from "@/features/mundos/gestao-repository";

export const LOTE_DE_PRESENCAS = 500;
/** Provas técnicas; não encerra SID, não apaga membro e não confirma salvamento. */
export function limparPresencasDeAnfitriao() {
  return db.transaction(async (tx) => {
    await limitarGestao(tx);
    const vencidas = await tx.execute<{
      id: string;
      space_id: string;
      instance_id: string;
      host_profile_id: string;
      host_session_id: string;
      fence: number;
    }>(sql`
      with instante as materialized(select clock_timestamp() as agora), lote as (
        select id from recreio.world_host_presences where closed_at is null and expires_at<=statement_timestamp()
        order by expires_at,id limit ${LOTE_DE_PRESENCAS} for update skip locked
      ) update recreio.world_host_presences p set state='closed',closed_at=i.agora,updated_at=i.agora,close_reason='expired'
      from lote l,instante i where p.id=l.id and p.closed_at is null and p.expires_at<=i.agora
      returning p.id,p.space_id,p.instance_id,p.host_profile_id,p.host_session_id,p.fence
    `);
    for (const p of vencidas)
      await logAuditEventStrict(
        "recreio.host_presence_closed",
        null,
        {
          app: "recreio",
          spaceId: p.space_id,
          instanceId: p.instance_id,
          profileId: p.host_profile_id,
          sid: p.host_session_id,
          presenceId: p.id,
          fence: p.fence,
          reason: "expired",
        },
        { writer: tx },
      );
    const [apagadas] = await tx.execute<{ total: number }>(sql`
      with lote as (
        select id from recreio.world_host_presences where closed_at is not null and retain_until<=statement_timestamp()
        order by retain_until,id limit ${LOTE_DE_PRESENCAS} for update skip locked
      ), removidas as (delete from recreio.world_host_presences p using lote l where p.id=l.id returning 1)
      select count(*)::integer as total from removidas
    `);
    if (!apagadas) throw new Error("A retenção de presenças não devolveu sua contagem.");
    if (apagadas.total > 0)
      await logAuditEventStrict(
        "recreio.host_presences_purged",
        null,
        { app: "recreio", count: apagadas.total },
        { writer: tx },
      );
    return {
      presencasDeAnfitriaoVencidas: vencidas.length,
      presencasDeAnfitriaoApagadas: apagadas.total,
    };
  });
}
