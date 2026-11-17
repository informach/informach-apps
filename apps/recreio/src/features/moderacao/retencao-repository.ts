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
      select count(*) filter (where priority and created_at<=statement_timestamp()-interval '24 hours')::integer as prioritarias,
        count(*) filter (where not priority and created_at<=statement_timestamp()-interval '72 hours')::integer as demais
      from recreio.safety_reports where state in ('aberta','em_analise','recurso')
    `);
    if (!expurgo || !fila) throw new Error("A manutenção das denúncias não devolveu contagens.");
    const contagens = {
      denunciasApagadas: expurgo.apagadas,
      denunciasVencidasSemSolucao: expurgo.pendentes,
      denunciasPrioritariasAtrasadas: fila.prioritarias,
      denunciasAtrasadas: fila.demais,
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
    return contagens;
  });
}

export function exigirFilaDeSegurancaEmDia(contagens: Awaited<ReturnType<typeof limparDenuncias>>) {
  if (
    contagens.denunciasVencidasSemSolucao > 0 ||
    contagens.denunciasPrioritariasAtrasadas > 0 ||
    contagens.denunciasAtrasadas > 0
  )
    throw new Error("moderacao.fila_de_seguranca_atrasada");
}
