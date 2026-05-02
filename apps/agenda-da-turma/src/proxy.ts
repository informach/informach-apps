import { createAuthProxy } from "@informach/auth/proxy";
import { authResult } from "./lib/auth";

/**
 * Paths exempted from session-cookie authentication. Matched as path PREFIXES
 * (so `/api/webhooks` covers `/api/webhooks/stripe`, `/api/webhooks/sendgrid`...).
 *
 * Defensive whitelist: today the proxy only redirects when a path matches
 * `requireAuth` (currently empty), so these would pass anyway. But adding them
 * here means a future `requireAuth: ["/"]` catch-all wouldn't break webhook /
 * cron / email-link / probe traffic that already authenticates by other means.
 *
 *   /login, /signup, /verify-email, /reset-password — auth UI/callbacks
 *   /api/auth        — Better Auth handler (manages its own session lifecycle)
 *   /api/webhooks    — Stripe + SendGrid; auth via HMAC/ECDSA signature
 *   /api/jobs        — cron routes; auth via `Authorization: Bearer ${CRON_SECRET}`
 *   /api/email       — unsubscribe link; auth via HMAC token in query string
 *   /api/health      — Railway liveness probe; no auth needed
 */
export const proxy = createAuthProxy(authResult, {
  requireAuth: ["/dashboard"],
  signInPath: "/login",
  publicPaths: [
    "/login",
    "/signup",
    "/verify-email",
    "/reset-password",
    "/magic-link",
    "/accept-invitation",
    "/api/auth",
    "/api/webhooks",
    "/api/jobs",
    "/api/email",
    "/api/health",
  ],
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};

export default proxy;
