import "server-only";
import { db, sql } from "@informach/db";

export const LOTE_DE_CONVITES_ANTIGOS = 500;
export const LOTE_DE_INTENCOES_ANTIGAS = 500;

export const SQL_LIMPAR_CADASTROS_PENDENTES = sql`
  with lote as (
    select id from recreio.profile_creation_requests
    where consumed_at is null and expires_at <= statement_timestamp()
    order by expires_at, id limit ${LOTE_DE_INTENCOES_ANTIGAS} for update skip locked
  ), removidos as (
    delete from recreio.profile_creation_requests r using lote
    where r.id=lote.id and r.consumed_at is null and r.expires_at <= statement_timestamp()
    returning 1
  ) select count(*)::integer as apagados from removidos
`;
export const SQL_LIMPAR_RECIBOS_DE_CADASTRO = sql`
  with lote as (
    select id from recreio.profile_creation_requests
    where consumed_at <= statement_timestamp() - interval '1 day'
    order by consumed_at, id limit ${LOTE_DE_INTENCOES_ANTIGAS} for update skip locked
  ), removidos as (
    delete from recreio.profile_creation_requests r using lote
    where r.id=lote.id and r.consumed_at <= statement_timestamp() - interval '1 day'
    returning 1
  ) select count(*)::integer as apagados from removidos
`;
export const SQL_LIMPAR_PAREAMENTOS = sql`
  with lote as (
    select id,device_session_id,profile_id from recreio.pairing_requests
    where expires_at <= statement_timestamp()
    order by expires_at,id limit ${LOTE_DE_INTENCOES_ANTIGAS} for update skip locked
  ), encerrados as (
    update recreio.device_sessions d set revoked_at=clock_timestamp()
    from lote l,recreio.paired_credentials c
    where d.id=l.device_session_id and c.device_session_id=d.id
      and c.profile_id=l.profile_id and d.active_profile_id=l.profile_id
      and d.kind='paired_device' and d.user_id is null and d.auth_session_id is null
      and c.token_hash is null and d.revoked_at is null
    returning 1
  ), removidos as (
    delete from recreio.pairing_requests r using lote
    where r.id=lote.id and r.expires_at <= statement_timestamp() returning 1
  ) select (select count(*)::integer from removidos) as apagados,
      (select count(*)::integer from encerrados) as encerrados
`;

/** Limpeza global física; nunca apaga o perfil ou a credencial já confirmada. */
export async function apagarIntencoesAntigas() {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout='5s'`);
    await tx.execute(sql`set local lock_timeout='1s'`);
    await tx.execute(sql`set local transaction_timeout='15s'`);
    const [pendentes] = await tx.execute<{ apagados: number }>(SQL_LIMPAR_CADASTROS_PENDENTES);
    const [recibos] = await tx.execute<{ apagados: number }>(SQL_LIMPAR_RECIBOS_DE_CADASTRO);
    const [pareamentos] = await tx.execute<{ apagados: number; encerrados: number }>(
      SQL_LIMPAR_PAREAMENTOS,
    );
    if (!pendentes || !recibos || !pareamentos)
      throw new Error("A limpeza de intenções não devolveu sua contagem.");
    return {
      cadastrosPendentesApagados: pendentes.apagados,
      recibosDeCadastroApagados: recibos.apagados,
      pareamentosApagados: pareamentos.apagados,
      aparelhosNaoConfirmadosEncerrados: pareamentos.encerrados,
    };
  });
}

export const LOTE_DE_USO_ANTIGO = 500;
/** Agregado de tempo não conserva histórico além de trinta dias; nenhuma sessão é apagada aqui. */
export async function apagarUsoAntigo() {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout='5s'`);
    await tx.execute(sql`set local lock_timeout='1s'`);
    await tx.execute(sql`set local transaction_timeout='15s'`);
    const [resultado] = await tx.execute<{ apagados: number }>(sql`
      with lote as (
        select profile_id,local_day from recreio.minor_daily_usage
        where local_day < (clock_timestamp() at time zone 'America/Sao_Paulo')::date-30
          and (lease_until is null or lease_until <= clock_timestamp())
        order by local_day,profile_id limit ${LOTE_DE_USO_ANTIGO} for update skip locked
      ), removidos as (
        delete from recreio.minor_daily_usage u using lote l
        where u.profile_id=l.profile_id and u.local_day=l.local_day returning 1
      ) select count(*)::integer as apagados from removidos
    `);
    if (!resultado) throw new Error("A limpeza de tempo não devolveu sua contagem.");
    return resultado.apagados;
  });
}

/** A mesma consulta é conferida com EXPLAIN no banco descartável de capacidade. */
export const SQL_LIMPAR_CONVITES_ANTIGOS = sql`
  with lote as (
    select id from recreio.space_invites
    where state <> 'accepted'
      and expires_at < statement_timestamp() - interval '1 day'
    order by expires_at, id
    limit ${LOTE_DE_CONVITES_ANTIGOS}
    for update skip locked
  ), removidos as (
    delete from recreio.space_invites convite using lote
    where convite.id = lote.id and convite.state <> 'accepted'
      and convite.expires_at < statement_timestamp() - interval '1 day'
    returning 1
  )
  select count(*)::integer as apagados from removidos
`;

/** Convites aceitos conservam a evidência de ingresso; só credenciais sem aceite expiram aqui. */
export async function apagarConvitesAntigos(): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout = '5s'`);
    await tx.execute(sql`set local lock_timeout = '1s'`);
    await tx.execute(sql`set local transaction_timeout = '15s'`);
    const [resultado] = await tx.execute<{ apagados: number }>(SQL_LIMPAR_CONVITES_ANTIGOS);
    if (!resultado) throw new Error("A limpeza de convites não devolveu sua contagem.");
    return resultado.apagados;
  });
}
