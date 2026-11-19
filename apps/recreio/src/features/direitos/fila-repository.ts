import "server-only";
import { db, sql } from "@informach/db";
import { assertAllowed } from "@/lib/errors";

/** Métricas técnicas do livro configurado, sem IDs, conteúdo ou nomes. Não
 * usa sucesso do cron como sinônimo de ausência de revisão/backlog vencido. */
export async function resumoDaFilaDeDireitos(livroId: string) {
  const [fila] = await db.execute<{
    publishing: number;
    processing: number;
    review: number;
    processingOverdue: number;
    retained: number;
    purgeOverdue: number;
  }>(sql`select
    count(*) filter(where o.state='publishing')::int as publishing,
    count(*) filter(where o.state in ('admitted','running'))::int as processing,
    count(*) filter(where o.state='review')::int as review,
    count(*) filter(where o.state in ('publishing','admitted','running') and o.consented_at<clock_timestamp()-interval '30 minutes')::int as "processingOverdue",
    (select count(*)::int from recreio.rights_subjects s join recreio.rights_operations p on p.id=s.operation_id
      where p.ledger_id=${livroId}::uuid and s.phase='minimized' and s.retained_until>clock_timestamp()) as retained,
    (select count(*)::int from recreio.rights_subjects s join recreio.rights_operations p on p.id=s.operation_id
      where p.ledger_id=${livroId}::uuid and
        ((s.phase='minimized' and s.retained_until<clock_timestamp()-interval '5 minutes') or
         (s.phase='purging' and s.minimized_at<clock_timestamp()-interval '5 minutes'))) as "purgeOverdue"
    from recreio.rights_operations o where o.ledger_id=${livroId}::uuid`);
  assertAllowed(
    fila && Object.values(fila).every((v) => Number.isSafeInteger(v) && v >= 0),
    "DIREITOS_INTEGRIDADE",
    "Fila de direitos não pôde ser medida.",
  );
  return fila;
}
