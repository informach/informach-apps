import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Papa from "papaparse";
import { sql } from "drizzle-orm";
import type { Database } from "../client";
import { agendaCities, agendaSchools } from "../schema";

/**
 * INEP "Catálogo de Escolas" CSV importer.
 *
 * Expected file: ./escolas_inep.csv at the repo root (~77MB, ~181k rows).
 * Columns we use: "Escola", "Código INEP", "UF", "Município".
 *
 * The CSV doesn't carry IBGE city codes — we resolve them by (UF, name) match
 * against the previously-seeded `agenda.cities` table. Names are normalized
 * (case-insensitive + accent-insensitive) before lookup. Rows whose city
 * doesn't resolve are logged and skipped.
 *
 * Special case: schools named exactly "COLEGIO BATISTA MINEIRO" get the
 * suffix " - UNIDADE FLORESTA" appended (per product decision — multiple
 * INEP rows share that name and the user wants disambiguation in the UI).
 */
// Resolve to repo root (this file lives at packages/db/src/seeds/schools.ts).
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const INEP_CSV_PATH = path.resolve(REPO_ROOT, "escolas_inep.csv");
const BATCH_SIZE = 1000;
const BATISTA_MINEIRO_NAME = "COLEGIO BATISTA MINEIRO";
const BATISTA_MINEIRO_OVERRIDE = "COLEGIO BATISTA MINEIRO - UNIDADE FLORESTA";

type InepRow = {
  Escola?: string;
  "Código INEP"?: string;
  UF?: string;
  Município?: string;
};

type SchoolInsert = { inepCode: string; cityIbgeCode: string; name: string };

function normalizeCityKey(uf: string, name: string): string {
  return `${uf.toUpperCase()}|${name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim()}`;
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

export async function seedSchools(db: Database): Promise<void> {
  if (!existsSync(INEP_CSV_PATH)) {
    console.warn(
      `[seeds:schools] ${INEP_CSV_PATH} not found — skipping schools seed.\n` +
        `  To populate, place the INEP "Catálogo de Escolas" CSV at the repo root\n` +
        `  (filename: escolas_inep.csv) and re-run pnpm db:seed:reference.`,
    );
    return;
  }

  const fileSize = statSync(INEP_CSV_PATH).size;
  console.log(
    `[seeds:schools] reading ${INEP_CSV_PATH} (${(fileSize / 1024 / 1024).toFixed(1)} MB)`,
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
    const stream = createReadStream(INEP_CSV_PATH, { encoding: "utf-8" });
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

        const name =
          rawName === BATISTA_MINEIRO_NAME ? BATISTA_MINEIRO_OVERRIDE : rawName;

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
        // Drain pending tasks then flush remainder.
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
