// One-off: valida que a migration 0030 criou os índices GIN e que o planner
// realmente os usa nas queries de comboboxes. Não é parte do build/CI — rodar
// manualmente com `pnpm --filter @informach/db tsx scripts/verify-search-trgm.ts`.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import postgres from "postgres";

loadEnv({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..", ".env"),
});

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const sql = postgres(databaseUrl, { max: 1 });

async function main() {
  console.log("\n=== 1. Índices criados ===");
  const indexes = await sql<Array<{ indexname: string; indexdef: string }>>`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE schemaname = 'agenda'
      AND indexname IN (
        'agenda_schools_name_unaccent_trgm_idx',
        'agenda_cities_name_unaccent_trgm_idx'
      )
    ORDER BY indexname
  `;
  for (const row of indexes) {
    console.log(`  ${row.indexname}`);
    console.log(`    ${row.indexdef}`);
  }
  if (indexes.length < 2) {
    console.error(
      `\nESPERAVA 2 índices, encontrou ${indexes.length}. Migration 0030 não aplicou corretamente.`,
    );
    await sql.end();
    process.exit(1);
  }

  console.log("\n=== 2. Função IMMUTABLE registrada ===");
  const fn = await sql<Array<{ proname: string; provolatile: string }>>`
    SELECT proname, provolatile FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'agenda' AND proname = 'unaccent_immutable'
  `;
  for (const row of fn) {
    // provolatile: i=immutable, s=stable, v=volatile
    const vol =
      row.provolatile === "i" ? "IMMUTABLE" : row.provolatile === "s" ? "STABLE" : "VOLATILE";
    console.log(`  agenda.${row.proname} → ${vol}`);
    if (row.provolatile !== "i") {
      console.error("ERRO: função não está IMMUTABLE — índice GIN não pode usá-la.");
      await sql.end();
      process.exit(1);
    }
  }

  console.log("\n=== 3. Contagem de rows ===");
  const counts = await sql<Array<{ relname: string; n_live_tup: number }>>`
    SELECT relname, n_live_tup FROM pg_stat_user_tables
    WHERE schemaname = 'agenda' AND relname IN ('schools', 'cities')
    ORDER BY relname
  `;
  for (const row of counts) {
    console.log(`  agenda.${row.relname}: ~${row.n_live_tup.toLocaleString("pt-BR")} rows`);
  }

  console.log("\n=== 4. EXPLAIN ANALYZE — searchSchoolsInCity ===");
  // Sample: SP capital (3550308 = São Paulo SP, IBGE 7-dígito) + pattern "esc"
  const cityIbge = "3550308";
  const pattern = "%esc%";
  const explainSchools = await sql<Array<{ "QUERY PLAN": string }>>`
    EXPLAIN (ANALYZE, BUFFERS)
    SELECT inep_code, name FROM agenda.schools
    WHERE city_ibge_code = ${cityIbge}
      AND agenda.unaccent_immutable(name) ilike agenda.unaccent_immutable(${pattern}) escape '\\'
    ORDER BY name ASC
    LIMIT 50
  `;
  for (const row of explainSchools) {
    console.log(`  ${row["QUERY PLAN"]}`);
  }
  const usedGinSchools = explainSchools.some((r) =>
    r["QUERY PLAN"].includes("agenda_schools_name_unaccent_trgm_idx"),
  );
  console.log(`  → GIN trigram usado: ${usedGinSchools ? "SIM ✅" : "NÃO ❌"}`);

  console.log("\n=== 5. EXPLAIN ANALYZE — searchCitiesInState ===");
  const stateUf = "SP";
  const patternCity = "%san%";
  const explainCities = await sql<Array<{ "QUERY PLAN": string }>>`
    EXPLAIN (ANALYZE, BUFFERS)
    SELECT ibge_code, name FROM agenda.cities
    WHERE state_uf = ${stateUf}
      AND agenda.unaccent_immutable(name) ilike agenda.unaccent_immutable(${patternCity}) escape '\\'
    ORDER BY name ASC
    LIMIT 50
  `;
  for (const row of explainCities) {
    console.log(`  ${row["QUERY PLAN"]}`);
  }
  const usedGinCities = explainCities.some((r) =>
    r["QUERY PLAN"].includes("agenda_cities_name_unaccent_trgm_idx"),
  );
  console.log(`  → GIN trigram usado: ${usedGinCities ? "SIM ✅" : "NÃO ❌"}`);

  await sql.end();

  if (!usedGinSchools || !usedGinCities) {
    console.error("\n⚠ Planner não usou o GIN em algum cenário. Em tabelas pequenas isso pode");
    console.error("  ser otimização correta (seq-scan é mais barato). Conferir n_live_tup.");
    process.exit(1);
  }
  console.log("\n✅ Tudo OK — migration 0030 funcional.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
