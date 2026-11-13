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

  it("o endereço público é só a origem do WebSocket, como o Recreio a cadastra", () => {
    // Com ou sem a barra final, o que a instância registra é a origem.
    for (const escrita of ["ws://localhost:3110", "ws://localhost:3110/"]) {
      expect(lerConfiguracao({ ...completa, MORADA_PUBLIC_URL: escrita }).MORADA_PUBLIC_URL).toBe(
        "ws://localhost:3110",
      );
    }
    for (const errada of [
      "wss://morada-server.example/jogo",
      "wss://morada-server.example/?a=1",
      "https://morada-server.example",
      "wss://usuario:senha@morada-server.example",
    ]) {
      expect(() => lerConfiguracao({ ...completa, MORADA_PUBLIC_URL: errada }), errada).toThrow(
        /MORADA_PUBLIC_URL/,
      );
    }
  });

  it("cada origem de página é só uma origem, como o navegador a manda", () => {
    for (const errada of ["https://recreio.example/", "https://recreio.example/jogar", "recreio"]) {
      expect(() => lerConfiguracao({ ...completa, MORADA_ORIGENS: errada }), errada).toThrow(
        /MORADA_ORIGENS/,
      );
    }
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

  it("aceita HTTP só na rede privada Railway, com emissor público explícito", () => {
    const privada = {
      ...completa,
      NODE_ENV: "production",
      RECREIO_API_URL: "http://informachrecreio.railway.internal:3009",
      RECREIO_EMISSOR: "https://recreio.example",
    };
    expect(lerConfiguracao(privada).RECREIO_API_URL).toBe(privada.RECREIO_API_URL);
    expect(() => lerConfiguracao({ ...privada, RECREIO_EMISSOR: undefined })).toThrow(
      /RECREIO_EMISSOR/,
    );
    for (const origem of [
      "http://recreio.example",
      "http://localhost:3009",
      "http://railway.internal",
      "http://foo.railway.internal.example",
      "http://user:password@foo.railway.internal",
      "http://foo.railway.internal/caminho",
      "ftp://foo.railway.internal",
    ])
      expect(() => lerConfiguracao({ ...privada, RECREIO_API_URL: origem })).toThrow(
        /RECREIO_API_URL/,
      );
    expect(() =>
      lerConfiguracao({ ...privada, RECREIO_EMISSOR: "http://recreio.example" }),
    ).toThrow(/RECREIO_EMISSOR/);
  });
});
