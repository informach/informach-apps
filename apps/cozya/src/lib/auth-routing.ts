export const AUTH_SIGN_IN_PATH = "/login";
export const AUTH_SIGN_UP_PATH = "/signup";

export const AUTH_PROTECTED_PATHS = [
  "/hoje",
  "/dashboard",
  "/semana",
  "/compras",
  "/receitas",
  "/choose-plan",
  "/settings",
  "/upgrade",
] as const;

// Credentials, verification and family invitations belong to Conta. Cozya only
// initiates SSO and accepts its callback; it does not issue local credentials.
export const AUTH_PUBLIC_PATHS = [
  AUTH_SIGN_IN_PATH,
  AUTH_SIGN_UP_PATH,
  "/api/auth",
  "/api/webhooks",
  "/api/jobs",
  "/api/email",
  "/api/health",
  "/api/ready",
] as const;
