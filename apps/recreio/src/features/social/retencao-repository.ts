import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { db, sql } from "@informach/db";

export const LOTE_DE_EXPIRACAO_SOCIAL = 100;
export const LOTE_DE_RETENCAO_SOCIAL = 500;

/** Recibos técnicos vencem; aprovação de amizade ativa e bloqueio durável não são recibos. */
export async function limparRegistrosSociais() {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout='5s'`);
    await tx.execute(sql`set local lock_timeout='1s'`);
    await tx.execute(sql`set local transaction_timeout='15s'`);
    const vencidos = await tx.execute<{ id: string; perfil_id: string }>(sql`
      with lote as (
        select id from recreio.friend_requests
        where state='pending' and expires_at<=statement_timestamp()
        order by expires_at,id limit ${LOTE_DE_EXPIRACAO_SOCIAL} for update skip locked
      ) update recreio.friend_requests p set state='expired',finished_at=clock_timestamp()
      from lote l where p.id=l.id and p.state='pending' and p.expires_at<=statement_timestamp()
      returning p.id,p.origin_profile_id as perfil_id
    `);
    for (const pedido of vencidos)
      await logAuditEventStrict(
        "recreio.friend_request_expired",
        null,
        { app: "recreio", requestId: pedido.id, profileId: pedido.perfil_id },
        { writer: tx },
      );
    const [vinculosDeCodigo] = await tx.execute<{ limpos: number }>(sql`
      with lote as (
        select p.id from recreio.friend_requests p join recreio.friend_codes c on c.id=p.code_id
        where c.expires_at<=statement_timestamp()-interval '1 day'
        order by p.id limit ${LOTE_DE_RETENCAO_SOCIAL} for update of p skip locked
      ), alterados as (
        update recreio.friend_requests p set code_id=null from lote l where p.id=l.id returning 1
      ) select count(*)::integer as limpos from alterados
    `);
    const [codigos] = await tx.execute<{ apagados: number }>(sql`
      with lote as (
        select c.id from recreio.friend_codes c
        where c.expires_at<=statement_timestamp()-interval '1 day'
          and not exists (select 1 from recreio.friend_requests p where p.code_id=c.id)
        order by c.expires_at,c.id limit ${LOTE_DE_RETENCAO_SOCIAL} for update of c skip locked
      ), removidos as (
        delete from recreio.friend_codes c using lote l where c.id=l.id returning 1
      ) select count(*)::integer as apagados from removidos
    `);
    const [vinculosDePedido] = await tx.execute<{ limpos: number }>(sql`
      with lote as (
        select f.lower_profile_id,f.higher_profile_id from recreio.friendships f
        join recreio.friend_requests p on p.id=f.request_id
        where f.state='removed' and p.state<>'pending' and p.finished_at<=statement_timestamp()-interval '1 day'
        order by f.lower_profile_id,f.higher_profile_id limit ${LOTE_DE_RETENCAO_SOCIAL} for update of f skip locked
      ), alterados as (
        update recreio.friendships f set request_id=null from lote l
        where f.lower_profile_id=l.lower_profile_id and f.higher_profile_id=l.higher_profile_id returning 1
      ) select count(*)::integer as limpos from alterados
    `);
    const [recibos] = await tx.execute<{ apagados: number }>(sql`
      with lote as (
        select p.id from recreio.friend_requests p
        where p.state<>'pending' and p.finished_at<=statement_timestamp()-interval '1 day'
          and not exists (select 1 from recreio.friendships f where f.request_id=p.id)
        order by p.finished_at,p.id limit ${LOTE_DE_RETENCAO_SOCIAL} for update of p skip locked
      ), removidos as (
        delete from recreio.friend_requests p using lote l where p.id=l.id returning 1
      ) select count(*)::integer as apagados from removidos
    `);
    const [avisos] = await tx.execute<{ apagados: number }>(sql`
      with lote as (
        select id from recreio.social_notices where created_at<=statement_timestamp()-interval '30 days'
        order by created_at,id limit ${LOTE_DE_RETENCAO_SOCIAL} for update skip locked
      ), removidos as (
        delete from recreio.social_notices n using lote l where n.id=l.id returning 1
      ) select count(*)::integer as apagados from removidos
    `);
    const [relacoes] = await tx.execute<{ apagados: number }>(sql`
      with lote as (
        select lower_profile_id,higher_profile_id from recreio.friendships
        where state='removed' and removed_at<=statement_timestamp()-interval '30 days'
        order by removed_at,lower_profile_id,higher_profile_id limit ${LOTE_DE_RETENCAO_SOCIAL} for update skip locked
      ), removidos as (
        delete from recreio.friendships f using lote l
        where f.lower_profile_id=l.lower_profile_id and f.higher_profile_id=l.higher_profile_id returning 1
      ) select count(*)::integer as apagados from removidos
    `);
    if (!codigos || !recibos || !avisos || !relacoes || !vinculosDeCodigo || !vinculosDePedido)
      throw new Error("A limpeza social não devolveu suas contagens.");
    const contagens = {
      codigosSociaisApagados: codigos.apagados,
      recibosSociaisApagados: recibos.apagados,
      avisosSociaisApagados: avisos.apagados,
      relacoesSociaisApagadas: relacoes.apagados,
      vinculosDeCodigoSocialLimpos: vinculosDeCodigo.limpos,
      vinculosDePedidoSocialLimpos: vinculosDePedido.limpos,
    };
    if (Object.values(contagens).some((n) => n > 0))
      await logAuditEventStrict(
        "recreio.social_records_purged",
        null,
        { app: "recreio", ...contagens },
        { writer: tx },
      );
    return { pedidosSociaisVencidos: vencidos.length, ...contagens };
  });
}
