import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * O registro lê `RECREIO_CLIENTE_DE_TESTE` quando o módulo é carregado: no
 * build o Next troca a variável por um valor fixo. Aqui cada teste carrega o
 * módulo de novo com o valor que quer.
 */
async function registroCom(valor: string | undefined) {
  vi.resetModules();
  vi.stubEnv("RECREIO_CLIENTE_DE_TESTE", valor);
  return import("./registro");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("registro dos clientes de jogo", () => {
  it.each([undefined, "", "0", "true"])(
    "sem a opção do build (%j), o jogo de teste não tem cliente",
    async (valor) => {
      const { carregadorDoJogo, temCliente } = await registroCom(valor);
      expect(temCliente("teste")).toBe(false);
      expect(carregadorDoJogo("teste")).toBeNull();
    },
  );

  it("com a opção do build, o cliente do jogo de teste é carregado sob demanda", async () => {
    const { carregadorDoJogo, temCliente } = await registroCom("1");
    expect(temCliente("teste")).toBe(true);
    const carregar = carregadorDoJogo("teste");
    const modulo = await carregar?.();
    expect(typeof modulo?.montar).toBe("function");
  });

  it("jogo sem cliente no portal não tem página, esteja ou não no catálogo", async () => {
    for (const valor of ["", "1"]) {
      const { carregadorDoJogo, temCliente } = await registroCom(valor);
      // O Morada entra aqui no lote que ligar o cliente dele.
      expect(temCliente("morada")).toBe(false);
      expect(temCliente("nao-existe")).toBe(false);
      // Nome de propriedade herdada não vira jogo.
      expect(carregadorDoJogo("toString")).toBeNull();
      expect(carregadorDoJogo("__proto__")).toBeNull();
    }
  });
});
