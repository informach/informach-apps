import { isDeepStrictEqual } from "node:util";
import type postgres from "postgres";
import { admitirEncerramentoNativoHistoricoRecuperado } from "../../src/features/direitos/admissao-recuperada-repository";
import {
  comCoordenacaoPrivadaDeDireitos,
  comFinanceiroPrivadoDeEncerramento,
  comOperacaoPrivadaDeDireitos,
} from "../../src/features/direitos/coordenacao-repository";
import { concluirProximoEncerramento } from "../../src/features/direitos/encerramento-conta-repository";
import { criarProcessadorFinanceiroRecuperado } from "../../src/features/direitos/encerramento-financeiro-execucao-service";
import { avaliarFinanceiroConfirmadoRecuperado } from "../../src/features/direitos/encerramento-financeiro-recuperado-service";
import { confirmarPublicacaoDeEncerramentoRecuperada } from "../../src/features/direitos/publicacao-encerramento-recuperada-repository";
import { verificarEncerramentoNativoRecuperado } from "../../src/features/direitos/verificacao-recuperada-repository";
import { AppError } from "../../src/lib/errors";
import { comConexaoPrivadaDeDireitos } from "./conexao-direitos";
import { exigir } from "./provas-arquivos";
import type { RetiradaNativaDeProva } from "./retirada-nativa-prova-contrato";

/** Native closure appended before capture but SQL confirmation interrupted.
 * Publication, original financial retry, current assessment and data admission
 * remain separate durable phases. Only synthetic no-customer data is used. */
