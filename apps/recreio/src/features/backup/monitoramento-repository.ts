import "server-only";
import { db, sql } from "@informach/db";
import {
  recreioBackupCaptures as captures,
  jobRuns,
  recreioBackupPublications as publications,
  recreioBackupRetirements as retirements,
} from "@informach/db/schema";
import type { configuracaoDoMonitorDeBackup } from "@/lib/backup-monitor-environment";
import { backupEstaAtual, type EvidenciaDoMonitor } from "./monitoramento";

/** Read-only operational evidence, with the database clock and both complete
 * destinations. It does not assert that a blob is still recoverable in S3. */
export async function conferirAtualidadeDoBackup(
  config: NonNullable<ReturnType<typeof configuracaoDoMonitorDeBackup>>,
) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set transaction read only`);
    await tx.execute(sql`select set_config('statement_timeout','3000ms',true),
      set_config('lock_timeout','1000ms',true),set_config('transaction_timeout','5000ms',true)`);
    const foto = config.fotografias,
      arquivo = config.arquivos;
    const destino = sql`c.bucket_id=${foto.bucketId} and c.bucket_name=${foto.bucketName}
      and c.storage_scope=${foto.escopo} and c.protocol_version=1`;
    const publicado = sql`p.bucket_id=${arquivo.bucketId} and p.bucket_name=${arquivo.bucketName}
      and p.storage_scope=${arquivo.escopo}`;
    const [evidencia] = await tx.execute<EvidenciaDoMonitor>(sql`
      select
        (select extract(epoch from clock_timestamp()-max(c.captured_at))::double precision
          from ${captures} c join ${publications} p on p.capture_id=c.id
          where ${destino} and ${publicado} and c.state='verified' and p.state='published'
          and not exists(select 1 from ${retirements} r where r.capture_id=c.id)) as "idadeCapturaSegundos",
        extract(epoch from clock_timestamp()-j.started_at)::double precision as "idadeExecucaoSegundos",
        j.finished_at is not null as "execucaoTerminada", j.ok as "execucaoOk",
        exists(select 1 from ${captures} c left join ${publications} p on p.capture_id=c.id
          left join ${retirements} r on r.capture_id=c.id
          where ${destino} and (
            c.state='review' or
            (r.capture_id is not null and r.state<>'absent' and r.created_at<clock_timestamp()-interval '15 minutes') or
            (r.capture_id is null and c.state<>'abandoned' and c.created_at<clock_timestamp()-interval '15 minutes'
              and (c.state<>'verified' or p.capture_id is null or p.state<>'published' or not (${publicado})))
          )) as pendencias
      from (select 1) singleton left join lateral (
        select started_at,finished_at,ok from ${jobRuns}
        where app='recreio' and job='backup' order by started_at desc,id desc limit 1
      ) j on true
    `);
    return evidencia !== undefined && backupEstaAtual(evidencia, config.idadeMaximaSegundos);
  });
}
