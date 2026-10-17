import { sql } from "@informach/db";

/**
 * Data como parâmetro de SQL cru. Fora do construtor de consultas o Drizzle não
 * sabe que é timestamp, e o postgres-js recusa um `Date` solto (gotcha 8 do
 * `docs/deploy-runbook.md`): vai como texto ISO, convertido no próprio Postgres.
 */
export function iso(date: Date) {
  return sql`${date.toISOString()}::timestamptz`;
}
