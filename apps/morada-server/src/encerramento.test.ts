import { afterEach, describe, expect, it, vi } from "vitest";
import { criarEncerramento } from "./encerramento";

function sinal<T>() {
  let resolver: ((valor: T) => void) | undefined;
  const promessa = new Promise<T>((resolve) => {
    resolver = resolve;
  });
  return {
    promessa,
    resolver(valor: T) {
      if (!resolver) throw new Error("Sinal ausente");
      resolver(valor);
    },
  };
}

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("saída ordenada do processo", () => {
  it("aguarda o flush após salvar e não duplica o trabalho por sinais repetidos", async () => {
    vi.useFakeTimers();
    const flush = sinal<void>();
    const salvar = vi.fn().mockResolvedValue({ mundos: 2, falhas: 0 });
    const concluir = vi.fn(() => flush.promessa),
      sair = vi.fn(),
      falhar = vi.fn();
    const encerrar = criarEncerramento({
      salvar,
      concluirObservabilidade: concluir,
      sair,
      aoFalhar: falhar,
      aoIniciar: vi.fn(),
    });
    encerrar("SIGTERM");
    encerrar("SIGINT");
    await vi.advanceTimersByTimeAsync(0);
    expect(salvar).toHaveBeenCalledTimes(1);
    expect(concluir).toHaveBeenCalledTimes(1);
    expect(sair).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(1);
    flush.resolver();
    await vi.advanceTimersByTimeAsync(0);
    expect(sair).toHaveBeenCalledExactlyOnceWith(0);
    expect(falhar).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["resultado", "excecao"])(
    "registra a falha de persistência (%s) antes do flush e sai com 1",
    async (modo) => {
      vi.useFakeTimers();
      const flush = sinal<void>(),
        ordem: string[] = [];
      const sair = vi.fn();
      const salvar = async () => {
        if (modo === "excecao") throw new Error("persistência recusada");
        return { mundos: 2, falhas: 1 };
      };
      criarEncerramento({
        salvar,
        concluirObservabilidade: () => {
          ordem.push("flush");
          return flush.promessa;
        },
        aoFalhar: () => {
          ordem.push("falha");
        },
        aoIniciar: vi.fn(),
        sair,
      })("SIGTERM");
      await vi.advanceTimersByTimeAsync(0);
      expect(ordem).toEqual(["falha", "flush"]);
      expect(sair).not.toHaveBeenCalled();
      flush.resolver();
      await vi.advanceTimersByTimeAsync(0);
      expect(sair).toHaveBeenCalledExactlyOnceWith(1);
    },
  );

  it("falha do flush também termina de forma observada, sem rejeição solta", async () => {
    vi.useFakeTimers();
    const erro = new Error("transporte recusado"),
      sair = vi.fn(),
      falhar = vi.fn();
    criarEncerramento({
      salvar: async () => ({ mundos: 0, falhas: 0 }),
      concluirObservabilidade: async () => {
        throw erro;
      },
      aoIniciar: vi.fn(),
      aoFalhar: falhar,
      sair,
    })("SIGTERM");
    await vi.advanceTimersByTimeAsync(0);
    expect(falhar).toHaveBeenCalledExactlyOnceWith(erro);
    expect(sair).toHaveBeenCalledExactlyOnceWith(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["persistencia", "flush"])(
    "mantém o limite total de 25 s durante %s e não sai duas vezes",
    async (fase) => {
      vi.useFakeTimers();
      const persistencia = sinal<{ mundos: number; falhas: number }>(),
        flush = sinal<void>(),
        sair = vi.fn();
      criarEncerramento({
        salvar: () => persistencia.promessa,
        concluirObservabilidade: () => flush.promessa,
        aoIniciar: vi.fn(),
        aoFalhar: vi.fn(),
        sair,
      })("SIGTERM");
      if (fase === "flush") persistencia.resolver({ mundos: 1, falhas: 0 });
      await vi.advanceTimersByTimeAsync(24_999);
      expect(sair).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(sair).toHaveBeenCalledExactlyOnceWith(1);
      persistencia.resolver({ mundos: 1, falhas: 0 });
      flush.resolver();
      await vi.advanceTimersByTimeAsync(0);
      expect(sair).toHaveBeenCalledTimes(1);
    },
  );
});
