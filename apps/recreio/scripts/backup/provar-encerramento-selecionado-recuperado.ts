import { isDeepStrictEqual } from "node:util";
import type postgres from "postgres";
import { admitirEncerramentoNativoHistoricoRecuperado } from "../../src/features/direitos/admissao-recuperada-repository";
import {
  comCoordenacaoPrivadaDeDireitos,
  comFinanceiroPrivadoDeEncerramento,
  comOperacaoPrivadaDeDireitos,
} from "../../src/features/direitos/coordenacao-repository";
import { retirarProximosDadosPessoais } from "../../src/features/direitos/dados-retirada-repository";
import { concluirProximaDrenagem } from "../../src/features/direitos/drenagem-repository";
import { concluirProximoEncerramento } from "../../src/features/direitos/encerramento-conta-repository";
import { avaliarFinanceiroConfirmadoRecuperado } from "../../src/features/direitos/encerramento-financeiro-recuperado-service";
import { liberarProximoMundoDeDireitos } from "../../src/features/direitos/liberacao-mundo-repository";
import { minimizarProximoPerfil } from "../../src/features/direitos/minimizacao-repository";
import { expurgarProximaReferencia } from "../../src/features/direitos/referencias-retidas-repository";
import { verificarEncerramentoNativoRecuperado } from "../../src/features/direitos/verificacao-recuperada-repository";
import { AppError } from "../../src/lib/errors";
import { comConexaoPrivadaDeDireitos } from "./conexao-direitos";
import { inventariarBackup } from "./inventario";
import { exigir } from "./provas-arquivos";
import type { RetiradaNativaDeProva } from "./retirada-nativa-prova-contrato";

/** Actual native adult/minor selection, responsibilities and opaque data in
 * the restored cluster. No world is selected in this case. Original consent
 * and financial confirmation survive; this is not full traffic recovery. */
