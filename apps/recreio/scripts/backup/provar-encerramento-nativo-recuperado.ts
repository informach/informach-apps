import { isDeepStrictEqual } from "node:util";
import type postgres from "postgres";
import { admitirEncerramentoNativoHistoricoRecuperado } from "../../src/features/direitos/admissao-recuperada-repository";
import {
  type CoordenacaoDeEfeitos,
  comCoordenacaoPrivadaDeDireitos,
  comOperacaoPrivadaDeDireitos,
} from "../../src/features/direitos/coordenacao-repository";
import { concluirProximoEncerramento } from "../../src/features/direitos/encerramento-conta-repository";
import { AppError } from "../../src/lib/errors";
import { comConexaoPrivadaDeDireitos } from "./conexao-direitos";
import { inventariarBackup } from "./inventario";
import { provarVerificacaoDeEncerramento } from "./provar-verificacao-encerramento";
import { exigir } from "./provas-arquivos";
import type { RetiradaNativaDeProva } from "./retirada-nativa-prova-contrato";

/** First closed native replay profile: original payer without player subjects.
 * The finance record was confirmed before the archive and freshly assessed
 * in this run. No new account, consent, provider mutation or traffic is made. */
export async function provarEncerramentoNativoRecuperado(
  copia: postgres.Sql,
  config: Omit<Parameters<typeof comCoordenacaoPrivadaDeDireitos>[0], "banco" | "executar">,
  dado: RetiradaNativaDeProva["financeiro"],
) {
  exigir(
    process.env.CI === "true" &&
      process.env.GITHUB_ACTIONS === "true" &&
      !process.env.DATABASE_URL &&
      !process.env.STRIPE_SECRET_KEY,
    "EXECUTOR_FORA_DO_ESCOPO",
  );
  const alvo = dado.anterior;
  const lerOrigem = () =>
    copia.unsafe(
      `select
    to_jsonb(o)-array['state','completed_at','attempts','next_attempt_at','updated_at','lease_token','lease_until'] as operacao,
    to_jsonb(p) as preparacao,to_jsonb(f) as financeiro,
    (select count(*) from audit.events where actor_id=$2 and event_type='recreio.rights_consented') as consentimentos
    from recreio.rights_operations o join recreio.rights_preparations p on p.id=o.preparation_id
    join recreio.account_closure_finances f on f.operation_id=o.id where o.id=$1 and o.requester_user_id=$2`,
      [alvo.operacaoId, alvo.contaId],
    );
  const lerOutros = () =>
    copia.unsafe(
      `select
    (select jsonb_agg(to_jsonb(p) order by user_id) from recreio.native_pins p where p.user_id<>$1) as pins,
    (select jsonb_agg(to_jsonb(o) order by id) from recreio.rights_operations o where o.id<>$2) as operacoes,
    (select jsonb_agg(to_jsonb(p) order by user_id) from recreio.account_participations p where p.user_id<>$1) as participacoes`,
      [alvo.contaId, alvo.operacaoId],
    );
  const origem = await lerOrigem(),
    outros = await lerOutros();
  const inventarioAntes = await copia.begin(
    "isolation level repeatable read read only",
    inventariarBackup,
  );
  const [antes] = await copia.unsafe<{ valida: boolean }[]>(
    `select
    o.state='admitted' and p.state='closing' and p.revision=2 and o.completed_at is null
    and exists(select 1 from recreio.native_pins n where n.user_id=$2)
    and exists(select 1 from recreio.native_pins n where n.user_id=$3)
    and not exists(select 1 from recreio.rights_subjects s where s.operation_id=o.id) as valida
    from recreio.rights_operations o join recreio.account_participations p on p.operation_id=o.id where o.id=$1::uuid`,
    [alvo.operacaoId, alvo.contaId, dado.provedor.contaId],
  );
  exigir(origem.length === 1 && antes?.valida, "ENCERRAMENTO_NATIVO_DIVERGENTE");
  let concluida: CoordenacaoDeEfeitos | undefined;
  let verificacao: Awaited<ReturnType<typeof provarVerificacaoDeEncerramento>> | undefined;
  await comConexaoPrivadaDeDireitos(copia, (banco) =>
    comCoordenacaoPrivadaDeDireitos({
      ...config,
      banco,
      executar: async (pai) => {
        exigir(
          (await concluirProximoEncerramento(pai)).situacao === "ociosa",
          "ENCERRAMENTO_NATIVO_DIVERGENTE",
        );
        const primeira = await admitirEncerramentoNativoHistoricoRecuperado(pai, alvo.operacaoId);
        const pronta = await copia.unsafe(
          `select to_jsonb(e) as avaliacao from recreio.rights_recovery_evaluations e where run_id=$1 and operation_id=$2`,
          [config.execucaoId, alvo.operacaoId],
        );
        const segunda = await admitirEncerramentoNativoHistoricoRecuperado(pai, alvo.operacaoId);
        exigir(
          primeira.situacao === "existente_nativa" &&
            segunda.situacao === "existente_nativa" &&
            isDeepStrictEqual(
              pronta,
              await copia.unsafe(
                `select to_jsonb(e) as avaliacao from recreio.rights_recovery_evaluations e where run_id=$1 and operation_id=$2`,
                [config.execucaoId, alvo.operacaoId],
              ),
            ),
          "ENCERRAMENTO_NATIVO_DIVERGENTE",
        );
        await comOperacaoPrivadaDeDireitos(pai, alvo.operacaoId, async (filha) => {
          concluida = filha;
          let copiaRecusada = false;
          try {
            await concluirProximoEncerramento({ ...filha });
          } catch (erro) {
            if (!(erro instanceof AppError) || erro.code !== "DIREITOS_LIVRO") throw erro;
            copiaRecusada = true;
          }
          exigir(copiaRecusada, "ENCERRAMENTO_NATIVO_DIVERGENTE");
          const retirar = await concluirProximoEncerramento(filha);
          exigir(
            retirar.situacao === "dados_da_conta_retirados" &&
              retirar.dominio === "pin_conta" &&
              retirar.quantidade === 1 &&
              retirar.operacaoId === alvo.operacaoId,
            "ENCERRAMENTO_NATIVO_DIVERGENTE",
          );
          exigir(
            (await concluirProximoEncerramento(filha)).situacao === "conta_encerrada",
            "ENCERRAMENTO_NATIVO_DIVERGENTE",
          );
          const fechada = await copia.unsafe(
            `select to_jsonb(o) as operacao,to_jsonb(p) as participacao from recreio.rights_operations o join recreio.account_participations p on p.operation_id=o.id where o.id=$1`,
            [alvo.operacaoId],
          );
          exigir(
            (await concluirProximoEncerramento(filha)).situacao === "ociosa" &&
              isDeepStrictEqual(
                fechada,
                await copia.unsafe(
                  `select to_jsonb(o) as operacao,to_jsonb(p) as participacao from recreio.rights_operations o join recreio.account_participations p on p.operation_id=o.id where o.id=$1`,
                  [alvo.operacaoId],
                ),
              ),
            "ENCERRAMENTO_NATIVO_DIVERGENTE",
          );
        });
        verificacao = await provarVerificacaoDeEncerramento(pai, copia, alvo.operacaoId);
      },
    }),
  );
  exigir(concluida && verificacao, "ENCERRAMENTO_NATIVO_DIVERGENTE");
  let expirada = false;
  try {
    await concluirProximoEncerramento(concluida);
  } catch (erro) {
    if (!(erro instanceof AppError) || erro.code !== "DIREITOS_LIVRO") throw erro;
    expirada = true;
  }
  exigir(
    expirada &&
      isDeepStrictEqual(origem, await lerOrigem()) &&
      isDeepStrictEqual(outros, await lerOutros()),
    "ENCERRAMENTO_NATIVO_DIVERGENTE",
  );
  const inventarioDepois = await copia.begin(
    "isolation level repeatable read read only",
    inventariarBackup,
  );
  const permitidas = new Set([
    "rights_operations",
    "rights_recovery_evaluations",
    "account_participations",
    "native_pins",
  ]);
  const preservadas = (i: typeof inventarioAntes) =>
    i.tabelas.filter(
      (t) => t.schema !== "audit" && (t.schema !== "recreio" || !permitidas.has(t.nome)),
    );
  exigir(
    isDeepStrictEqual(preservadas(inventarioAntes), preservadas(inventarioDepois)) &&
      isDeepStrictEqual(inventarioAntes.globais, inventarioDepois.globais) &&
      isDeepStrictEqual(inventarioAntes.estrutura, inventarioDepois.estrutura),
    "ENCERRAMENTO_NATIVO_DIVERGENTE",
  );
  const [depois] = await copia.unsafe<{ valida: boolean }[]>(
    `select
    o.state='completed' and o.completed_at is not null and o.lease_token is null and o.lease_until is null
    and p.state='closed' and p.revision=3 and p.closed_at=o.completed_at
    and not exists(select 1 from recreio.native_pins n where n.user_id=$2)
    and exists(select 1 from recreio.native_pins n where n.user_id=$3)
    and (select count(*) from audit.events where event_type='recreio.account_closure_completed' and payload->>'operationId'=$1::text)=1 as valida
    from recreio.rights_operations o join recreio.account_participations p on p.operation_id=o.id where o.id=$1::uuid`,
    [alvo.operacaoId, alvo.contaId, dado.provedor.contaId],
  );
  exigir(depois?.valida, "ENCERRAMENTO_NATIVO_DIVERGENTE");
  return {
    ...verificacao,
    nativeZeroPlayerClosureReplayed: true,
    nativeZeroPlayerClosureGlobalRecordsPreserved: true,
    nativeZeroPlayerClosureOriginalConsentPreserved: true,
    nativeZeroPlayerClosureFinancialConfirmationPreserved: true,
    nativeZeroPlayerClosureOwnPinRemoved: true,
    nativeZeroPlayerClosureOtherAccountPreserved: true,
    nativeZeroPlayerClosureRetryIdempotent: true,
    nativeZeroPlayerClosureNoNewConsent: true,
    nativeZeroPlayerClosureDataScopeExpired: true,
  };
}
