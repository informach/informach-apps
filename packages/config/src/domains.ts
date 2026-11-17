import { findApp } from "./apps";

export type Environment = "development" | "staging" | "production";

export function getAppUrl(app: string, environment: Environment): string {
  const registered = findApp(app);
  if (!registered) throw new Error("Unknown application");
  if (environment === "development") return `http://localhost:${registered.localPort}`;
  if (environment === "staging") return `https://${registered.slug}.staging.informach.com.br`;
  return `https://${registered.domain}`;
}

/** A return target is an app plus a local path, never a caller-controlled origin. */
export function resolveAccountReturnUrl(
  app: string,
  path: string,
  environment: Environment,
): string {
  const base = getAppUrl(app, environment);
  const decoded = decodeURIComponent(path);
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    decoded.startsWith("//") ||
    decoded.includes("\\") ||
    decoded.includes("#") ||
    [...decoded].some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    )
  )
    throw new Error("Invalid account return path");
  const target = new URL(path, base);
  if (target.origin !== base || target.username || target.password || target.hash)
    throw new Error("Invalid account return origin");
  return target.href;
}

export const DOMAINS: Record<Environment, { agendaDaTurma: string; cozya: string; edi: string }> = {
  development: {
    edi: getAppUrl("edi", "development"),
    agendaDaTurma: getAppUrl("agenda-da-turma", "development"),
    cozya: getAppUrl("cozya", "development"),
  },
  staging: {
    edi: getAppUrl("edi", "staging"),
    agendaDaTurma: getAppUrl("agenda-da-turma", "staging"),
    cozya: getAppUrl("cozya", "staging"),
  },
  production: {
    edi: getAppUrl("edi", "production"),
    agendaDaTurma: getAppUrl("agenda-da-turma", "production"),
    cozya: getAppUrl("cozya", "production"),
  },
};
