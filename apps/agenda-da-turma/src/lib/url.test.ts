import { describe, expect, it } from "vitest";
import { safeInternalPath } from "./url";

describe("safeInternalPath", () => {
  it("retorna fallback quando value é undefined", () => {
    expect(safeInternalPath(undefined, "/dashboard")).toBe("/dashboard");
  });

  it("retorna fallback quando value é string vazia", () => {
    expect(safeInternalPath("", "/dashboard")).toBe("/dashboard");
  });

  it("retorna o path quando começa com `/` (não `/api/` nem `/login`)", () => {
    expect(safeInternalPath("/dashboard", "/fallback")).toBe("/dashboard");
    expect(safeInternalPath("/atividades", "/fallback")).toBe("/atividades");
    expect(safeInternalPath("/settings/billing", "/fallback")).toBe("/settings/billing");
  });

  it("rejeita protocol-relative URL (`//host`)", () => {
    expect(safeInternalPath("//attacker.com", "/dashboard")).toBe("/dashboard");
    expect(safeInternalPath("//attacker.com/dashboard", "/dashboard")).toBe("/dashboard");
  });

  it("rejeita o que o navegador transforma em `//host` na hora de navegar", () => {
    const backslash = String.fromCharCode(0x5c);
    const tab = String.fromCharCode(0x09);
    const newline = String.fromCharCode(0x0a);
    // Barra invertida vira barra, e tab e quebra de linha são descartados.
    expect(safeInternalPath(`/${backslash}evil.com`, "/dashboard")).toBe("/dashboard");
    expect(safeInternalPath(`/${backslash}/evil.com`, "/dashboard")).toBe("/dashboard");
    expect(safeInternalPath(`/${tab}/evil.com`, "/dashboard")).toBe("/dashboard");
    expect(safeInternalPath(`/${newline}/evil.com`, "/dashboard")).toBe("/dashboard");
    // Caminho comum, com query, continua valendo.
    expect(safeInternalPath("/upgrade?cycle=anual", "/dashboard")).toBe("/upgrade?cycle=anual");
    expect(safeInternalPath("/familia/convite?token=abc", "/dashboard")).toBe(
      "/familia/convite?token=abc",
    );
  });

  it("rejeita URL absoluta", () => {
    expect(safeInternalPath("https://attacker.com/", "/dashboard")).toBe("/dashboard");
    expect(safeInternalPath("http://attacker.com/", "/dashboard")).toBe("/dashboard");
  });

  it("rejeita path que não começa com `/`", () => {
    expect(safeInternalPath("dashboard", "/fallback")).toBe("/fallback");
    expect(safeInternalPath("javascript:alert(1)", "/fallback")).toBe("/fallback");
  });

  it("rejeita /login (evita loop após auth bem-sucedido)", () => {
    expect(safeInternalPath("/login", "/dashboard")).toBe("/dashboard");
  });

  it("rejeita prefixo /api/ (endpoint não é UI page)", () => {
    expect(safeInternalPath("/api/auth/sign-out", "/dashboard")).toBe("/dashboard");
    expect(safeInternalPath("/api/data/schools", "/dashboard")).toBe("/dashboard");
  });

  it("aceita /login? como path válido (não é match exato com /login)", () => {
    // Edge case: /loginX é um path diferente — não bloqueamos. Strict equality
    // pra /login é proposital pra evitar loop pós-login mas não restringir
    // paths que começam com "login".
    expect(safeInternalPath("/loginsuccess", "/dashboard")).toBe("/loginsuccess");
  });

  it("normaliza array de query params pegando o primeiro", () => {
    // Next aceita `?next=a&next=b` virando `["a","b"]`. Pegamos só o primeiro.
    expect(safeInternalPath(["/dashboard", "/atividades"], "/fallback")).toBe("/dashboard");
  });

  it("retorna fallback quando array está vazio", () => {
    expect(safeInternalPath([], "/dashboard")).toBe("/dashboard");
  });
});
