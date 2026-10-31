import { APPS } from "@informach/config";
import { recordJobRun } from "@informach/db";

const APP = APPS.boraTreinar.slug;

/**
 * Registra em `ops.job_runs` cada execução de rotina agendada, para o
 * Bastidores mostrar quando rodou, quanto tempo levou e se falhou. O registro é
 * best-effort: a rotina roda igual se o banco falhar ao gravar, e o erro dela
 * continua chegando a quem chamou.
 */
export function recordJob<T>(job: string, run: () => Promise<T>): Promise<T> {
  return recordJobRun({ app: APP, job }, run);
}

/** Resposta de erro da rotina, guardada como `Http<status>` na execução registrada. */
class JobResponseError extends Error {
  constructor(status: number) {
    super(`job responded ${status}`);
    this.name = `Http${status}`;
  }
}

/**
 * Para rotinas que montam a própria resposta e sinalizam falha pelo status HTTP
 * (o cron observa o status). A resposta devolvida é sempre a da rotina; só o
 * registro muda: status de erro vira execução com falha, e os números do corpo
 * JSON entram no resumo.
 */
export async function recordJobResponse(
  job: string,
  run: () => Promise<Response>,
): Promise<Response> {
  const outcome: { response?: Response } = {};
  try {
    await recordJobRun({ app: APP, job }, async () => {
      const response = await run();
      outcome.response = response;
      if (!response.ok) throw new JobResponseError(response.status);
      return response
        .clone()
        .json()
        .catch(() => null);
    });
  } catch (error) {
    if (outcome.response && error instanceof JobResponseError) return outcome.response;
    throw error;
  }
  if (!outcome.response) throw new Error("job produced no response");
  return outcome.response;
}
