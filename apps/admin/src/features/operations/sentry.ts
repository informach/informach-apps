import "server-only";
import { getEnv } from "@/lib/env";
import { sentryIssues } from "@/lib/links";
import { reportOperationalError } from "@/lib/observability";

/**
 * Projetos do Sentry acompanhados, com o mesmo slug do app. Se um projeto tiver
 * outro nome no Sentry, a contagem dele aparece como indisponível, nunca como
 * zero.
 */
export const SENTRY_PROJECTS = [
  { project: "cozya", name: "Cozya" },
  { project: "agenda-da-turma", name: "Agenda da Turma" },
  { project: "missao-saber", name: "Missão Saber" },
  { project: "bora-treinar", name: "Bora Treinar" },
  { project: "edi", name: "Suíte Edi" },
  { project: "admin", name: "Bastidores" },
] as const;

/** A API devolve no máximo esta quantidade por página; acima disso a tela diz "100 ou mais". */
export const SENTRY_PAGE_LIMIT = 100;
const CACHE_MS = 5 * 60_000;
const TIMEOUT_MS = 8_000;

export type SentryProjectIssues = {
  project: string;
  name: string;
  url: string | null;
  /** null quando a contagem não veio (sem token, projeto com outro nome, Sentry fora). */
  unresolved: number | null;
};

export type SentryOverview = { configured: boolean; projects: SentryProjectIssues[] };

type Cache = { at: number; value: SentryOverview };
const globalCache = globalThis as typeof globalThis & { __bastidoresSentry?: Cache };

async function countUnresolved(
  org: string,
  token: string,
  project: string,
): Promise<number | null> {
  const url = `https://${encodeURIComponent(org)}.sentry.io/api/0/projects/${encodeURIComponent(org)}/${encodeURIComponent(project)}/issues/?query=is%3Aunresolved&statsPeriod=14d&limit=${SENTRY_PAGE_LIMIT}`;
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    return Array.isArray(body) ? body.length : null;
  } catch {
    return null;
  }
}

/**
 * Erros abertos de cada app nos últimos 14 dias. Opcional: só consulta com
 * `SENTRY_ORG_SLUG` e `SENTRY_READ_TOKEN` (escopo event:read). Resultado
 * guardado por 5 minutos; falha vira "indisponível" e não derruba a tela.
 */
export async function sentryOverview(): Promise<SentryOverview> {
  const cached = globalCache.__bastidoresSentry;
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  const env = getEnv();
  const configured = Boolean(env.SENTRY_ORG_SLUG && env.SENTRY_READ_TOKEN);
  const projects = await Promise.all(
    SENTRY_PROJECTS.map(async ({ project, name }) => ({
      project,
      name,
      url: sentryIssues(project),
      unresolved: configured
        ? await countUnresolved(env.SENTRY_ORG_SLUG, env.SENTRY_READ_TOKEN, project)
        : null,
    })),
  );
  if (configured && projects.every((item) => item.unresolved === null))
    reportOperationalError("service.probe_failed", undefined, { service: "sentry" });
  const value = { configured, projects };
  globalCache.__bastidoresSentry = { at: Date.now(), value };
  return value;
}
