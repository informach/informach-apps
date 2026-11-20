import type postgres from "postgres";
import { conferirInventarios, inventariarBackup } from "./inventario";
import { normalizarCapacidadesRestauradas } from "./normalizar-capacidades";
import { exigirBancoPrivadoDeRecuperacao } from "./normalizar-fotografias";
import { exigir } from "./provas-arquivos";

/** Synthetic cold-cluster proof only. Failure injection is separate from the
 * operational normalizer; no production API receives a test-only callback. */
export async function provarCapacidadesRecuperadas(copia: postgres.Sql) {
  await exigirBancoPrivadoDeRecuperacao(copia);
  exigir(
    process.env.GITHUB_ACTIONS === "true" && process.env.CI === "true",
    "EXECUTOR_FORA_DO_ESCOPO",
  );
  const antes = await copia.begin("isolation level repeatable read read only", inventariarBackup);
  const alteradas = new Set([
    "device_sessions",
    "paired_credentials",
    "pairing_requests",
    "game_tickets",
    "session_handoffs",
    "session_save_permits",
    "game_sessions",
    "game_instances",
    "space_leases",
    "world_host_presences",
    "world_visits",
    "world_visit_sessions",
    "personal_exports",
  ]);
  exigir(
    [...alteradas].every((nome) =>
      antes.tabelas.some((t) => t.schema === "recreio" && t.nome === nome && t.resumo.linhas > 0),
    ),
    "CAPACIDADES_SINTETICAS_AUSENTES",
  );
  const [fimAnterior] = await copia.unsafe<{ cursor: number }[]>(
    "select coalesce(max(ended_seq),0)::float8 as cursor from recreio.game_sessions",
  );
  exigir(
    fimAnterior && Number.isSafeInteger(fimAnterior.cursor) && fimAnterior.cursor >= 0,
    "HISTORICO_DE_CAPACIDADES_INVALIDO",
  );
  const cursorAnterior = fimAnterior.cursor;
  const historico = async () => {
    const [r] = await copia.unsafe<{ sha: string }[]>(
      `select encode(sha256(convert_to(coalesce(jsonb_agg(
      jsonb_build_array(id,ended_at,end_reason,ended_seq,expires_at) order by id)::text,'[]'),'UTF8')),'hex') as sha
      from recreio.game_sessions where ended_at is not null and ended_seq<=$1::bigint`,
      [cursorAnterior],
    );
    exigir(r && /^[a-f0-9]{64}$/.test(r.sha), "HISTORICO_DE_CAPACIDADES_INVALIDO");
    return r.sha;
  };
  const historicoOriginal = await historico();
  await copia.unsafe(`create function recreio.capabilities_rollback_probe() returns trigger language plpgsql as $$
    begin raise exception 'synthetic capabilities rollback'; end $$`);
  await copia.unsafe(`create trigger capabilities_rollback_probe before update on recreio.personal_exports
    for each row execute function recreio.capabilities_rollback_probe()`);
  let recusou = false;
  try {
    await normalizarCapacidadesRestauradas(copia);
  } catch (e) {
    // Native PostgreSQL exception, not a rejected mock or guessed error text.
    recusou = e instanceof Error && "code" in e && e.code === "P0001";
    if (!recusou) throw e;
  } finally {
    await copia.unsafe("drop trigger capabilities_rollback_probe on recreio.personal_exports");
    await copia.unsafe("drop function recreio.capabilities_rollback_probe()");
  }
  exigir(recusou, "CAPACIDADES_ROLLBACK_NAO_EXERCITADO");
  conferirInventarios(
    antes,
    await copia.begin("isolation level repeatable read read only", inventariarBackup),
  );
  exigir((await historico()) === historicoOriginal, "HISTORICO_DE_CAPACIDADES_ALTERADO");
  const resultado = await normalizarCapacidadesRestauradas(copia);
  exigir((await historico()) === historicoOriginal, "HISTORICO_DE_CAPACIDADES_ALTERADO");
  const depois = await copia.begin("isolation level repeatable read read only", inventariarBackup);
  const permanentes = (t: { schema: string; nome: string }) =>
    t.schema !== "recreio" || !alteradas.has(t.nome);
  conferirInventarios(
    { ...antes, tabelas: antes.tabelas.filter(permanentes) },
    { ...depois, tabelas: depois.tabelas.filter(permanentes) },
  );
  await normalizarCapacidadesRestauradas(copia);
  conferirInventarios(
    depois,
    await copia.begin("isolation level repeatable read read only", inventariarBackup),
  );
  const [cursor] = await copia.unsafe<{ valido: boolean }[]>(`select
    count(*)=count(distinct ended_seq) and bool_and(ended_at is not null and ended_seq is not null) as valido
    from recreio.game_sessions`);
  exigir(cursor?.valido && resultado.temporaryCapabilitiesRemaining === 0, "CAPACIDADES_RESTANTES");
  return {
    ...resultado,
    temporaryCapabilitiesRollbackVerified: true as const,
    temporaryCapabilitiesIdempotent: true as const,
    permanentTablesPreserved: true as const,
  };
}
