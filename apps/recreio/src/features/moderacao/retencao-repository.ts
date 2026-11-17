import "server-only";
import { logAuditEventStrict } from "@informach/auth";
import { db, sql } from "@informach/db";

export const LOTE_DE_DENUNCIAS = 500;

/** O teto de retenção não transforma denúncia sem análise em atendimento concluído. */
export async function limparDenuncias() {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local statement_timeout='5s'`);
    await tx.execute(sql`set local lock_timeout='1s'`);
    await tx.execute(sql`set local transaction_timeout='15s'`);
    const [encerramento] = await tx.execute<{ encerradas: number }>(sql`
      with lote as (
        select id from recreio.safety_reports
        where state='resolvida' and updated_at<=statement_timestamp()-interval '30 days'
          and expires_at>statement_timestamp() and revision<2147483647
        order by updated_at,id limit ${LOTE_DE_DENUNCIAS} for update skip locked
      ), encerradas as (
        update recreio.safety_reports r set state='encerrada', closed_at=statement_timestamp(),
          updated_at=statement_timestamp(), revision=revision+1,
          expires_at=least(expires_at,statement_timestamp()+interval '90 days')
        from lote l where r.id=l.id returning r.id
      ) select count(*)::integer as encerradas from encerradas
    `);
    const [expurgo] = await tx.execute<{ apagadas: number; pendentes: number }>(sql`
      with lote as (
        select id from recreio.safety_reports where expires_at<=statement_timestamp()
        order by expires_at,id limit ${LOTE_DE_DENUNCIAS} for update skip locked
      ), removidas as (
        delete from recreio.safety_reports r using lote l
        where r.id=l.id and r.expires_at<=statement_timestamp() returning r.state
      ) select count(*)::integer as apagadas,
        count(*) filter (where state in ('aberta','em_analise','recurso'))::integer as pendentes
        from removidas
    `);
    const [fila] = await tx.execute<{ prioritarias: number; demais: number }>(sql`
      select count(*) filter (where priority and
        coalesce(review_requested_at,created_at)<=statement_timestamp()-interval '24 hours')::integer as prioritarias,
        count(*) filter (where not priority and
        coalesce(review_requested_at,created_at)<=statement_timestamp()-interval '72 hours')::integer as demais
      from recreio.safety_reports where state in ('aberta','em_analise','recurso')
    `);
    const [recursos] = await tx.execute<{ apagados: number; pendentes: number }>(sql`
      with lote as (
        select id from recreio.restriction_reviews where expires_at<=statement_timestamp()
        order by expires_at,id limit ${LOTE_DE_DENUNCIAS} for update skip locked
      ), removidos as (
        delete from recreio.restriction_reviews r using lote l
        where r.id=l.id and r.expires_at<=statement_timestamp() returning r.state
      ) select count(*)::integer as apagados,
        count(*) filter(where state='aberto')::integer as pendentes from removidos
    `);
    const [filaDeRecursos] = await tx.execute<{ atrasados: number }>(sql`
      select count(*)::integer as atrasados from recreio.restriction_reviews
      where state='aberto' and created_at<=statement_timestamp()-interval '24 hours'
    `);
    const [comandos] = await tx.execute<{ apagados: number }>(sql`
      with lote as (
        select id from recreio.moderation_commands where expires_at<=statement_timestamp()
        order by expires_at,id limit ${LOTE_DE_DENUNCIAS} for update skip locked
      ), removidos as (
        delete from recreio.moderation_commands r using lote l
        where r.id=l.id and r.expires_at<=statement_timestamp() returning r.id
      ) select count(*)::integer as apagados from removidos
    `);
    const [restricoes] = await tx.execute<{ apagadas: number }>(sql`
      with lote as (
        select profile_id from recreio.profile_restrictions
        where state='released' and released_at<=statement_timestamp()-interval '90 days'
        order by released_at,profile_id limit ${LOTE_DE_DENUNCIAS} for update skip locked
      ), removidas as (
        delete from recreio.profile_restrictions r using lote l
        where r.profile_id=l.profile_id and r.state='released'
          and r.released_at<=statement_timestamp()-interval '90 days' returning r.profile_id
      ) select count(*)::integer as apagadas from removidas
    `);
    if (
      !encerramento ||
      !expurgo ||
      !fila ||
      !recursos ||
      !filaDeRecursos ||
      !comandos ||
      !restricoes
    )
      throw new Error("A manutenção da moderação não devolveu contagens.");
    const contagens = {
      denunciasEncerradas: encerramento.encerradas,
      denunciasApagadas: expurgo.apagadas,
      denunciasVencidasSemSolucao: expurgo.pendentes,
      denunciasPrioritariasAtrasadas: fila.prioritarias,
      denunciasAtrasadas: fila.demais,
      recursosDeRestricaoApagados: recursos.apagados,
      recursosDeRestricaoVencidosSemSolucao: recursos.pendentes,
      recursosDeRestricaoAtrasados: filaDeRecursos.atrasados,
      comandosDeModeracaoApagados: comandos.apagados,
      restricoesLiberadasApagadas: restricoes.apagadas,
    };
    if (expurgo.apagadas > 0)
      await logAuditEventStrict(
        "recreio.safety_reports_purged",
        null,
        {
          app: "recreio",
          denunciasApagadas: expurgo.apagadas,
          denunciasVencidasSemSolucao: expurgo.pendentes,
        },
        { writer: tx },
      );
    if (encerramento.encerradas + recursos.apagados + comandos.apagados + restricoes.apagadas > 0)
      await logAuditEventStrict(
        "recreio.moderation_retention",
        null,
        {
          app: "recreio",
          denunciasEncerradas: encerramento.encerradas,
          recursosDeRestricaoApagados: recursos.apagados,
          recursosDeRestricaoVencidosSemSolucao: recursos.pendentes,
          comandosDeModeracaoApagados: comandos.apagados,
          restricoesLiberadasApagadas: restricoes.apagadas,
        },
        { writer: tx },
      );
    return contagens;
  });
}

export function exigirFilaDeSegurancaEmDia(contagens: Awaited<ReturnType<typeof limparDenuncias>>) {
  if (
    contagens.denunciasVencidasSemSolucao > 0 ||
    contagens.denunciasPrioritariasAtrasadas > 0 ||
    contagens.denunciasAtrasadas > 0 ||
    contagens.recursosDeRestricaoVencidosSemSolucao > 0 ||
    contagens.recursosDeRestricaoAtrasados > 0
  )
    throw new Error("moderacao.fila_de_seguranca_atrasada");
}
