import { eq } from "drizzle-orm";
import { db } from "./client";
import { jobRuns } from "./schema/ops";

export type JobRunMeta = {
  /** Slug do app, igual ao de `APPS` (`cozya`, `agenda-da-turma`...). */
  app: string;
  /** Nome estável da rotina, em geral o segmento da rota em `/api/jobs/<job>`. */
  job: string;
};

const MAX_SUMMARY_KEYS = 20;

/**
 * O resumo guarda só números e booleanos do primeiro nível do resultado. Texto
 * fica de fora de propósito: rotinas devolvem às vezes e-mails ou mensagens de
 * erro do provedor, e o Bastidores não deve ver nada disso.
 */
export function summarizeJobResult(result: unknown): Record<string, number | boolean> {
  if (typeof result !== "object" || result === null || Array.isArray(result)) return {};
  const summary: Record<string, number | boolean> = {};
  for (const [key, value] of Object.entries(result)) {
    if (Object.keys(summary).length >= MAX_SUMMARY_KEYS) break;
    if (typeof value === "boolean") summary[key] = value;
    else if (typeof value === "number" && Number.isFinite(value)) summary[key] = value;
    else if (Array.isArray(value)) summary[`${key}Count`] = value.length;
  }
  return summary;
}

function errorNameOf(error: unknown) {
  if (error instanceof Error) return error.name.slice(0, 80) || "Error";
  return "UnknownError";
}

/**
 * Executa a rotina e registra a execução em `ops.job_runs`. O registro é
 * best-effort: se o banco falhar ao gravar, a rotina roda igual e o erro dela
 * (se houver) continua sendo lançado para quem chamou.
 */
export async function recordJobRun<T>(meta: JobRunMeta, run: () => Promise<T>): Promise<T> {
  let id: string | null = null;
  try {
    const [row] = await db
      .insert(jobRuns)
      .values({ app: meta.app, job: meta.job })
      .returning({ id: jobRuns.id });
    id = row?.id ?? null;
  } catch {
    id = null;
  }
  try {
    const result = await run();
    if (id)
      await db
        .update(jobRuns)
        .set({ finishedAt: new Date(), ok: true, summary: summarizeJobResult(result) })
        .where(eq(jobRuns.id, id))
        .catch(() => undefined);
    return result;
  } catch (error) {
    if (id)
      await db
        .update(jobRuns)
        .set({ finishedAt: new Date(), ok: false, errorName: errorNameOf(error) })
        .where(eq(jobRuns.id, id))
        .catch(() => undefined);
    throw error;
  }
}
