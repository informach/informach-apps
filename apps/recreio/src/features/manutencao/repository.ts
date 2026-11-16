import "server-only";
import { db, sql } from "@informach/db";

export const LOTE_DE_CONVITES_ANTIGOS = 500;

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
