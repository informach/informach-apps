import "server-only";
import { serviceStatus } from "@informach/db/schema";
import { getEnv } from "./env";
import { shortCommit } from "./format";
import { SERVICE_KEYS, SERVICES, type ServiceKey, serviceOrigins } from "./products";
import { readDb } from "./read-db";

export type ServiceState = "up" | "slow" | "down";

/** Motivos curtos e fixos; nada do corpo da resposta vai para a tela. */
export type ServiceProblem =
  | "timeout"
  | "network"
  | "http"
  | "schema_behind"
  | "database_unreachable"
  | "configuration";

export type ServiceCheck = {
  key: ServiceKey;
  state: ServiceState;
  latencyMs: number | null;
  commit: string | null;
  problem: ServiceProblem | null;
  httpStatus: number | null;
  checkedAt: Date;
};

/** Acima disso a resposta conta como lenta. */
export const SLOW_MS = 3000;
const TIMEOUT_MS = 10_000;
const CACHE_MS = 60_000;

async function timedFetch(
  url: string,
): Promise<{ response: Response | null; ms: number; error: ServiceProblem | null }> {
  const started = Date.now();
  try {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "Bastidores/1 (+admin.informach.com.br)" },
    });
    return { response, ms: Date.now() - started, error: null };
  } catch (error) {
    const timeout =
      error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return { response: null, ms: Date.now() - started, error: timeout ? "timeout" : "network" };
  }
}

async function readProblem(response: Response): Promise<ServiceProblem> {
  try {
    const body = (await response.json()) as { reason?: unknown };
    if (body.reason === "behind") return "schema_behind";
    if (body.reason === "unreachable") return "database_unreachable";
    if (body.reason === "configuration_invalid") return "configuration";
  } catch {
    // corpo que não é JSON: fica o status HTTP
  }
  return "http";
}

async function readCommit(url: string): Promise<string | null> {
  const { response } = await timedFetch(url);
  if (!response?.ok) return null;
  try {
    const body = (await response.json()) as { commit?: unknown };
    return typeof body.commit === "string" ? shortCommit(body.commit) : null;
  } catch {
    return null;
  }
}

/** Confere um serviço: prontidão (`/api/ready`) e versão servindo (`/api/health`). */
export async function probeService(key: ServiceKey, origin: string): Promise<ServiceCheck> {
  const info = SERVICES[key];
  const [ready, commit] = await Promise.all([
    timedFetch(`${origin}${info.readyPath}`),
    info.healthPath ? readCommit(`${origin}${info.healthPath}`) : Promise.resolve(null),
  ]);
  const checkedAt = new Date();
  if (!ready.response)
    return {
      key,
      state: "down",
      latencyMs: null,
      commit,
      problem: ready.error,
      httpStatus: null,
      checkedAt,
    };
  if (!ready.response.ok)
    return {
      key,
      state: "down",
      latencyMs: ready.ms,
      commit,
      problem: await readProblem(ready.response),
      httpStatus: ready.response.status,
      checkedAt,
    };
  await ready.response.body?.cancel().catch(() => undefined);
  return {
    key,
    state: ready.ms > SLOW_MS ? "slow" : "up",
    latencyMs: ready.ms,
    commit,
    problem: null,
    httpStatus: ready.response.status,
    checkedAt,
  };
}

type Cache = { at: number; checks: ServiceCheck[] };
const globalCache = globalThis as typeof globalThis & { __bastidoresProbe?: Cache };

/**
 * Confere todos os serviços em paralelo. As telas reaproveitam o resultado por
 * um minuto, para várias pessoas no painel não multiplicarem as chamadas.
 */
export async function probeAll(options: { fresh?: boolean } = {}): Promise<ServiceCheck[]> {
  const cached = globalCache.__bastidoresProbe;
  if (!options.fresh && cached && Date.now() - cached.at < CACHE_MS) return cached.checks;
  const origins = serviceOrigins(getEnv().ADMIN_SERVICE_URLS);
  const checks = await Promise.all(SERVICE_KEYS.map((key) => probeService(key, origins[key])));
  globalCache.__bastidoresProbe = { at: Date.now(), checks };
  return checks;
}

export type StoredServiceStatus = typeof serviceStatus.$inferSelect;

/** Último estado gravado pela vigia (`/api/jobs/admin-watch`): dá o "desde quando". */
export async function readStoredStatus(): Promise<Map<string, StoredServiceStatus>> {
  const rows = await readDb().select().from(serviceStatus);
  return new Map(rows.map((row) => [row.service, row]));
}

/** Frase curta do problema, para a tela e para o aviso. */
export function problemText(check: Pick<ServiceCheck, "problem" | "httpStatus">): string {
  switch (check.problem) {
    case "timeout":
      return "não respondeu em 10 segundos";
    case "network":
      return "não foi possível conectar";
    case "schema_behind":
      return "o banco está atrás desta versão; o migrator ainda não rodou";
    case "database_unreachable":
      return "o app não alcança o banco";
    case "configuration":
      return "a configuração do app está inválida";
    case "http":
      return `respondeu com erro ${check.httpStatus ?? ""}`.trim();
    default:
      return "";
  }
}
