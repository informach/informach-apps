import { createAuthProxy } from "@informach/auth/proxy";
import { authResult } from "./lib/auth";
import { AUTH_PROTECTED_PATHS, AUTH_PUBLIC_PATHS, AUTH_SIGN_IN_PATH } from "./lib/auth-routing";

/**
 * Paths exempted from session-cookie authentication. Matched as path PREFIXES
 * (so `/api/webhooks` covers `/api/webhooks/stripe`, `/api/webhooks/sendgrid`...).
 *
 * Keep non-page entry points public because they authenticate by their own
 * signature/token mechanisms.
 *
 *   /login, /signup, /verify-email, /reset-password — auth UI
 *   /api/auth        — Better Auth handler (manages its own session lifecycle)
 *   /api/webhooks    — Stripe + SendGrid; auth via HMAC/ECDSA signature
 *   /api/jobs        — cron routes; auth via `Authorization: Bearer ${CRON_SECRET}`
 *   /api/email       — unsubscribe link; auth via HMAC token in query string
 *   /api/health      — Railway liveness probe; no auth needed
 */
export const proxy = createAuthProxy(authResult, {
  requireAuth: [...AUTH_PROTECTED_PATHS],
  signInPath: AUTH_SIGN_IN_PATH,
  publicPaths: [...AUTH_PUBLIC_PATHS],
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};

export default proxy;
