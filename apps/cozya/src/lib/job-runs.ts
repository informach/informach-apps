import { APPS } from "@informach/config";
import { recordJobRun } from "@informach/db";

/**
 * Registra em `ops.job_runs` cada execução de rotina agendada, para o
 * Bastidores mostrar quando rodou, quanto tempo levou e se falhou. O registro é
 * best-effort: a rotina roda igual se o banco falhar ao gravar, e o erro dela
 * continua chegando a quem chamou.
 */
export function recordJob<T>(job: string, run: () => Promise<T>): Promise<T> {
  return recordJobRun({ app: APPS.cozya.slug, job }, run);
}
