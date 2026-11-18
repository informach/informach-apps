import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { and, db, inArray, isNotNull, sql } from "@informach/db";
import {
  recreioSpaceVisitInvites as invites,
  recreioWorldVisits as visits,
} from "@informach/db/schema";
import { limitarGestao } from "@/features/mundos/gestao-repository";

export const LOTE_DE_VISITAS = 500;
/** Só prazos e retenção. Não emite ingresso, encerra SID ou modifica participação permanente. */
export function limparRecibosDeVisita() {
  return db.transaction(async (tx) => {
    await limitarGestao(tx);
    const vencidos = await tx.execute<{ id: string; space_id: string }>(sql`
      with instante as materialized (select clock_timestamp() as agora), lote as (
        select id from recreio.space_visit_invites where state='pending' and expires_at<=statement_timestamp()
        order by expires_at,id limit ${LOTE_DE_VISITAS} for update skip locked
      ) update recreio.space_visit_invites c set state='expired',finished_at=i.agora
      from lote l,instante i where c.id=l.id and c.state='pending' and c.expires_at<=i.agora
      returning c.id,c.space_id
    `);
    for (const c of vencidos)
      await logAuditEventStrict(
        "recreio.visit_invite_closed",
        null,
        { app: "recreio", spaceId: c.space_id, inviteId: c.id, state: "expired" },
        { writer: tx },
      );
    const expiradas = await tx.execute<{
      id: string;
      space_id: string;
      invite_id: string;
      visitor_profile_id: string;
    }>(sql`
      with instante as materialized(select clock_timestamp() as agora), lote as (
        select id from recreio.world_visits where ended_at is null and expires_at<=statement_timestamp()
        order by expires_at,id limit ${LOTE_DE_VISITAS} for update skip locked
      ) update recreio.world_visits v set state='expired',ended_at=i.agora,updated_at=i.agora,end_reason='expired'
      from lote l,instante i where v.id=l.id and v.ended_at is null and v.expires_at<=i.agora
      returning v.id,v.space_id,v.invite_id,v.visitor_profile_id
    `);
    for (const v of expiradas)
      await logAuditEventStrict(
        "recreio.visit_closed",
        null,
        {
          app: "recreio",
          spaceId: v.space_id,
          inviteId: v.invite_id,
          visitId: v.id,
          profileId: v.visitor_profile_id,
          reason: "expired",
        },
        { writer: tx },
      );
    const lote = await tx.execute<{ id: string }>(sql`
      select c.id from recreio.space_visit_invites c
      where c.state<>'pending' and c.retain_until<=statement_timestamp()
        and not exists (select 1 from recreio.world_visits v where v.invite_id=c.id and v.ended_at is null)
      order by c.retain_until,c.id limit ${LOTE_DE_VISITAS} for update of c skip locked
    `);
    const ids = lote.map((c) => c.id);
    let concessoesApagadas = 0,
      recibosApagados = 0;
    if (ids.length) {
      const concessoes = await tx
        .delete(visits)
        .where(and(inArray(visits.inviteId, ids), isNotNull(visits.endedAt)))
        .returning({ id: visits.id });
      const recibos = await tx
        .delete(invites)
        .where(inArray(invites.id, ids))
        .returning({ id: invites.id });
      concessoesApagadas = concessoes.length;
      recibosApagados = recibos.length;
      await logAuditEventStrict(
        "recreio.visit_receipts_purged",
        null,
        { app: "recreio", count: recibosApagados, visitCount: concessoesApagadas },
        { writer: tx },
      );
    }
    return {
      convitesDeVisitaVencidos: vencidos.length,
      visitasVencidas: expiradas.length,
      recibosDeVisitaApagados: recibosApagados,
      concessoesDeVisitaApagadas: concessoesApagadas,
    };
  });
}
