import { findApp } from "@informach/config/apps";
import { getCollectionApps } from "@informach/config/collections";

export type WebSsoConfig =
  | { role: "provider"; environment: "production" | "development" }
  | { role: "client"; environment: "production" | "development"; app: string };

/** Deployment origin is explicit; an optimized localhost build is still a local deployment. */
export function webSsoEnvironment(
  app: string,
  configuredOrigin: string | undefined,
): WebSsoConfig["environment"] {
  for (const environment of ["production", "development"] as const)
    if (configuredOrigin === webSsoOrigin(app, environment)) return environment;
  throw new Error("Web SSO requires the exact registered application origin");
}

/** Origins come only from the product registry, never from a request header. */
export function webSsoOrigin(app: string, environment: WebSsoConfig["environment"]) {
  const entry = findApp(app);
  if (!entry || (entry.slug !== "conta" && entry.collection !== "compasso"))
    throw new Error("App is not a web SSO participant");
  return environment === "production"
    ? `https://${entry.domain}`
    : `http://localhost:${entry.localPort}`;
}

export function webSsoClient(app: string, environment: WebSsoConfig["environment"]) {
  if (app === "conta") throw new Error("The account central is not its own OAuth client");
  const origin = webSsoOrigin(app, environment);
  // Separate provider IDs also isolate tokens encrypted with each app's auth secret.
  const providerId = `informach-${app}`;
  return {
    providerId,
    clientId: `informach-web-${environment}-${app}`,
    redirectUri: `${origin}/api/auth/callback/${providerId}`,
    origin,
  };
}

/** Product-local destination, independent of a caller-controlled Host header. */
export function webAppDestination(value: unknown, fallback: string) {
  const unsafe = (input: string) =>
    input.startsWith("//") ||
    [...input].some(
      (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127 || char === "\\",
    );
  if (
    typeof value !== "string" ||
    !value ||
    value.length > 2048 ||
    !value.startsWith("/") ||
    unsafe(value)
  )
    return fallback;
  try {
    const url = new URL(value, "https://app.invalid");
    const decodedPath = decodeURIComponent(url.pathname);
    if (unsafe(decodedPath) || /%[0-9a-f]{2}/i.test(decodedPath)) return fallback;
    const normalized = new URL(decodedPath, "https://app.invalid");
    if (
      normalized.origin !== "https://app.invalid" ||
      /^\/(api|login|signup|entrar)(\/|$)/i.test(normalized.pathname)
    )
      return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export function webSsoReturnUrl(value: string, environment: WebSsoConfig["environment"]) {
  if (value.length > 8192) throw new Error("Invalid SSO return URL");
  const url = new URL(value);
  if (url.username || url.password || url.hash) throw new Error("Invalid SSO return URL");
  const expected = getCollectionApps("compasso").map((app) => webSsoClient(app.slug, environment));
  if (!expected.some((client) => url.origin + url.pathname === client.redirectUri))
    throw new Error("Unregistered SSO callback");
  for (const field of ["code", "state"]) {
    const values = url.searchParams.getAll(field);
    if (values.length !== 1 || !values[0] || values[0].length > 2048)
      throw new Error("Incomplete or ambiguous SSO callback");
  }
  return url.href;
}