export async function provarEncerramentoSelecionadoRecuperado(
  copia: postgres.Sql,
  config: Omit<Parameters<typeof comCoordenacaoPrivadaDeDireitos>[0], "banco" | "executar">,
  dado: RetiradaNativaDeProva["financeiro"],
) {
  const [p0, p1] = [...dado.perfisSelecionados].sort();
  exigir(
    p0 && p1 && p0 !== p1 && !process.env.DATABASE_URL && !process.env.STRIPE_SECRET_KEY,
    "ENCERRAMENTO_SELECIONADO_DIVERGENTE",
  );
  const parametros = [dado.operacaoId, dado.contaId, p0, p1];
  const lerOrigem = () =>
    copia.unsafe(
      `select to_jsonb(o)-array['state','completed_at','attempts','next_attempt_at','updated_at','lease_token','lease_until'] as operacao,to_jsonb(p) as preparacao,to_jsonb(f) as financeiro,
    (select count(*) from audit.events where actor_id=$2 and event_type='recreio.rights_consented') as consentimentos
    from recreio.rights_operations o join recreio.rights_preparations p on p.id=o.preparation_id join recreio.account_closure_finances f on f.operation_id=o.id
    where o.id=$1::uuid and o.requester_user_id=$2`,
      [dado.operacaoId, dado.contaId],
    );
  const lerOutros = () =>
    copia.unsafe(
      `select
    (select jsonb_agg(to_jsonb(p) order by id) from recreio.profiles p where p.id not in ($1::uuid,$2::uuid)) as perfis,
    (select jsonb_agg(to_jsonb(k) order by id) from recreio.profile_data_keys k where k.profile_id not in ($1::uuid,$2::uuid)) as chaves,
    (select jsonb_agg(to_jsonb(v) order by id) from recreio.profile_data_versions v where v.profile_id not in ($1::uuid,$2::uuid)) as dados,
    (select jsonb_agg(to_jsonb(a) order by id) from recreio.profile_achievements a where a.profile_id not in ($1::uuid,$2::uuid)) as conquistas,
    (select jsonb_agg(to_jsonb(g) order by id) from recreio.guardian_links g where g.profile_id not in ($1::uuid,$2::uuid)) as responsabilidades`,
      [p0, p1],
    );
  const origem = await lerOrigem(),
    outros = await lerOutros();
  const inventarioAntes = await copia.begin(
    "isolation level repeatable read read only",
    inventariarBackup,
  );
  const [antes] = await copia.unsafe<{ valida: boolean }[]>(
    `select
    o.state='admitted' and f.state='confirmed' and f.result='no_customer' and p.state='closing' and p.revision=2
    and (select count(*) from recreio.rights_subjects s where s.operation_id=o.id and s.profile_reference in ($3::uuid,$4::uuid) and s.phase='selected')=2
    and (select count(*) from recreio.profiles r where r.id in ($3::uuid,$4::uuid) and r.kind='adult' and r.user_id=$2)=1
    and (select count(*) from recreio.profiles r join recreio.guardian_links g on g.profile_id=r.id where r.id in ($3::uuid,$4::uuid) and r.kind='minor' and g.guardian_user_id=$2)=1
    and (select count(*) from recreio.profile_data_keys k where k.profile_id in ($3::uuid,$4::uuid))=2
    and (select count(*) from recreio.profile_data_versions v where v.profile_id in ($3::uuid,$4::uuid))=2
    and (select count(*) from recreio.profile_achievements a where a.profile_id in ($3::uuid,$4::uuid))=2
    and not exists(select 1 from recreio.rights_worlds w where w.operation_id=o.id) as valida
    from recreio.rights_operations o join recreio.account_closure_finances f on f.operation_id=o.id join recreio.account_participations p on p.operation_id=o.id where o.id=$1::uuid`,
    parametros,
  );
  exigir(origem.length === 1 && antes?.valida, "ENCERRAMENTO_SELECIONADO_DIVERGENTE");
  let removidas = 0,
    concluida = false;
  await comConexaoPrivadaDeDireitos(copia, (banco) =>
    comCoordenacaoPrivadaDeDireitos({
      ...config,
      banco,
      executar: async (pai) => {
        await comFinanceiroPrivadoDeEncerramento(pai, dado.operacaoId, async (financeira) => {
          const atual = await avaliarFinanceiroConfirmadoRecuperado(financeira, () => {
            throw new Error("No-customer native selection must not compose Stripe");
          });
          exigir(atual.resultado === "no_customer", "ENCERRAMENTO_SELECIONADO_DIVERGENTE");
        });
        let semAdmissao = false;
        try {
          await comOperacaoPrivadaDeDireitos(pai, dado.operacaoId, async () => {
            throw new Error("Financial receipt admitted selection without data readiness");
          });
        } catch (erro) {
          if (!(erro instanceof AppError) || erro.code !== "DIREITOS_INTEGRIDADE") throw erro;
          semAdmissao = true;
        }
        exigir(semAdmissao, "ENCERRAMENTO_SELECIONADO_DIVERGENTE");
        exigir(
          (await admitirEncerramentoNativoHistoricoRecuperado(pai, dado.operacaoId)).situacao ===
            "existente_nativa",
          "ENCERRAMENTO_SELECIONADO_DIVERGENTE",
        );
        await comOperacaoPrivadaDeDireitos(pai, dado.operacaoId, async (filha) => {
          for (let n = 0; n < 24; n++) {
            await concluirProximaDrenagem(filha);
            const dados = await retirarProximosDadosPessoais(filha);
            if (dados.situacao === "dados_removidos") removidas += dados.quantidade;
            await minimizarProximoPerfil(filha);
            await liberarProximoMundoDeDireitos(filha);
            await expurgarProximaReferencia(filha);
            if ((await concluirProximoEncerramento(filha)).situacao === "conta_encerrada") {
              concluida = true;
              break;
            }
          }
          exigir(concluida && removidas === 6, "ENCERRAMENTO_SELECIONADO_DIVERGENTE");
          const fechada = await copia.unsafe(
            `select to_jsonb(o) as operacao,to_jsonb(p) as participacao from recreio.rights_operations o join recreio.account_participations p on p.operation_id=o.id where o.id=$1::uuid`,
            [dado.operacaoId],
          );
          exigir(
            (await concluirProximoEncerramento(filha)).situacao === "ociosa" &&
              isDeepStrictEqual(
                fechada,
                await copia.unsafe(
                  `select to_jsonb(o) as operacao,to_jsonb(p) as participacao from recreio.rights_operations o join recreio.account_participations p on p.operation_id=o.id where o.id=$1::uuid`,
                  [dado.operacaoId],
                ),
              ),
            "ENCERRAMENTO_SELECIONADO_DIVERGENTE",
          );
        });
        const primeira = await verificarEncerramentoNativoRecuperado(pai, dado.operacaoId);
        const lerAvaliacao = () =>
          copia.unsafe(
            `select to_jsonb(e) as avaliacao from recreio.rights_recovery_evaluations e where run_id=$1 and operation_id=$2`,
            [config.execucaoId, dado.operacaoId],
          );
        const verificada = await lerAvaliacao();
        const segunda = await verificarEncerramentoNativoRecuperado(pai, dado.operacaoId);
        exigir(
          !primeira.jaVerificada &&
            segunda.jaVerificada &&
            isDeepStrictEqual(verificada, await lerAvaliacao()),
          "ENCERRAMENTO_SELECIONADO_DIVERGENTE",
        );
      },
    }),
  );
  exigir(
    isDeepStrictEqual(origem, await lerOrigem()) && isDeepStrictEqual(outros, await lerOutros()),
    "ENCERRAMENTO_SELECIONADO_DIVERGENTE",
  );
  const inventarioDepois = await copia.begin(
    "isolation level repeatable read read only",
    inventariarBackup,
  );
  const preservadas = (i: typeof inventarioAntes) =>
    i.tabelas.filter(
      (t) =>
        t.schema !== "audit" &&
        (t.schema !== "recreio" ||
          [
            "spaces",
            "space_snapshots",
            "space_journal",
            "space_members",
            "profile_world_traces",
          ].includes(t.nome)),
    );
  exigir(
    isDeepStrictEqual(preservadas(inventarioAntes), preservadas(inventarioDepois)) &&
      isDeepStrictEqual(inventarioAntes.globais, inventarioDepois.globais) &&
      isDeepStrictEqual(inventarioAntes.estrutura, inventarioDepois.estrutura),
    "ENCERRAMENTO_SELECIONADO_DIVERGENTE",
  );
  const [depois] = await copia.unsafe<{ valida: boolean }[]>(
    `select o.state='completed' and o.completed_at is not null and p.state='closed' and p.revision=3 and p.closed_at=o.completed_at
    and not exists(select 1 from recreio.rights_subjects s where s.operation_id=o.id and s.phase not in ('minimized','removed'))
    and not exists(select 1 from recreio.profiles r where r.id in ($3::uuid,$4::uuid) and (r.user_id is not null or r.group_id is not null or r.coverage_enabled or r.nickname<>'Perfil retirado' or r.avatar<>'padrao' or r.rights_operation_id is distinct from o.id))
    and not exists(select 1 from recreio.profile_data_keys k where k.profile_id in ($3::uuid,$4::uuid))
    and not exists(select 1 from recreio.profile_data_versions v where v.profile_id in ($3::uuid,$4::uuid))
    and not exists(select 1 from recreio.profile_achievements a where a.profile_id in ($3::uuid,$4::uuid))
    and not exists(select 1 from recreio.guardian_links g where g.profile_id in ($3::uuid,$4::uuid))
    and (select count(*) from audit.events where event_type='recreio.account_closure_completed' and payload->>'operationId'=$1::text)=1 as valida
    from recreio.rights_operations o join recreio.account_participations p on p.operation_id=o.id where o.id=$1::uuid and o.requester_user_id=$2`,
    parametros,
  );
  exigir(depois?.valida, "ENCERRAMENTO_SELECIONADO_DIVERGENTE");
  return {
    nativeSelectedClosureReadinessVerified: true,
    nativeSelectedClosureVerificationIdempotent: true,
    nativeSelectedClosureReplayed: true,
    nativeSelectedClosureProfilesRetired: true,
    nativeSelectedClosureOpaqueDataRemoved: 6,
    nativeSelectedClosureResponsibilityRemoved: true,
    nativeSelectedClosureOtherProfilesPreserved: true,
    nativeSelectedClosureGlobalRecordsPreserved: true,
    nativeSelectedClosureOriginalConsentPreserved: true,
    nativeSelectedClosureFinancialConfirmationPreserved: true,
    nativeSelectedClosureRetryIdempotent: true,
    nativeSelectedClosureNoNewConsent: true,
  };
}
