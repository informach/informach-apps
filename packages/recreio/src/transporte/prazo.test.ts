import { afterEach, describe, expect, it, vi } from "vitest";
import { comPrazoDePedido, TEMPO_LIMITE_DO_PEDIDO_MS } from "./prazo";

afterEach(() => vi.useRealTimers());

describe("prazo da operação HTTP completa", () => {
  it("termina mesmo se o adapter não atender ao cancelamento e ignora resultado atrasado", async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    let concluir: ((valor: string) => void) | undefined;
    const atrasada = new Promise<string>((resolve) => {
      concluir = resolve;
    });
    const pedido = comPrazoDePedido(async (sinal) => {
      signal = sinal;
      return atrasada;
    });
    const recusa = expect(pedido).rejects.toMatchObject({ codigo: "INDISPONIVEL" });
    await vi.advanceTimersByTimeAsync(TEMPO_LIMITE_DO_PEDIDO_MS);
    await recusa;
    expect(signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    if (!concluir) throw new Error("Adapter não iniciado");
    concluir("resposta tardia");
    await expect(pedido).rejects.toMatchObject({ codigo: "INDISPONIVEL" });
  });

  it("cobre também o corpo que fica aberto depois dos cabeçalhos", async () => {
    vi.useFakeTimers();
    let cancelou = false;
    const pedido = comPrazoDePedido(async (signal) => {
      const corpo = new ReadableStream<Uint8Array>({
        start(controlador) {
          controlador.enqueue(new TextEncoder().encode('{"parcial":'));
          signal.addEventListener(
            "abort",
            () => {
              cancelou = true;
              controlador.error(new DOMException("Cancelado", "AbortError"));
            },
            { once: true },
          );
        },
      });
      return new Response(corpo).json();
    });
    const recusa = expect(pedido).rejects.toMatchObject({ codigo: "INDISPONIVEL" });
    await vi.advanceTimersByTimeAsync(TEMPO_LIMITE_DO_PEDIDO_MS);
    await recusa;
    expect(cancelou).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("limpa o temporizador ao concluir ou falhar e conserva a recusa original", async () => {
    vi.useFakeTimers();
    expect(await comPrazoDePedido(async () => "concluido")).toBe("concluido");
    expect(vi.getTimerCount()).toBe(0);
    const erro = new Error("recusa de prova");
    await expect(
      comPrazoDePedido(() => {
        throw erro;
      }),
    ).rejects.toBe(erro);
    expect(vi.getTimerCount()).toBe(0);
  });
});
