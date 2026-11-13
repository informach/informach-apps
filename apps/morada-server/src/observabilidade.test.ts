import { ErroDoRecreio } from "@informach/recreio";
import * as Sentry from "@sentry/node";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { iniciarObservabilidade, registrarFalha } from "./observabilidade";

vi.mock("@sentry/node", () => ({ init: vi.fn(), captureMessage: vi.fn(), flush: vi.fn() }));

describe("observabilidade do servidor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("não inicia o transporte sem DSN", () => {
    iniciarObservabilidade(undefined, "commit");
    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it("reconstrói o evento sem requisição, contexto, breadcrumbs ou mensagem livre", async () => {
    iniciarObservabilidade("https://public@example.test/1", "commit");
    const opcoes = vi.mocked(Sentry.init).mock.calls[0]?.[0];
    expect(opcoes?.defaultIntegrations).toBe(false);
    if (!opcoes?.beforeSend) throw new Error("sem filtro");
    const evento = await opcoes.beforeSend(
      {
        type: undefined,
        message: "token privado",
        user: { email: "pessoa@example.test" },
        request: { headers: { Authorization: "Bearer segredo" } },
        tags: { operation: "rede", code: "INTERNO", apelido: "Lia" },
        extra: { mundo: "história da família" },
        breadcrumbs: [{ message: "segredo" }],
      },
      {},
    );
    expect(evento).toMatchObject({
      message: "morada.server_failure",
      tags: { app: "morada-server", operation: "rede", code: "INTERNO" },
    });
    const texto = JSON.stringify(evento);
    for (const sensivel of ["token privado", "pessoa@", "Bearer", "segredo", "apelido", "história"])
      expect(texto).not.toContain(sensivel);
    registrarFalha(new Error("segredo"), "rede");
    expect(Sentry.captureMessage).toHaveBeenLastCalledWith("morada.server_failure", {
      level: "error",
      tags: { operation: "rede", code: "INTERNO" },
    });
    registrarFalha(new ErroDoRecreio("POSSE_PERDIDA"), "encerrar");
    expect(Sentry.captureMessage).toHaveBeenLastCalledWith("morada.server_failure", {
      level: "error",
      tags: { operation: "encerrar", code: "POSSE_PERDIDA" },
    });
  });
});
