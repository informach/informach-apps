import { createAuthProxy } from "@informach/auth/proxy";
import { authResult } from "./lib/auth";

/**
 * Paths exempted from session-cookie authentication. Matched as path PREFIXES.
 *
 * Auth single-user, OTP-only — verify/reset acontecem multi-step dentro dos
 * forms de login/signup, não em páginas dedicadas (paths abaixo são apenas
 * defensivos caso o package gere callbacks com esses prefixos).
 */
export const proxy = createAuthProxy(authResult, {
  requireAuth: ["/dashboard", "/choose-plan", "/upgrade", "/settings"],
  signInPath: "/login",
  publicPaths: [
    "/login",
    "/signup",
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
