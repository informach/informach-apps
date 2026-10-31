import { describe, expect, it } from "vitest";
import { safeDestination } from "./destination";

describe("destino depois do login", () => {
  it("aceita caminhos internos do app", () => {
    expect(safeDestination("/treinos/core-10?x=1")).toBe("/treinos/core-10?x=1");
  });
  it.each(["https://evil.test", "//evil.test", "/\\evil.test", "/api/auth/x", "/entrar", null])(
    "recusa %s",
    (value) => {
      expect(safeDestination(value)).toBe("/perfis");
    },
  );
});
