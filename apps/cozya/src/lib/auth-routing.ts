export const AUTH_SIGN_IN_PATH = "/login";
export const AUTH_SIGN_UP_PATH = "/signup";

export const AUTH_PROTECTED_PATHS = ["/dashboard", "/choose-plan", "/settings"] as const;

// Cozya is OTP-only (no magic-link, no link-based verification or password
// reset, no organizations). The legacy `/verify-email`, `/reset-password`,
// `/magic-link` and `/accept-invitation` routes are intentionally absent —
// none of those flows are enabled in `lib/auth.ts`.
export const AUTH_PUBLIC_PATHS = [
  AUTH_SIGN_IN_PATH,
  AUTH_SIGN_UP_PATH,
  "/api/auth",
  "/api/webhooks",
  "/api/jobs",
  "/api/email",
  "/api/health",
] as const;
