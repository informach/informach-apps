import { isDeepStrictEqual } from "node:util";
import type postgres from "postgres";
import {
  type CoordenacaoDeEfeitos,
  dadosDaCoordenacaoPrivada,
} from "../../src/features/direitos/coordenacao-repository";
import { verificarEncerramentoNativoRecuperado } from "../../src/features/direitos/verificacao-recuperada-repository";
import { exigir } from "./provas-arquivos";

/** Actual PG audit failure at the native closure verification commit. The
 * operation is already closed; only its current recovery evaluation advances. */
export async function provarVerificacaoDeEncerramento(
  pai: CoordenacaoDeEfeitos,
  copia: postgres.Sql,
  operacaoId: string,
) {
  const dados = dadosDaCoordenacaoPrivada(pai);
  const ler = () =>
    copia.unsafe(
      `select to_jsonb(e) as avaliacao from recreio.rights_recovery_evaluations e where run_id=$1 and operation_id=$2`,
      [dados.execucaoId, operacaoId],
    );
  const antes = await ler();
  const [livre] = await copia.unsafe<{ livre: boolean }[]>(
    `select to_regprocedure('audit.recusar_verificacao_encerramento()') is null and not exists(select 1 from pg_trigger where tgname='recusar_verificacao_encerramento') as livre`,
  );
  exigir(antes.length === 1 && livre?.livre, "VERIFICACAO_ENCERRAMENTO_DIVERGENTE");
  await copia.begin(async (tx) => {
    await tx.unsafe(
      `create function audit.recusar_verificacao_encerramento() returns trigger language plpgsql as $$ begin if new.event_type='recreio.rights_recovery_operation_verified' and new.payload->>'kind'='encerrar_conta' then raise exception using errcode='P7778',message='Synthetic closure verification audit failure'; end if; return new; end $$`,
    );
    await tx.unsafe(
      `create trigger recusar_verificacao_encerramento before insert on audit.events for each row execute function audit.recusar_verificacao_encerramento()`,
    );
  });
  try {
    let recusada = false;
    try {
      await verificarEncerramentoNativoRecuperado(pai, operacaoId);
    } catch (erro) {
      let atual: unknown = erro,
        reconhecida = false;
      for (let n = 0; n < 8; n++) {
        if (atual && typeof atual === "object" && "code" in atual && atual.code === "P7778") {
          reconhecida = true;
          break;
        }
        if (!(atual instanceof Error) || !atual.cause) break;
        atual = atual.cause;
      }
      if (!reconhecida) throw erro;
      recusada = true;
    }
    exigir(
      recusada && isDeepStrictEqual(antes, await ler()),
      "VERIFICACAO_ENCERRAMENTO_DIVERGENTE",
    );
  } finally {
    await copia.begin(async (tx) => {
      await tx.unsafe(`drop trigger recusar_verificacao_encerramento on audit.events`);
      await tx.unsafe(`drop function audit.recusar_verificacao_encerramento()`);
    });
  }
  const primeira = await verificarEncerramentoNativoRecuperado(pai, operacaoId),
    verificada = await ler();
  const segunda = await verificarEncerramentoNativoRecuperado(pai, operacaoId);
  exigir(
    primeira.situacao === "verificada" &&
      !primeira.jaVerificada &&
      segunda.jaVerificada &&
      isDeepStrictEqual(verificada, await ler()),
    "VERIFICACAO_ENCERRAMENTO_DIVERGENTE",
  );
  return {
    nativeZeroPlayerClosureReadinessVerified: true,
    nativeZeroPlayerClosureVerificationIdempotent: true,
    nativeClosureOperationVerificationAuditRollback: true,
  };
}
