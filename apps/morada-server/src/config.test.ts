import { describe, expect, it } from "vitest";
import { lerConfiguracao } from "./config";

const completa = {
  RECREIO_API_URL: "https://recreio.example",
  RECREIO_HOST_SECRET: "s".repeat(32),
  MORADA_PUBLIC_URL: "wss://morada-server.example",
  MORADA_ORIGENS: "https://recreio.example, https://outro.example",
};

describe("configuração do servidor", () => {
  it("lê os padrões e a lista de origens", () => {
    const config = lerConfiguracao(completa);
    expect(config).toMatchObject({
      PORT: 3010,
      MORADA_PLATAFORMA: "recreio",
      MORADA_CAPACIDADE: 200,
      MORADA_REGRAS: "padrao",
      MORADA_ORIGENS: ["https://recreio.example", "https://outro.example"],
    });
  });

  it("no modo de verdade, exige o Recreio, o segredo, o endereço e as origens", () => {
    for (const falta of Object.keys(completa)) {
      const env: Record<string, string> = { ...completa };
      delete env[falta];
      expect(() => lerConfiguracao(env), falta).toThrow(new RegExp(falta));
    }
  });

  it("o erro diz o nome da variável e nunca o valor", () => {
    const segredo = "curto-demais";
    try {
      lerConfiguracao({ ...completa, RECREIO_HOST_SECRET: segredo });
      throw new Error("devia ter falhado");
    } catch (erro) {
      const mensagem = (erro as Error).message;
      expect(mensagem).toContain("RECREIO_HOST_SECRET");
      expect(mensagem).not.toContain(segredo);
    }
  });

  it("em produção, só https, wss e a plataforma de verdade", () => {
    const producao = { ...completa, NODE_ENV: "production" };
    expect(lerConfiguracao(producao).NODE_ENV).toBe("production");
    expect(() =>
      lerConfiguracao({ ...producao, RECREIO_API_URL: "http://recreio.example" }),
    ).toThrow(/RECREIO_API_URL/);
    expect(() =>
      lerConfiguracao({ ...producao, MORADA_PUBLIC_URL: "ws://morada.example" }),
    ).toThrow(/MORADA_PUBLIC_URL/);
    expect(() =>
      lerConfiguracao({ ...producao, MORADA_ORIGENS: "http://recreio.example" }),
    ).toThrow(/MORADA_ORIGENS/);
    expect(() => lerConfiguracao({ NODE_ENV: "production", MORADA_PLATAFORMA: "falsa" })).toThrow(
      /MORADA_PLATAFORMA/,
    );
  });

  it("a plataforma em memória não pede nada além de não estar em produção", () => {
    expect(lerConfiguracao({ MORADA_PLATAFORMA: "falsa" })).toMatchObject({
      MORADA_PLATAFORMA: "falsa",
      MORADA_ORIGENS: [],
    });
  });
});
