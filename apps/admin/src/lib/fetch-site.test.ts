import { describe, expect, it } from "vitest";
import { isSameOriginRequest, needsConfirmation } from "./fetch-site";

describe("Sec-Fetch-Site", () => {
  it("a ficha abre direto por endereço digitado ou clique de dentro", () => {
    expect(needsConfirmation("none")).toBe(false);
    expect(needsConfirmation("same-origin")).toBe(false);
  });

  it("a ficha pede confirmação quando o link veio de outro site, de outro subdomínio ou sem cabeçalho", () => {
    expect(needsConfirmation("cross-site")).toBe(true);
    expect(needsConfirmation("same-site")).toBe(true);
    expect(needsConfirmation(null)).toBe(true);
  });

  it("a exportação só atende o clique de dentro do Bastidores", () => {
    expect(isSameOriginRequest("same-origin")).toBe(true);
    for (const value of ["none", "same-site", "cross-site", null])
      expect(isSameOriginRequest(value), String(value)).toBe(false);
  });
});
