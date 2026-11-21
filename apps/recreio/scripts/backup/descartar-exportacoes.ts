import type postgres from "postgres";
import { conferirCapacidadesRestauradas } from "./normalizar-capacidades";
import { exigirBancoPrivadoDeRecuperacao, FalhaDaNormalizacao } from "./normalizar-fotografias";

/** A restored download can never recover its former login/device authority.
 * The prior capability normalization must already have cleared every body and
 * reference. Remove only these ephemeral receipts in the owned private copy,
 * before selective publication binds FKs to current global identity. This is
 * not an account erasure, a global session write or a traffic capability. */
export async function descartarExportacoesRestauradas(copia: postgres.Sql) {
  await exigirBancoPrivadoDeRecuperacao(copia);
  return copia.begin("isolation level repeatable read read write", async (tx) => {
    await tx.unsafe("set local search_path=pg_catalog");
    await tx.unsafe("set local statement_timeout='5000ms'");
    await tx.unsafe("set local lock_timeout='2000ms'");
    await tx.unsafe("set local transaction_timeout='30000ms'");
    await tx.unsafe("lock table recreio.personal_exports in access exclusive mode");
    await conferirCapacidadesRestauradas(tx);
    const [antes] = await tx.unsafe<{ quantidade: number; inseguras: number }[]>(`select
      count(*)::int as quantidade,
      count(*) filter(where state='ready' or encrypted_bytes is not null or reference is not null)::int as inseguras
      from recreio.personal_exports`);
    if (
      !antes ||
      !Number.isSafeInteger(antes.quantidade) ||
      antes.quantidade < 0 ||
      antes.quantidade > 1_000_000 ||
      antes.inseguras !== 0
    )
      throw new FalhaDaNormalizacao("INTEGRIDADE");
    const [removidas] = await tx.unsafe<{ quantidade: number }[]>(`with descartadas as (
      delete from recreio.personal_exports returning 1
    ) select count(*)::int as quantidade from descartadas`);
    if (removidas?.quantidade !== antes.quantidade) throw new FalhaDaNormalizacao("INTEGRIDADE");
    return Object.freeze({
      exportacoesDescartadas: removidas.quantidade,
      autoridadesDeDownloadRecriadas: 0,
      trafegoAutorizado: false as const,
    });
  });
}
