import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGunzip } from "node:zlib";
import { count, sql } from "drizzle-orm";
import Papa from "papaparse";
import type { Database } from "../client";
import { agendaCities, agendaSchools } from "../schema";

/**
 * INEP "Catálogo de Escolas" CSV importer.
 *
 * Lookup order at the repo root:
 *   1. `escolas_inep.csv.gz`  — gzip-compressed (~11MB, tracked in git so the
 *      Railway Migrator service can populate `agenda.schools` without external
 *      filesystem). Streamed through `zlib.createGunzip()` into papaparse.
 *   2. `escolas_inep.csv`      — descomprimido (~74MB, gitignored). Útil em dev
 *      quando o CSV foi baixado direto do portal de dados abertos do INEP.
 *
 * Columns used: "Escola", "Código INEP", "UF", "Município".
 *
 * IBGE city codes are resolved by `(UF, normalized name)` match against the
 * previously-seeded `agenda.cities` table. Names are accent-insensitive and
 * case-insensitive. Rows whose city doesn't resolve are counted and skipped.
 *
 * Special case: rows whose name is exactly "COLEGIO BATISTA MINEIRO" (no unit
 * suffix) are renamed to "COLEGIO BATISTA MINEIRO - UNIDADE FLORESTA" — a
 * product decision to disambiguate the otherwise-generic INEP entry.
 */
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const INEP_CSV_PATHS = [
  path.resolve(REPO_ROOT, "escolas_inep.csv.gz"),
  path.resolve(REPO_ROOT, "escolas_inep.csv"),
];
const BATCH_SIZE = 1000;
const BATISTA_MINEIRO_NAME = "COLEGIO BATISTA MINEIRO";
const BATISTA_MINEIRO_OVERRIDE = "COLEGIO BATISTA MINEIRO - UNIDADE FLORESTA";

// INEP tem ~181k escolas. Threshold conservador pra short-circuit — se já
// passou de 100k, considera populado e pula o parse completo do CSV.
const MIN_POPULATED_SCHOOLS = 100_000;

type InepRow = {
  Escola?: string;
  "Código INEP"?: string;
  UF?: string;
  Município?: string;
};

type SchoolInsert = { inepCode: string; cityIbgeCode: string; name: string };

function normalizeCityKey(uf: string, name: string): string {
  return `${uf.toUpperCase()}|${name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()}`;
}

async function loadCityLookup(db: Database): Promise<Map<string, string>> {
  const rows = await db
    .select({
      ibgeCode: agendaCities.ibgeCode,
      stateUf: agendaCities.stateUf,
      name: agendaCities.name,
    })
    .from(agendaCities);
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(normalizeCityKey(row.stateUf, row.name), row.ibgeCode);
  }
  return map;
}

async function flushBatch(db: Database, batch: SchoolInsert[]): Promise<number> {
  if (batch.length === 0) return 0;
  await db
    .insert(agendaSchools)
    .values(batch)
    .onConflictDoUpdate({
      target: agendaSchools.inepCode,
      set: {
        cityIbgeCode: sql`excluded.city_ibge_code`,
        name: sql`excluded.name`,
      },
    });
  return batch.length;
}

function resolveCsvSource(): { path: string; isGzipped: boolean } | null {
  for (const candidate of INEP_CSV_PATHS) {
    if (existsSync(candidate)) {
      return { path: candidate, isGzipped: candidate.endsWith(".gz") };
    }
  }
  return null;
}

export async function seedSchools(db: Database): Promise<void> {
  // Curto-circuito: se a tabela já tem o catálogo INEP, pula o parse + insert
  // (181k rows é caro — evita refazer trabalho em todo deploy do migrator).
  const [existing] = await db.select({ value: count() }).from(agendaSchools);
  if (existing && existing.value >= MIN_POPULATED_SCHOOLS) {
    console.log(`[seeds:schools] skip — ${existing.value} escolas já populadas`);
    return;
  }

  const source = resolveCsvSource();
  if (!source) {
    console.warn(
      "[seeds:schools] neither escolas_inep.csv.gz nor escolas_inep.csv found at repo root — skipping.\n" +
        "  Commit the .gz to populate via Railway Migrator, or place the .csv locally for dev seed.",
    );
    return;
  }

  const fileSize = statSync(source.path).size;
  console.log(
    `[seeds:schools] reading ${source.path} (${(fileSize / 1024 / 1024).toFixed(1)} MB${source.isGzipped ? " gzipped" : ""})`,
  );

  const cityLookup = await loadCityLookup(db);
  console.log(`[seeds:schools] loaded ${cityLookup.size} cities for FK resolution`);

  let total = 0;
  let inserted = 0;
  let skippedNoCity = 0;
  let skippedMissingFields = 0;
  let batch: SchoolInsert[] = [];
  const seenInep = new Set<string>();

  await new Promise<void>((resolve, reject) => {
    const fileStream = createReadStream(source.path);
    const stream = source.isGzipped ? fileStream.pipe(createGunzip()) : fileStream;
    // Papaparse auto-decodes UTF-8 from a Node stream; the BOM in the INEP
    // dump is handled by `header: true` parser.
    const tasks: Array<Promise<void>> = [];

    Papa.parse<InepRow>(stream as unknown as NodeJS.ReadableStream, {
      header: true,
      skipEmptyLines: true,
      step: (result, parser) => {
        total += 1;
        const row = result.data as InepRow;
        const inepCode = row["Código INEP"]?.trim();
        const rawName = row.Escola?.trim();
        const uf = row.UF?.trim();
        const cityName = row.Município?.trim();

        if (!inepCode || !rawName || !uf || !cityName) {
          skippedMissingFields += 1;
          return;
        }
        if (seenInep.has(inepCode)) return;

        const cityIbgeCode = cityLookup.get(normalizeCityKey(uf, cityName));
        if (!cityIbgeCode) {
          skippedNoCity += 1;
          return;
        }

        const name = rawName === BATISTA_MINEIRO_NAME ? BATISTA_MINEIRO_OVERRIDE : rawName;

        seenInep.add(inepCode);
        batch.push({ inepCode, cityIbgeCode, name });

        if (batch.length >= BATCH_SIZE) {
          parser.pause();
          const toInsert = batch;
          batch = [];
          const task = flushBatch(db, toInsert)
            .then((n) => {
              inserted += n;
              if (inserted % 10_000 < BATCH_SIZE) {
                console.log(`[seeds:schools] inserted ${inserted}...`);
              }
              parser.resume();
            })
            .catch((err) => {
              parser.abort();
              reject(err);
            });
          tasks.push(task);
        }
      },
      complete: () => {
        Promise.all(tasks)
          .then(() => flushBatch(db, batch))
          .then((n) => {
            inserted += n;
            console.log(
              `[seeds:schools] finished — total rows: ${total}, inserted: ${inserted}, skipped (no city match): ${skippedNoCity}, skipped (missing fields): ${skippedMissingFields}`,
            );
            resolve();
          })
          .catch(reject);
      },
      error: (error) => reject(error),
    });
  });
}
