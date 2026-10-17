/**
 * Caminhos do Better Auth que o Bastidores atende. Todo o resto responde 404.
 *
 * O plugin de duas etapas só intercepta `/sign-in/email`. Qualquer outra rota
 * que crie sessão (confirmar e-mail por código com entrada automática, entrar
 * por código no e-mail, link mágico) seria um caminho sem a segunda etapa. Por
 * isso a lista é fechada: só o que as telas de entrada, de ativação das duas
 * etapas e de troca de senha usam.
 */
export const ALLOWED_AUTH_ROUTES: ReadonlyArray<{ method: "GET" | "POST"; path: string }> = [
  { method: "POST", path: "/sign-in/email" },
  { method: "POST", path: "/sign-out" },
  { method: "GET", path: "/get-session" },
  { method: "POST", path: "/two-factor/enable" },
  { method: "POST", path: "/two-factor/verify-totp" },
  { method: "POST", path: "/two-factor/verify-backup-code" },
  { method: "POST", path: "/email-otp/request-password-reset" },
  { method: "POST", path: "/email-otp/reset-password" },
];

const BASE = "/api/auth";

export function isAllowedAuthRoute(method: string, pathname: string): boolean {
  if (!pathname.startsWith(`${BASE}/`)) return false;
  const path = pathname.slice(BASE.length).replace(/\/+$/, "");
  return ALLOWED_AUTH_ROUTES.some((route) => route.method === method && route.path === path);
}
