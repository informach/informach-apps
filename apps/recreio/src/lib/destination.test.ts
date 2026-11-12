import { describe, expect, it } from "vitest";
import { safeDestination } from "./destination";

describe("destino depois do login", () => {
  it("aceita caminhos internos do app", () => {
    expect(safeDestination("/conta?aba=perfil")).toBe("/conta?aba=perfil");
  });
  it.each(["https://evil.test", "//evil.test", "/\\evil.test", "/api/auth/x", "/entrar", null])(
    "recusa %s",
    (value) => {
      expect(safeDestination(value)).toBe("/estante");
    },
  );
  it("recusa caminhos longos demais", () => {
    expect(safeDestination(`/${"a".repeat(300)}`)).toBe("/estante");
  });
});
