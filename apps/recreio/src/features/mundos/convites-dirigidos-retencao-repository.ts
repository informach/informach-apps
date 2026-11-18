import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { db, sql } from "@informach/db";
import { limitarGestao } from "./gestao-repository";

export const LOTE_DE_CONVITES_DIRIGIDOS = 500;
/** Prazo e retenção não removem membros, mundos, bloqueios ou progresso. */
export function limparConvitesDirigidos() {
  return db.transaction(async (tx) => {
    await limitarGestao(tx);
    const vencidos = await tx.execute<{ id: string; space_id: string }>(sql`
      with lote as (
        select id from recreio.directed_space_invites
        where state='pending' and expires_at<=statement_timestamp()
        order by expires_at,id limit ${LOTE_DE_CONVITES_DIRIGIDOS} for update skip locked
      ) update recreio.directed_space_invites c set state='expired',finished_at=clock_timestamp()
      from lote l where c.id=l.id and c.state='pending' and c.expires_at<=statement_timestamp()
      returning c.id,c.space_id
    `);
    for (const convite of vencidos)
      await logAuditEventStrict(
        "recreio.directed_invite_closed",
        null,
        { app: "recreio", spaceId: convite.space_id, inviteId: convite.id, state: "expired" },
        { writer: tx },
      );
    const [apagados] = await tx.execute<{ total: number }>(sql`
      with lote as (
        select id from recreio.directed_space_invites where retain_until<=statement_timestamp() and state<>'pending'
        order by retain_until,id limit ${LOTE_DE_CONVITES_DIRIGIDOS} for update skip locked
      ), removidos as (
        delete from recreio.directed_space_invites c using lote l where c.id=l.id returning 1
      ) select count(*)::int as total from removidos
    `);
    if (!apagados) throw new Error("A retenção de convites dirigidos não devolveu sua contagem.");
    if (apagados.total > 0)
      await logAuditEventStrict(
        "recreio.directed_invites_purged",
        null,
        { app: "recreio", count: apagados.total },
        { writer: tx },
      );
    return {
      convitesDirigidosVencidos: vencidos.length,
      recibosDeConviteDirigidoApagados: apagados.total,
    };
  });
}
