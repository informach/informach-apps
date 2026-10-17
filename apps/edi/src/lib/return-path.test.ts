import { describe, expect, it } from "vitest";
import { safeReturnPath } from "./return-path";

describe("safeReturnPath", () => {
  it("keeps the known internal destinations", () => {
    for (const path of [
      "/conta",
      "/conta?plano=anual",
      "/conta?plano=mensal",
      "/conectar",
      "/downloads",
    ])
      expect(safeReturnPath(path)).toBe(path);
  });
  it("falls back to the account for anything else", () => {
    for (const value of [
      undefined,
      ["/conectar"],
      "https://example.test/conta",
      "//example.test",
      "/conta?plano=vitalicio",
      "/conectar/../api",
      "/\\example.test",
    ])
      expect(safeReturnPath(value)).toBe("/conta");
  });
});
