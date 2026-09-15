import { createAuthProxy } from "@informach/auth/proxy";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { authResult } from "./lib/auth";
import { AUTH_PROTECTED_PATHS, AUTH_PUBLIC_PATHS, AUTH_SIGN_IN_PATH } from "./lib/auth-routing";
import { buildCspHeader, CSP_HEADER, CSP_NONCE_HEADER, shouldSkipCsp } from "./lib/csp";
import { env } from "./lib/env";

/**
 * Paths exempted from session-cookie authentication. Matched as path PREFIXES
 * (so `/api/webhooks` covers `/api/webhooks/stripe`, `/api/webhooks/sendgrid`...).
 *
 * Keep non-page entry points public because they authenticate by their own
 * signature/token mechanisms.
 *
 *   /login, /signup — auth UI
 *   /api/auth        — Better Auth handler (manages its own session lifecycle)
 *   /api/webhooks    — Stripe + SendGrid; auth via HMAC/ECDSA signature
 *   /api/jobs        — cron routes; auth via `Authorization: Bearer ${CRON_SECRET}`
 *   /api/email       — unsubscribe link; auth via HMAC token in query string
 *   /api/health      — liveness probe; responde qual commit está servindo
 *   /api/ready       — portão de deploy do Railway; confere o schema do banco
 */
const authProxy = createAuthProxy(authResult, {
  requireAuth: [...AUTH_PROTECTED_PATHS],
  signInPath: AUTH_SIGN_IN_PATH,
  publicPaths: [...AUTH_PUBLIC_PATHS],
});

/**
 * Converte o `Buffer.from(crypto.randomUUID()).toString("base64")` clássico
 * para um nonce sem padding (mais limpo no header CSP).
 */
function generateNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64").replace(/=+$/, "");
}

/**
 * Wrap do auth proxy que injeta CSP per-request. O nonce é colocado no header
 * de request `x-nonce` para que RSC pages possam ler via `headers()` e
 * passar para `<script nonce={...}>` quando precisarem de scripts inline.
 *
 * Skip para webhooks/jobs/health — esses servem JSON para servers externos;
 * CSP não faz sentido e ainda atrapalha logs.
 *
 * Toggle Report-Only ↔ enforce via `env.CSP_ENFORCE` ("0" → Report-Only,
 * "1" → enforce). Default "0" — flow recomendado é deploy report-only por 1
 * semana, monitorar violações no Sentry, depois flipar para enforce.
 */
async function proxy(request: NextRequest): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;

  if (shouldSkipCsp(pathname)) {
    return authProxy(request);
  }

  const nonce = generateNonce();
  const authResponse = await authProxy(request);

  const enforce = env.CSP_ENFORCE === "1";
  const cspValue = buildCspHeader({ nonce, reportOnly: !enforce });
  const cspResponseHeader = enforce ? CSP_HEADER : "Content-Security-Policy-Report-Only";

  // Redirects (401 → /login etc) já vêm como NextResponse.redirect.
  // Setar o header de CSP na resposta é suficiente — o nonce não vai ser
  // usado porque a página renderizada é o destino do redirect (que vai
  // passar pelo proxy de novo e gerar novo nonce).
  if (authResponse.status >= 300 && authResponse.status < 400) {
    authResponse.headers.set(cspResponseHeader, cspValue);
    return authResponse;
  }

  // Caso comum: NextResponse.next() do auth proxy. Reconstruir com headers
  // modificados para que o downstream RSC consiga ler o nonce via `headers()`
  // e o Next consiga extrair o nonce do CSP durante o render.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(CSP_HEADER, cspValue);
  requestHeaders.set(CSP_NONCE_HEADER, nonce);
  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  // Preserva qualquer header que o auth proxy tenha setado (defensivo —
  // a impl atual não seta nenhum, mas se mudar no futuro queremos manter).
  authResponse.headers.forEach((value, key) => {
    if (!response.headers.has(key)) response.headers.set(key, value);
  });
  response.headers.set(cspResponseHeader, cspValue);
  return response;
}

export { proxy };

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};

export default proxy;
