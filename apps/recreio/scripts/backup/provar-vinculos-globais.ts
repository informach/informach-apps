import type postgres from "postgres";
import { conferirInventarios, inventariarBackup } from "./inventario";
import { exigirBancoPrivadoDeRecuperacao } from "./normalizar-fotografias";
import { exigir } from "./provas-arquivos";
import type { RetiradaNativaDeProva } from "./retirada-nativa-prova-contrato";
import { conferirVinculosGlobaisAtuais, FalhaDosVinculosAtuais } from "./vinculos-globais";

/** A third owned Unix cluster models a current shared target whose Recreio
 * schema was lost. Only this synthetic setup writes the target; the preflight
 * itself is read-only. No original database connection or credential exists. */
export async function provarVinculosGlobaisAtuais(
  restaurado: postgres.Sql,
  atual: postgres.Sql,
  dado: RetiradaNativaDeProva["financeiro"],
) {
  await exigirBancoPrivadoDeRecuperacao(restaurado);
  await exigirBancoPrivadoDeRecuperacao(atual);
  const local = async (sql: postgres.Sql) => {
    const [r] = await sql.unsafe<{ socket: string; banco: string }[]>(`select
      current_setting('unix_socket_directories') as socket,current_database() as banco`);
    exigir(r, "VINCULOS_GLOBAIS_DIVERGENTES");
    return r;
  };
  const a = await local(restaurado),
    b = await local(atual);
  exigir(a.socket !== b.socket || a.banco !== b.banco, "VINCULOS_GLOBAIS_DIVERGENTES");
  // This role owns an ephemeral restore, already checked above. Never point
  // this fixture at a Railway/source database or drop a schema in the origin.
  await atual.begin(async (tx) => {
    // PostgreSQL emits a multi-line NOTICE enumerating every dropped object.
    // The worker has a single-JSON stdout protocol; keep warnings/errors and
    // suppress only the expected informational notice of this fixture DDL.
    await tx.unsafe("set local client_min_messages='warning'");
    await tx.unsafe("drop schema recreio cascade");
  });
  const inventario = (sql: postgres.Sql) =>
    sql.begin("isolation level repeatable read read only", inventariarBackup);
  const fonteAntes = await inventario(restaurado);
  async function lerSemEscrever() {
    const antes = await inventario(atual);
    const resultado = await conferirVinculosGlobaisAtuais(restaurado, atual);
    conferirInventarios(antes, await inventario(atual));
    conferirInventarios(fonteAntes, await inventario(restaurado));
    return resultado;
  }
  const original = await lerSemEscrever();
  exigir(
    !original.trafegoAutorizado &&
      original.exigeConciliacaoFinanceira &&
      original.clientesAtuais >= 1 &&
      (original.referencias["core.users"] ?? 0) > 0,
    "VINCULOS_GLOBAIS_DIVERGENTES",
  );
  await atual.begin(async (tx) => {
    await tx.unsafe(`update core.users set banned=true,updated_at=clock_timestamp() where id=$1`, [
      dado.comContrato.contaId,
    ]);
    await tx.unsafe(
      `update billing.subscriptions set cancel_at_period_end=current_period_end,
      provider_observed_at=clock_timestamp() where provider_subscription_id=$1`,
      [dado.comContrato.assinaturaStripeId],
    );
  });
  const corrente = await lerSemEscrever();
  exigir(
    corrente.sha256 !== original.sha256 &&
      corrente.identidadesAlteradas >= 1 &&
      corrente.fatosFinanceirosAlterados >= 1 &&
      corrente.exigeConciliacaoFinanceira &&
      !corrente.trafegoAutorizado,
    "VINCULOS_GLOBAIS_DIVERGENTES",
  );
  async function recusada(code: FalhaDosVinculosAtuais["codigo"]) {
    const antes = await inventario(atual);
    let recusou = false;
    try {
      await conferirVinculosGlobaisAtuais(restaurado, atual);
    } catch (erro) {
      if (!(erro instanceof FalhaDosVinculosAtuais) || erro.codigo !== code) throw erro;
      recusou = true;
    }
    exigir(recusou, "VINCULOS_GLOBAIS_DIVERGENTES");
    conferirInventarios(antes, await inventario(atual));
    conferirInventarios(fonteAntes, await inventario(restaurado));
  }
  await atual.unsafe(
    `update billing.customers set app='cozya' where provider='stripe' and provider_customer_id=$1`,
    [dado.comContrato.clienteStripeId],
  );
  await recusada("VINCULO_FINANCEIRO");
  const removidas = await atual.unsafe(`delete from core.users where id=$1 returning id`, [
    dado.posterior.contaId,
  ]);
  exigir(removidas.length === 1, "VINCULOS_GLOBAIS_DIVERGENTES");
  await recusada("IDENTIDADE_AUSENTE");
  const [ausente] = await atual.unsafe<{ n: number }[]>(
    `select count(*)::int as n from core.users where id=$1`,
    [dado.posterior.contaId],
  );
  exigir(ausente?.n === 0, "VINCULOS_GLOBAIS_DIVERGENTES");
  return {
    currentGlobalBindingReadOnlyVerified: true,
    currentGlobalIdentityChangesObserved: true,
    currentGlobalFinancialChangesRequireReconciliation: true,
    currentGlobalForeignCustomerRefused: true,
    currentGlobalMissingIdentityRefused: true,
    currentGlobalIdentityNotManufactured: true,
    currentGlobalSourceAndOtherDomainsPreserved: true,
    currentGlobalTrafficAuthorized: false,
  };
}
