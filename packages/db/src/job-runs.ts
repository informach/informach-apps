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

function safeSummary(result: unknown): Record<string, number | boolean> {
  try {
    return summarizeJobResult(result);
  } catch {
    // Um getter que lança no resultado não pode virar falha da rotina.
    return {};
  }
}

async function startJobRun(meta: JobRunMeta): Promise<string | null> {
  try {
    const [row] = await db
      .insert(jobRuns)
      .values({ app: meta.app, job: meta.job })
      .returning({ id: jobRuns.id });
    return row?.id ?? null;
  } catch {
    return null;
  }
}

type JobRunOutcome =
  | { ok: true; summary: Record<string, number | boolean> }
  | { ok: false; errorName: string };

async function finishJobRun(id: string, outcome: JobRunOutcome): Promise<void> {
  try {
    await db
      .update(jobRuns)
      .set({ finishedAt: new Date(), ...outcome })
      .where(eq(jobRuns.id, id));
  } catch {
    // Best-effort: a linha fica sem desfecho, a rotina não.
  }
}

/**
 * Executa a rotina e registra a execução em `ops.job_runs`. O registro é
 * best-effort: se o banco falhar ao gravar (inclusive de forma síncrona, como
 * sem DATABASE_URL), a rotina roda igual, devolve o próprio resultado e o erro
 * dela (se houver) continua sendo lançado para quem chamou. A gravação do
 * desfecho fica fora do `try` da rotina, para que uma falha ao registrar o
 * sucesso nunca seja tratada como falha da rotina.
 */
export async function recordJobRun<T>(meta: JobRunMeta, run: () => Promise<T>): Promise<T> {
  const id = await startJobRun(meta);
  let result: T;
  try {
    result = await run();
  } catch (error) {
    if (id) await finishJobRun(id, { ok: false, errorName: errorNameOf(error) });
    throw error;
  }
  if (id) await finishJobRun(id, { ok: true, summary: safeSummary(result) });
  return result;
}
