import { criarRecreio, ErroDoRecreio } from "@informach/recreio/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { confirmarFinalizacao } from "./finalizacao";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-17T12:00:00Z"));
});
afterEach(() => vi.useRealTimers());

async function preparar(consultar: () => Promise<Response>) {
  const contexto = await criarRecreio({
    baseUrl: "https://recreio.test",
    jogo: "teste",
    salvamentoRestrito: true,
    obterIngresso: async () => "ingresso",
    fetch: async (url) =>
      url.endsWith("/sessao")
        ? Response.json({
            token: "sessao",
            expiraEm: new Date(Date.now() + 60_000).toISOString(),
            perfil: {
              profileId: "6f1f0a52-7a3b-4d58-9a55-0e4a3c1f2b10",
              apelido: "Lia",
              avatar: "sol",
            },
            politica: { multiplayer: true, textoLivre: false, faixa: "18", versao: 1 },
            salvamento: {
              token: "capacidade",
              expiraEm: new Date(Date.now() + 90_000).toISOString(),
            },
          })
        : consultar(),
  });
  const capacidade = contexto.sessao.salvamento;
  if (!capacidade) throw new Error("Capacidade ausente");
  return { contexto, capacidade };
}
const resposta = (estado: "ready" | "completed" | "conflicted") =>
  Response.json({ estado, expiraEm: new Date(Date.now() + 30_000).toISOString() });

describe("confirmação de salvamento no hospedeiro", () => {
  it("conclusão do módulo não é confirmação enquanto o recibo real do SDK estiver pronto", async () => {
    let terminal = false;
    const r = await preparar(async () => resposta(terminal ? "completed" : "ready"));
    let confirmou = false;
    const fim = confirmarFinalizacao(r.capacidade, async () => undefined).then((estado) => {
      confirmou = true;
      return estado;
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(confirmou).toBe(false);
    await expect(r.contexto.mundos.listar()).rejects.toMatchObject({ codigo: "SESSAO_ENCERRADA" });
    terminal = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(await fim).toBe("completed");
  });
  it("resposta incerta do módulo é recuperada pelo recibo confirmado", async () => {
    const r = await preparar(async () => resposta("completed"));
    expect(
      await confirmarFinalizacao(r.capacidade, async () => {
        throw new ErroDoRecreio("INDISPONIVEL");
      }),
    ).toBe("completed");
  });
  it("conflito preservado nunca é convertido em confirmação sem conflito", async () => {
    const r = await preparar(async () => resposta("conflicted"));
    expect(await confirmarFinalizacao(r.capacidade, async () => undefined)).toBe("conflicted");
  });
  it("recibo que permanece pronto termina sem anunciar salvamento", async () => {
    const r = await preparar(async () => resposta("ready"));
    const fim = expect(
      confirmarFinalizacao(r.capacidade, async () => undefined),
    ).rejects.toMatchObject({ codigo: "INDISPONIVEL" });
    await vi.advanceTimersByTimeAsync(30_000);
    await fim;
  });
  it("revogação atual recusa sem transformar a conclusão do módulo em sucesso", async () => {
    const r = await preparar(async () =>
      Response.json({ codigo: "SESSAO_INVALIDA" }, { status: 401 }),
    );
    await expect(confirmarFinalizacao(r.capacidade, async () => undefined)).rejects.toMatchObject({
      codigo: "SESSAO_INVALIDA",
    });
  });
});
