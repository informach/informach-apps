import { isDeepStrictEqual } from "node:util";
import type postgres from "postgres";
import { admitirEncerramentoNativoHistoricoRecuperado } from "../../src/features/direitos/admissao-recuperada-repository";
import {
  type CoordenacaoDeEfeitos,
  comCoordenacaoPrivadaDeDireitos,
  comFinanceiroPrivadoDeEncerramento,
  comOperacaoPrivadaDeDireitos,
} from "../../src/features/direitos/coordenacao-repository";
import { concluirProximoEncerramento } from "../../src/features/direitos/encerramento-conta-repository";
import {
  verificarEncerramentoNativoRecuperado,
  verificarReaplicacaoDeDireitos,
  verificarReaplicacaoDeRetiradas,
} from "../../src/features/direitos/verificacao-recuperada-repository";
import { AppError } from "../../src/lib/errors";
import { comConexaoPrivadaDeDireitos } from "./conexao-direitos";
import { exigir } from "./provas-arquivos";
import type { RetiradaNativaDeProva } from "./retirada-nativa-prova-contrato";

/** Completes the remaining native zero-player case and the entire synthetic
 * native closure book. This rights receipt explicitly excludes traffic and
 * current global identity reconciliation; no live Stripe call is made. */
export async function provarReciboDosDireitosNativos(
  copia: postgres.Sql,
  config: Omit<Parameters<typeof comCoordenacaoPrivadaDeDireitos>[0], "banco" | "executar">,
  dado: RetiradaNativaDeProva["financeiro"],
) {
  const lerRun = () =>
    copia.unsafe(`select to_jsonb(r) as execucao from recreio.rights_recovery_runs r where id=$1`, [
      config.execucaoId,
    ]);
  const lerHistorico = () =>
    copia.unsafe(
      `select
    (select jsonb_agg(to_jsonb(o)-array['state','completed_at','attempts','next_attempt_at','updated_at','lease_token','lease_until'] order by o.id) from recreio.rights_operations o where o.ledger_id=$1) as operacoes,
    (select jsonb_agg(to_jsonb(f) order by f.operation_id) from recreio.account_closure_finances f join recreio.rights_operations o on o.id=f.operation_id where o.ledger_id=$1) as financeiro,
    (select jsonb_agg(to_jsonb(u) order by id) from core.users u) as identidades`,
      [dado.livroId],
    );
  const antes = await lerHistorico();
  let paiExpirado: CoordenacaoDeEfeitos | undefined;
  async function recusada(
    executar: () => Promise<unknown>,
    code: "DIREITOS_DEPENDENCIA" | "DIREITOS_LIVRO" | "DIREITOS_INTEGRIDADE",
  ) {
    let recusou = false;
    try {
      await executar();
    } catch (erro) {
      if (!(erro instanceof AppError) || erro.code !== code) throw erro;
      recusou = true;
    }
    exigir(recusou, "RECIBO_DIREITOS_NATIVOS_DIVERGENTE");
  }
  await comConexaoPrivadaDeDireitos(copia, (banco) =>
    comCoordenacaoPrivadaDeDireitos({
      ...config,
      banco,
      executar: async (pai) => {
        paiExpirado = pai;
        const incompleta = await lerRun();
        await recusada(() => verificarReaplicacaoDeDireitos(pai), "DIREITOS_DEPENDENCIA");
        exigir(isDeepStrictEqual(incompleta, await lerRun()), "RECIBO_DIREITOS_NATIVOS_DIVERGENTE");
        const id = dado.provedor.operacaoId;
        exigir(
          (await admitirEncerramentoNativoHistoricoRecuperado(pai, id)).situacao ===
            "existente_nativa",
          "RECIBO_DIREITOS_NATIVOS_DIVERGENTE",
        );
        await comOperacaoPrivadaDeDireitos(pai, id, async (filha) => {
          const retirada = await concluirProximoEncerramento(filha);
          exigir(
            retirada.situacao === "dados_da_conta_retirados" &&
              retirada.dominio === "pin_conta" &&
              retirada.quantidade === 1,
            "RECIBO_DIREITOS_NATIVOS_DIVERGENTE",
          );
          exigir(
            (await concluirProximoEncerramento(filha)).situacao === "conta_encerrada",
            "RECIBO_DIREITOS_NATIVOS_DIVERGENTE",
          );
        });
        exigir(
          !(await verificarEncerramentoNativoRecuperado(pai, id)).jaVerificada,
          "RECIBO_DIREITOS_NATIVOS_DIVERGENTE",
        );
        await recusada(() => verificarReaplicacaoDeRetiradas(pai), "DIREITOS_DEPENDENCIA");
        const pronta = await lerRun();
        const [livre] = await copia.unsafe<{ livre: boolean }[]>(
          `select to_regprocedure('audit.recusar_recibo_direitos_nativos()') is null and not exists(select 1 from pg_trigger where tgname='recusar_recibo_direitos_nativos') as livre`,
        );
        exigir(livre?.livre, "RECIBO_DIREITOS_NATIVOS_DIVERGENTE");
        await copia.begin(async (tx) => {
          await tx.unsafe(
            `create function audit.recusar_recibo_direitos_nativos() returns trigger language plpgsql as $$ begin if new.event_type='recreio.rights_recovery_verified' then raise exception using errcode='P7779',message='Synthetic native rights receipt audit failure'; end if; return new; end $$`,
          );
          await tx.unsafe(
            `create trigger recusar_recibo_direitos_nativos before insert on audit.events for each row execute function audit.recusar_recibo_direitos_nativos()`,
          );
        });
        try {
          let recusou = false;
          try {
            await verificarReaplicacaoDeDireitos(pai);
          } catch (erro) {
            let atual: unknown = erro,
              reconhecida = false;
            for (let n = 0; n < 8; n++) {
              if (atual && typeof atual === "object" && "code" in atual && atual.code === "P7779") {
                reconhecida = true;
                break;
              }
              if (!(atual instanceof Error) || !atual.cause) break;
              atual = atual.cause;
            }
            if (!reconhecida) throw erro;
            recusou = true;
          }
          exigir(
            recusou && isDeepStrictEqual(pronta, await lerRun()),
            "RECIBO_DIREITOS_NATIVOS_DIVERGENTE",
          );
        } finally {
          await copia.begin(async (tx) => {
            await tx.unsafe(`drop trigger recusar_recibo_direitos_nativos on audit.events`);
            await tx.unsafe(`drop function audit.recusar_recibo_direitos_nativos()`);
          });
        }
        const recibo = await verificarReaplicacaoDeDireitos(pai);
        exigir(
          recibo.escopo === "direitos" &&
            recibo.operacoesVerificadas === 5 &&
            !recibo.trafegoAutorizado &&
            /^[a-f0-9]{64}$/.test(recibo.reciboSha256),
          "RECIBO_DIREITOS_NATIVOS_DIVERGENTE",
        );
        const [confirmada] = await copia.unsafe<{ valida: boolean }[]>(
          `select state='verified' and receipt_sha256=$2 and verified_at is not null as valida from recreio.rights_recovery_runs where id=$1`,
          [config.execucaoId, recibo.reciboSha256],
        );
        exigir(confirmada?.valida, "RECIBO_DIREITOS_NATIVOS_DIVERGENTE");
        await recusada(
          () =>
            comFinanceiroPrivadoDeEncerramento(pai, id, async () => {
              throw new Error("Final scope admitted another financial child");
            }),
          "DIREITOS_LIVRO",
        );
        await recusada(
          () =>
            comOperacaoPrivadaDeDireitos(pai, id, async () => {
              throw new Error("Final scope admitted another data child");
            }),
          "DIREITOS_LIVRO",
        );
      },
    }),
  );
  exigir(
    paiExpirado && isDeepStrictEqual(antes, await lerHistorico()),
    "RECIBO_DIREITOS_NATIVOS_DIVERGENTE",
  );
  const expirada = paiExpirado;
  await recusada(() => verificarReaplicacaoDeDireitos(expirada), "DIREITOS_LIVRO");
  await recusada(
    () =>
      comConexaoPrivadaDeDireitos(copia, (banco) =>
        comCoordenacaoPrivadaDeDireitos({
          ...config,
          banco,
          executar: async () => {
            throw new Error("Verified native run admitted another root");
          },
        }),
      ),
    "DIREITOS_INTEGRIDADE",
  );
  return {
    nativeClosureReplayReceiptVerified: true,
    nativeClosureReplayReceiptAuditRollbackVerified: true,
    nativeClosureReplayIncompleteRunRefused: true,
    nativeClosureWithdrawalOnlyReceiptRefused: true,
    nativeClosureReplayOriginalConsentAndFinancePreserved: true,
    nativeClosureReplayScopeClosed: true,
    nativeClosureReplayTrafficAuthorized: false,
  };
}
