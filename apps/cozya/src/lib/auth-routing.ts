export const AUTH_SIGN_IN_PATH = "/login";
export const AUTH_SIGN_UP_PATH = "/signup";

export const AUTH_PROTECTED_PATHS = ["/dashboard"] as const;

export const AUTH_PUBLIC_PATHS = [
  AUTH_SIGN_IN_PATH,
  AUTH_SIGN_UP_PATH,
  "/verify-email",
  "/reset-password",
  "/magic-link",
  "/accept-invitation",
  "/api/auth",
  "/api/webhooks",
  "/api/jobs",
  "/api/email",
  "/api/health",
] as const;
