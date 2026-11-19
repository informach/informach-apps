import { describe, expect, it } from "vitest";
import { envioComercialDisponivel, segredoStripeCompativel } from "./commercial-mode";

describe("composição de cobrança por modo", () => {
  it("off/setup não enviam, sandbox/live compartilham os mesmos escritores", () => {
    expect(envioComercialDisponivel("off")).toBe(false);
    expect(envioComercialDisponivel("setup")).toBe(false);
    expect(envioComercialDisponivel("sandbox")).toBe(true);
    expect(envioComercialDisponivel("live")).toBe(true);
  });
  it("chaves secretas/restritas só pertencem ao próprio modo", () => {
    for (const prefixo of ["sk", "rk"]) {
      expect(segredoStripeCompativel("dev", `${prefixo}_test_isolated_not_sent`)).toBe(true);
      expect(segredoStripeCompativel("prod", `${prefixo}_live_isolated_not_sent`)).toBe(true);
      expect(segredoStripeCompativel("dev", `${prefixo}_live_isolated_not_sent`)).toBe(false);
      expect(segredoStripeCompativel("prod", `${prefixo}_test_isolated_not_sent`)).toBe(false);
    }
    expect(segredoStripeCompativel("prod", "pk_live_isolated_not_sent")).toBe(false);
    expect(segredoStripeCompativel("dev", undefined)).toBe(false);
  });
});
