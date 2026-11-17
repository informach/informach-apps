import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { db, sql } from "@informach/db";

export const LOTE_DE_CONVITES_DE_GRUPO = 100;
export const LOTE_DE_RECIBOS_DE_GRUPO = 500;

/** Limpeza técnica não concede participação e funciona também com famílias desligadas. */
export async function limparConvitesDeGrupo() {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout='5s'`);
    await tx.execute(sql`set local lock_timeout='1s'`);
    await tx.execute(sql`set local transaction_timeout='15s'`);
    const vencidos = await tx.execute<{ id: string; grupo_id: string }>(sql`
      with lote as (
        select id from recreio.group_invites
        where state='pending' and expires_at<=statement_timestamp()
        order by expires_at,id limit ${LOTE_DE_CONVITES_DE_GRUPO} for update skip locked
      ) update recreio.group_invites i set state='expired',recipient_email=null,
        recipient_user_id=null,finished_at=clock_timestamp()
        from lote l where i.id=l.id and i.state='pending'
          and i.expires_at<=statement_timestamp()
        returning i.id,i.group_id as grupo_id
    `);
    for (const convite of vencidos)
      await logAuditEventStrict(
        "recreio.group_invite_expired",
        null,
        { app: "recreio", groupId: convite.grupo_id, inviteId: convite.id },
        { writer: tx },
      );
    const [recibos] = await tx.execute<{ apagados: number }>(sql`
      with lote as (
        select id from recreio.group_invites
        where state<>'pending' and finished_at<=statement_timestamp()-interval '1 day'
        order by finished_at,id limit ${LOTE_DE_RECIBOS_DE_GRUPO} for update skip locked
      ), removidos as (
        delete from recreio.group_invites i using lote l where i.id=l.id
          and i.state<>'pending' and i.finished_at<=statement_timestamp()-interval '1 day'
          returning 1
      ) select count(*)::integer as apagados from removidos
    `);
    if (!recibos) throw new Error("A limpeza dos convites de grupo não devolveu sua contagem.");
    return { convitesDeGrupoVencidos: vencidos.length, recibosDeGrupoApagados: recibos.apagados };
  });
}
