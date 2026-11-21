import { describe, expect, it } from "vitest";
import {
  conferirConfiguracaoFinanceiraDoEncerramento,
  criarRuntimeFinanceiroDoEncerramento,
} from "./financeiro-runtime";

describe("composição financeira restrita do encerramento", () => {
  const flags = { RECREIO_PORTAL_RENEWAL_MODE: "native", RECREIO_RENEWAL_JOBS_MODE: "on" };
  it("compõe somente inventário com configuração explícita, sem dependência de login/email", () => {
    const runtime = criarRuntimeFinanceiroDoEncerramento({
      ...flags,
      STRIPE_MODE: "dev",
      STRIPE_SECRET_KEY: "rk_test_closed_runtime_only",
    });
    expect(runtime.modo).toBe("dev");
    expect(runtime.inventario.inspect).toBeTypeOf("function");
    expect(Object.keys(runtime)).toEqual(["modo", "inventario"]);
  });
  it.each([
    {},
    { ...flags, STRIPE_MODE: "prod", STRIPE_SECRET_KEY: "rk_test_closed_runtime_only" },
    { ...flags, STRIPE_MODE: "dev", STRIPE_SECRET_KEY: "rk_live_closed_runtime_only" },
    { ...flags, STRIPE_MODE: "dev" },
    {
      ...flags,
      STRIPE_MODE: "dev",
      STRIPE_SECRET_KEY: "rk_test_closed_runtime_only",
      RECREIO_RENEWAL_JOBS_MODE: "off",
    },
  ])("recusa configuração incompleta/desligada ou chave de outro modo", (input) => {
    expect(() => conferirConfiguracaoFinanceiraDoEncerramento(input)).toThrowError(
      expect.objectContaining({ code: "INDISPONIVEL" }),
    );
  });
});
