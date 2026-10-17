import {
  boolean,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Operação dos apps, lida pelo Bastidores (`apps/admin`). Nada aqui guarda dado
 * pessoal: só nomes de rotina e de serviço, horários, contagens e o nome da classe
 * de erro.
 */
export const ops = pgSchema("ops");

/** Uma linha por execução de rotina agendada (`/api/jobs/*`), gravada por `recordJobRun`. */
export const jobRuns = ops.table(
  "job_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    app: text("app").notNull(),
    job: text("job").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    /** null enquanto roda; false quando a rotina lançou erro. */
    ok: boolean("ok"),
    /** Só os campos numéricos e booleanos do resultado, nunca texto. */
    summary: jsonb("summary").$type<Record<string, number | boolean>>().default({}).notNull(),
    errorName: text("error_name"),
  },
  (t) => [index("job_runs_app_job_started_idx").on(t.app, t.job, t.startedAt)],
);

/**
 * Último estado conhecido de cada serviço, mantido pela vigia do Bastidores. É o
 * que permite dizer "fora do ar desde 13:58" e avisar uma vez só por queda.
 */
export const serviceStatus = ops.table("service_status", {
  service: text("service").primaryKey(),
  /** up | slow | down */
  state: text("state").notNull(),
  since: timestamp("since", { withTimezone: true }).notNull(),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
  latencyMs: integer("latency_ms"),
  commit: text("commit"),
  detail: text("detail"),
  /** Quando o aviso desta mudança de estado foi enviado; null se ainda não foi. */
  alertedAt: timestamp("alerted_at", { withTimezone: true }),
});