export async function provarPublicacaoDeEncerramento(
  copia: postgres.Sql,
  config: Omit<Parameters<typeof comCoordenacaoPrivadaDeDireitos>[0], "banco" | "executar">,
  dado: RetiradaNativaDeProva["financeiro"]["publicacaoPendente"],
) {
  const ler = () =>
    copia.unsafe(
      `select to_jsonb(o) as operacao,to_jsonb(p) as preparacao,to_jsonb(f) as financeiro,to_jsonb(a) as participacao,to_jsonb(e) as avaliacao from recreio.rights_operations o join recreio.rights_preparations p on p.id=o.preparation_id join recreio.account_closure_finances f on f.operation_id=o.id join recreio.account_participations a on a.operation_id=o.id join recreio.rights_recovery_evaluations e on e.operation_id=o.id and e.run_id=$2 where o.id=$1`,
      [dado.operacaoId, config.execucaoId],
    );
  const lerHistorico = () =>
    copia.unsafe(
      `select
    (select to_jsonb(o)-array['state','admitted_head_sha256','admitted_at','lease_token','lease_until','attempts','next_attempt_at','updated_at','completed_at'] from recreio.rights_operations o where o.id=$1) as operacao,
    (select to_jsonb(p) from recreio.rights_preparations p join recreio.rights_operations o on o.preparation_id=p.id where o.id=$1) as preparacao,
    (select jsonb_agg(to_jsonb(f) order by operation_id) from recreio.account_closure_finances f where operation_id<>$1::uuid) as outros_financeiros,
    (select jsonb_agg(to_jsonb(u) order by id) from core.users u) as identidades`,
      [dado.operacaoId],
    );
  const antes = await ler(),
    historico = await lerHistorico();
  const [inicial] = await copia.unsafe<{ valida: boolean }[]>(
    `select o.state='publishing' and o.admitted_at is null and o.admitted_head_sha256 is null and f.state='pending' and f.attempts=0 and a.state='closing' and a.revision=2 and e.state='staged' and e.ready_at is null as valida from recreio.rights_operations o join recreio.account_closure_finances f on f.operation_id=o.id join recreio.account_participations a on a.operation_id=o.id join recreio.rights_recovery_evaluations e on e.operation_id=o.id and e.run_id=$2 where o.id=$1`,
    [dado.operacaoId, config.execucaoId],
  );
  exigir(antes.length === 1 && inicial?.valida, "PUBLICACAO_ENCERRAMENTO_DIVERGENTE");
  async function recusada(
    executar: () => Promise<unknown>,
    codigo: "DIREITOS_LIVRO" | "DIREITOS_INTEGRIDADE",
  ) {
    let recusou = false;
    try {
      await executar();
    } catch (e) {
      if (!(e instanceof AppError) || e.code !== codigo) throw e;
      recusou = true;
    }
    exigir(recusou, "PUBLICACAO_ENCERRAMENTO_DIVERGENTE");
  }
  await comConexaoPrivadaDeDireitos(copia, (banco) =>
    comCoordenacaoPrivadaDeDireitos({
      ...config,
      banco,
      executar: async (pai) => {
        const id = dado.operacaoId;
        await recusada(
          () => confirmarPublicacaoDeEncerramentoRecuperada({ ...pai }, id),
          "DIREITOS_LIVRO",
        );
        await recusada(
          () =>
            comFinanceiroPrivadoDeEncerramento(pai, id, async () => {
              throw new Error("Pending publication admitted finance");
            }),
          "DIREITOS_INTEGRIDADE",
        );
        await recusada(
          () =>
            comOperacaoPrivadaDeDireitos(pai, id, async () => {
              throw new Error("Pending publication admitted data");
            }),
          "DIREITOS_INTEGRIDADE",
        );
        const [livre] = await copia.unsafe<{ livre: boolean }[]>(
          `select to_regprocedure('audit.recusar_publicacao_encerramento_recuperado()') is null and not exists(select 1 from pg_trigger where tgname='recusar_publicacao_encerramento_recuperado') as livre`,
        );
        exigir(livre?.livre, "PUBLICACAO_ENCERRAMENTO_DIVERGENTE");
        await copia.begin(async (tx) => {
          await tx.unsafe(
            `create function audit.recusar_publicacao_encerramento_recuperado() returns trigger language plpgsql as $$ begin if new.event_type='recreio.rights_admitted' then raise exception using errcode='P7781',message='Synthetic recovered closure publication audit failure'; end if; return new; end $$`,
          );
          await tx.unsafe(
            `create trigger recusar_publicacao_encerramento_recuperado before insert on audit.events for each row execute function audit.recusar_publicacao_encerramento_recuperado()`,
          );
        });
        try {
          let recusou = false;
          try {
            await confirmarPublicacaoDeEncerramentoRecuperada(pai, id);
          } catch (erro) {
            let atual: unknown = erro;
            for (let n = 0; n < 8; n++) {
              if (atual && typeof atual === "object" && "code" in atual && atual.code === "P7781") {
                recusou = true;
                break;
              }
              if (!(atual instanceof Error) || !atual.cause) break;
              atual = atual.cause;
            }
            if (!recusou) throw erro;
          }
          exigir(
            recusou && isDeepStrictEqual(antes, await ler()),
            "PUBLICACAO_ENCERRAMENTO_DIVERGENTE",
          );
        } finally {
          await copia.begin(async (tx) => {
            await tx.unsafe(
              `drop trigger recusar_publicacao_encerramento_recuperado on audit.events`,
            );
            await tx.unsafe(`drop function audit.recusar_publicacao_encerramento_recuperado()`);
          });
        }
        const primeira = await confirmarPublicacaoDeEncerramentoRecuperada(pai, id),
          admitida = await ler();
        const segunda = await confirmarPublicacaoDeEncerramentoRecuperada(pai, id);
        exigir(
          !primeira.jaConfirmada &&
            !primeira.dadosAdmitidos &&
            segunda.jaConfirmada &&
            isDeepStrictEqual(admitida, await ler()),
          "PUBLICACAO_ENCERRAMENTO_DIVERGENTE",
        );
        await recusada(
          () => admitirEncerramentoNativoHistoricoRecuperado(pai, id),
          "DIREITOS_INTEGRIDADE",
        );
        await recusada(
          () =>
            comOperacaoPrivadaDeDireitos(pai, id, async () => {
              throw new Error("Publication alone admitted data");
            }),
          "DIREITOS_INTEGRIDADE",
        );
        await comFinanceiroPrivadoDeEncerramento(pai, id, async (financeira) => {
          const runtime = () => {
            throw new Error("No-customer pending closure must not compose Stripe");
          };
          const processar = criarProcessadorFinanceiroRecuperado(financeira, runtime);
          exigir(
            (await processar()).situacao === "confirmada" &&
              (await processar()).situacao === "ociosa",
            "PUBLICACAO_ENCERRAMENTO_DIVERGENTE",
          );
          exigir(
            (await avaliarFinanceiroConfirmadoRecuperado(financeira, runtime)).resultado ===
              "no_customer",
            "PUBLICACAO_ENCERRAMENTO_DIVERGENTE",
          );
        });
        exigir(
          (await admitirEncerramentoNativoHistoricoRecuperado(pai, id)).situacao ===
            "existente_nativa",
          "PUBLICACAO_ENCERRAMENTO_DIVERGENTE",
        );
        await comOperacaoPrivadaDeDireitos(pai, id, async (filha) => {
          const lote = await concluirProximoEncerramento(filha);
          exigir(
            lote.situacao === "dados_da_conta_retirados" &&
              lote.dominio === "pin_conta" &&
              lote.quantidade === 1 &&
              (await concluirProximoEncerramento(filha)).situacao === "conta_encerrada",
            "PUBLICACAO_ENCERRAMENTO_DIVERGENTE",
          );
        });
        exigir(
          !(await verificarEncerramentoNativoRecuperado(pai, id)).jaVerificada,
          "PUBLICACAO_ENCERRAMENTO_DIVERGENTE",
        );
      },
    }),
  );
  exigir(isDeepStrictEqual(historico, await lerHistorico()), "PUBLICACAO_ENCERRAMENTO_DIVERGENTE");
  const [fim] = await copia.unsafe<{ valida: boolean }[]>(
    `select o.state='completed' and o.preparation_id is not null and o.recovery_source_id is null and f.state='confirmed' and f.attempts=1 and f.result='no_customer' and f.created_at=o.consented_at and p.state='closed' and p.revision=3 and p.closed_at=o.completed_at and e.state='verified' and (select count(*) from audit.events a where a.event_type='recreio.rights_admitted' and a.payload->>'operationId'=o.id::text)=1 and (select count(*) from audit.events a where a.event_type='recreio.account_closure_finance_confirmed' and a.payload->>'operationId'=o.id::text)=1 as valida from recreio.rights_operations o join recreio.account_closure_finances f on f.operation_id=o.id join recreio.account_participations p on p.operation_id=o.id join recreio.rights_recovery_evaluations e on e.operation_id=o.id and e.run_id=$2 where o.id=$1`,
    [dado.operacaoId, config.execucaoId],
  );
  exigir(fim?.valida, "PUBLICACAO_ENCERRAMENTO_DIVERGENTE");
  return {
    nativeClosurePendingPublicationReconciled: true,
    nativeClosurePendingPublicationAuditRollback: true,
    nativeClosurePendingPublicationRetryIdempotent: true,
    nativeClosurePendingPublicationFinancialRetryVerified: true,
    nativeClosurePendingPublicationRequiresFinancialAssessment: true,
    nativeClosurePendingPublicationOriginalConsentPreserved: true,
    nativeClosurePendingPublicationOtherFinancesAndIdentityPreserved: true,
    nativeClosurePendingPublicationDataReplayVerified: true,
  };
}
