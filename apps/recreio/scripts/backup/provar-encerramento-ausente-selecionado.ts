import { isDeepStrictEqual } from "node:util";
import type postgres from "postgres";
import {
  comCoordenacaoPrivadaDeDireitos,
  comFinanceiroPrivadoDeEncerramento,
  comOperacaoPrivadaDeDireitos,
} from "../../src/features/direitos/coordenacao-repository";
import { prepararEncerramentoAusenteRecuperado } from "../../src/features/direitos/encerramento-ausente-recuperado-repository";
import { criarProcessadorFinanceiroRecuperado } from "../../src/features/direitos/encerramento-financeiro-execucao-service";
import { AppError } from "../../src/lib/errors";
import { comConexaoPrivadaDeDireitos } from "./conexao-direitos";
import { provarAuditoriaHistoricaAtomica } from "./provar-auditoria-historica";
import { provarEncerramentoSelecionadoRecuperado } from "./provar-encerramento-selecionado-recuperado";
import { exigir } from "./provas-arquivos";
import type { RetiradaNativaDeProva } from "./retirada-nativa-prova-contrato";

export async function provarEncerramentoAusenteSelecionado(
  copia: postgres.Sql,
  config: Omit<Parameters<typeof comCoordenacaoPrivadaDeDireitos>[0], "banco" | "executar">,
  dado: RetiradaNativaDeProva["financeiro"]["posteriorComSelecao"],
) {
  const ler = () =>
    copia.unsafe(
      `select
    (select to_jsonb(o) from recreio.rights_operations o where id=$1::uuid) as operacao,
    (select jsonb_agg(to_jsonb(e)) from recreio.rights_recovery_evaluations e where e.run_id=$2 and e.operation_id=$1::uuid) as avaliacao,
    (select to_jsonb(f) from recreio.account_closure_finances f where operation_id=$1::uuid) as financeiro,
    (select to_jsonb(p) from recreio.account_participations p where user_id=$3) as participacao,
    (select jsonb_agg(to_jsonb(s) order by profile_reference) from recreio.rights_subjects s where operation_id=$1::uuid) as sujeitos,
    (select jsonb_agg(to_jsonb(w) order by space_id) from recreio.rights_worlds w where operation_id=$1::uuid) as mundos,
    (select jsonb_agg(to_jsonb(p) order by id) from recreio.profiles p where id in ($4::uuid,$5::uuid)) as perfis,
    (select to_jsonb(w) from recreio.spaces w where id=$6::uuid) as mundo`,
      [
        dado.operacaoId,
        config.execucaoId,
        dado.contaId,
        ...dado.perfisSelecionados,
        dado.mundo.mundoId,
      ],
    );
  const antes = await ler();
  exigir(
    antes[0]?.operacao === null && antes[0]?.financeiro === null && antes[0]?.participacao === null,
    "ENCERRAMENTO_AUSENTE_SELECIONADO_DIVERGENTE",
  );
  await comConexaoPrivadaDeDireitos(copia, (banco) =>
    comCoordenacaoPrivadaDeDireitos({
      ...config,
      banco,
      executar: async (pai) => {
        async function exigirRevisao() {
          let recusou = false;
          try {
            await prepararEncerramentoAusenteRecuperado(pai, dado.operacaoId);
          } catch (e) {
            if (!(e instanceof AppError) || e.code !== "DIREITOS_DEPENDENCIA") throw e;
            recusou = true;
          }
          exigir(recusou, "ENCERRAMENTO_AUSENTE_SELECIONADO_DIVERGENTE");
        }
        const [outro] = await copia.unsafe<{ id: string }[]>(
          `select s.id from recreio.spaces s where s.id<>$1::uuid and not exists(select 1 from recreio.profile_world_traces t where t.profile_id=$2::uuid and t.space_id=s.id) order by s.id limit 1`,
          [dado.mundo.mundoId, dado.mundo.retiradoId],
        );
        exigir(outro, "ENCERRAMENTO_AUSENTE_SELECIONADO_DIVERGENTE");
        await copia.unsafe(
          `insert into recreio.profile_world_traces(profile_id,space_id) values($1::uuid,$2::uuid)`,
          [dado.mundo.retiradoId, outro.id],
        );
        try {
          await exigirRevisao();
        } finally {
          await copia.unsafe(
            `delete from recreio.profile_world_traces where profile_id=$1::uuid and space_id=$2::uuid`,
            [dado.mundo.retiradoId, outro.id],
          );
        }
        exigir(
          isDeepStrictEqual(antes, await ler()),
          "ENCERRAMENTO_AUSENTE_SELECIONADO_DIVERGENTE",
        );
        await copia.unsafe(
          `update recreio.spaces set steward_profile_id=$2::uuid where id=$1::uuid and steward_profile_id=$3::uuid`,
          [dado.mundo.mundoId, dado.mundo.retiradoId, dado.mundo.preservadoId],
        );
        try {
          await exigirRevisao();
        } finally {
          await copia.unsafe(
            `update recreio.spaces set steward_profile_id=$2::uuid where id=$1::uuid and steward_profile_id=$3::uuid`,
            [dado.mundo.mundoId, dado.mundo.preservadoId, dado.mundo.retiradoId],
          );
        }
        exigir(
          isDeepStrictEqual(antes, await ler()),
          "ENCERRAMENTO_AUSENTE_SELECIONADO_DIVERGENTE",
        );
        await provarAuditoriaHistoricaAtomica(
          copia,
          () => prepararEncerramentoAusenteRecuperado(pai, dado.operacaoId),
          ler,
        );
        exigir(
          !(await prepararEncerramentoAusenteRecuperado(pai, dado.operacaoId)).jaPreparada,
          "ENCERRAMENTO_AUSENTE_SELECIONADO_DIVERGENTE",
        );
        const preparada = await ler();
        exigir(
          (await prepararEncerramentoAusenteRecuperado(pai, dado.operacaoId)).jaPreparada &&
            isDeepStrictEqual(preparada, await ler()),
          "ENCERRAMENTO_AUSENTE_SELECIONADO_DIVERGENTE",
        );
        let recusou = false;
        try {
          await comOperacaoPrivadaDeDireitos(pai, dado.operacaoId, async () => {
            throw new Error("Historical selected closure admitted data before finance");
          });
        } catch (e) {
          if (!(e instanceof AppError) || e.code !== "DIREITOS_INTEGRIDADE") throw e;
          recusou = true;
        }
        exigir(recusou, "ENCERRAMENTO_AUSENTE_SELECIONADO_DIVERGENTE");
        await comFinanceiroPrivadoDeEncerramento(pai, dado.operacaoId, async (financeira) => {
          exigir(
            (
              await criarProcessadorFinanceiroRecuperado(financeira, () => {
                throw new Error("Historical no-customer family must not compose Stripe");
              })()
            ).situacao === "confirmada",
            "ENCERRAMENTO_AUSENTE_SELECIONADO_DIVERGENTE",
          );
        });
      },
    }),
  );
  const resultado = await provarEncerramentoSelecionadoRecuperado(copia, config, dado, "recovered");
  exigir(
    resultado.nativeSelectedClosureOpaqueDataRemoved === 6 &&
      resultado.nativeSelectedClosureWorldPhotosScrubbed === 2 &&
      resultado.nativeSelectedClosureWorldDiaryRecovered &&
      resultado.nativeSelectedClosureOriginalConsentPreserved &&
      resultado.nativeSelectedClosureFinancialConfirmationPreserved,
    "ENCERRAMENTO_AUSENTE_SELECIONADO_DIVERGENTE",
  );
  return {
    postCaptureSelectedClosureReplayed: true,
    postCaptureSelectedClosureAuditRollback: true,
    postCaptureSelectedClosurePreparationIdempotent: true,
    postCaptureSelectedClosureFinancialBarrierVerified: true,
    postCaptureSelectedClosureOpaqueDataRemoved: 6,
    postCaptureSelectedClosurePhotosScrubbed: 2,
    postCaptureSelectedClosureWorldAndOthersPreserved: true,
    postCaptureSelectedClosureOriginalConsentPreserved: true,
    postCaptureSelectedClosureExtraWorldRefused: true,
    postCaptureSelectedClosureStewardshipReviewRequired: true,
  };
}
