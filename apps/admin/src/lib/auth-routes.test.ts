import { describe, expect, it } from "vitest";
import { isAllowedAuthRoute } from "./auth-routes";

describe("rotas de autenticação do Bastidores", () => {
  it("atende só a entrada com senha e duas etapas, a ativação e a troca de senha", () => {
    expect(isAllowedAuthRoute("POST", "/api/auth/sign-in/email")).toBe(true);
    expect(isAllowedAuthRoute("POST", "/api/auth/two-factor/verify-totp")).toBe(true);
    expect(isAllowedAuthRoute("POST", "/api/auth/two-factor/verify-backup-code")).toBe(true);
    expect(isAllowedAuthRoute("POST", "/api/auth/two-factor/enable")).toBe(true);
    expect(isAllowedAuthRoute("POST", "/api/auth/email-otp/request-password-reset")).toBe(true);
    expect(isAllowedAuthRoute("POST", "/api/auth/email-otp/reset-password")).toBe(true);
    expect(isAllowedAuthRoute("POST", "/api/auth/sign-out")).toBe(true);
    expect(isAllowedAuthRoute("GET", "/api/auth/get-session")).toBe(true);
  });

  it("recusa toda rota que criaria sessão sem a segunda etapa", () => {
    for (const path of [
      "/api/auth/email-otp/verify-email",
      "/api/auth/email-otp/send-verification-otp",
      "/api/auth/sign-in/email-otp",
      "/api/auth/sign-in/magic-link",
      "/api/auth/magic-link/verify",
      "/api/auth/verify-email",
      "/api/auth/sign-up/email",
      "/api/auth/sign-in/social",
    ]) {
      expect(isAllowedAuthRoute("POST", path)).toBe(false);
      expect(isAllowedAuthRoute("GET", path)).toBe(false);
    }
  });

  it("recusa o que muda a conta por fora das telas", () => {
    for (const path of [
      "/api/auth/two-factor/disable",
      "/api/auth/two-factor/get-totp-uri",
      "/api/auth/two-factor/generate-backup-codes",
      "/api/auth/update-user",
      "/api/auth/change-email",
      "/api/auth/change-password",
      "/api/auth/delete-user",
      "/api/auth/list-sessions",
      "/api/auth/revoke-sessions",
      "/api/auth/forget-password/email-otp",
    ]) {
      expect(isAllowedAuthRoute("POST", path)).toBe(false);
    }
  });

  it("não aceita método trocado nem caminho fora de /api/auth", () => {
    expect(isAllowedAuthRoute("GET", "/api/auth/sign-in/email")).toBe(false);
    expect(isAllowedAuthRoute("POST", "/sign-in/email")).toBe(false);
    expect(isAllowedAuthRoute("POST", "/api/auth/sign-in/email/../email-otp")).toBe(false);
  });
});
