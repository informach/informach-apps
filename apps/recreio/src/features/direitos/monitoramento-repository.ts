import "server-only";
import { db, sql } from "@informach/db";
import { resumoDaFilaDeDireitos } from "./fila-repository";
import {
  type EvidenciaDaRotinaDeDireitos,
  processamentoDeDireitosEstaAtual,
} from "./monitoramento";
import { nomeDaRotinaDeDireitos } from "./rotina";

export async function conferirAtualidadeDosDireitos(config: {
  livroId: string;
  idadeMaximaSegundos: number;
}) {
  const nome = nomeDaRotinaDeDireitos(config.livroId);
  return db.transaction(async (tx) => {
    await tx.execute(sql`set transaction isolation level repeatable read read only`);
    await tx.execute(sql`select set_config('statement_timeout','3000ms',true),
      set_config('lock_timeout','1000ms',true),set_config('transaction_timeout','5000ms',true)`);
    const fila = await resumoDaFilaDeDireitos(config.livroId, tx);
    const [ultima] = await tx.execute<EvidenciaDaRotinaDeDireitos>(sql`select
      extract(epoch from clock_timestamp()-started_at)::double precision as "idadeExecucaoSegundos",
      finished_at is not null as "execucaoTerminada",ok as "execucaoOk",summary as resumo
      from ops.job_runs where app='recreio' and job=${nome} order by started_at desc,id desc limit 1`);
    return (
      ultima !== undefined &&
      processamentoDeDireitosEstaAtual(ultima, fila, config.idadeMaximaSegundos)
    );
  });
}
