import type postgres from "postgres";
import { descartarExportacoesRestauradas } from "./descartar-exportacoes";
import { conferirInventarios, inventariarBackup } from "./inventario";
import { exigirBancoPrivadoDeRecuperacao } from "./normalizar-fotografias";
import { exigir } from "./provas-arquivos";

/** The caller supplies only the already normalized synthetic cold cluster.
 * A native DELETE trigger exercises atomic rollback without adding a failure
 * callback to the operational function. Inventories include audit and globals. */
export async function provarDescarteDeExportacoes(restaurado: postgres.Sql) {
  await exigirBancoPrivadoDeRecuperacao(restaurado);
  const inventario = () =>
    restaurado.begin("isolation level repeatable read read only", inventariarBackup);
  const antes = await inventario();
  const exportacoes = antes.tabelas.find(
    (t) => t.schema === "recreio" && t.nome === "personal_exports",
  );
  exigir(exportacoes && exportacoes.resumo.linhas > 0, "VINCULOS_GLOBAIS_DIVERGENTES");
  await restaurado.unsafe(`create function recreio.export_discard_rollback_probe() returns trigger language plpgsql as $$
    begin raise exception 'synthetic export discard rollback'; end $$`);
  await restaurado.unsafe(`create trigger export_discard_rollback_probe before delete on recreio.personal_exports
    for each row execute function recreio.export_discard_rollback_probe()`);
  let recusou = false;
  try {
    await descartarExportacoesRestauradas(restaurado);
  } catch (error) {
    recusou = error instanceof Error && "code" in error && error.code === "P0001";
    if (!recusou) throw error;
  } finally {
    await restaurado.unsafe(
      "drop trigger export_discard_rollback_probe on recreio.personal_exports",
    );
    await restaurado.unsafe("drop function recreio.export_discard_rollback_probe()");
  }
  exigir(recusou, "VINCULOS_GLOBAIS_DIVERGENTES");
  conferirInventarios(antes, await inventario());
  const resultado = await descartarExportacoesRestauradas(restaurado);
  exigir(
    resultado.exportacoesDescartadas === exportacoes.resumo.linhas &&
      resultado.autoridadesDeDownloadRecriadas === 0 &&
      !resultado.trafegoAutorizado,
    "VINCULOS_GLOBAIS_DIVERGENTES",
  );
  const depois = await inventario();
  const permanente = (t: { schema: string; nome: string }) =>
    t.schema !== "recreio" || t.nome !== "personal_exports";
  conferirInventarios(
    { ...antes, tabelas: antes.tabelas.filter(permanente) },
    { ...depois, tabelas: depois.tabelas.filter(permanente) },
  );
  exigir(
    (await descartarExportacoesRestauradas(restaurado)).exportacoesDescartadas === 0,
    "VINCULOS_GLOBAIS_DIVERGENTES",
  );
  conferirInventarios(depois, await inventario());
  return {
    discarded: resultado.exportacoesDescartadas,
    rollbackVerified: true,
    idempotenceVerified: true,
  };
}
