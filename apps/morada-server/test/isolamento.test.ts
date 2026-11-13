import { describe, expect, it, vi } from "vitest";
import { criarBancada, mundoDe } from "./apoio";

function sinal(): { promise: Promise<void>; resolve(): void } {
  let resolver: () => void;
  const promise = new Promise<void>((resolve) => {
    resolver = resolve;
  });
  return { promise, resolve: () => resolver() };
}

describe("isolamento dos passos entre mundos", () => {
  it("um diário lento não bloqueia outro mundo nem acumula passos no mundo ocupado", async () => {
    const bancada = await criarBancada();
    const { instancia, host } = await bancada.novaInstancia();
    const lia = bancada.jogador("Lia");
    const bruno = bancada.jogador("Bruno");
    const a = bancada.criarMundo(lia);
    const b = bancada.criarMundo(bruno);
    await bancada.entrar(lia, a);
    await bancada.entrar(bruno, b);
    const morador = lia.moradorDeNome("Lia").id;
    await lia.comando(morador, { t: "reservar" });
    await instancia.passo();
    await lia.comando(morador, { t: "definir_preferido", valor: true });

    const liberar = sinal();
    const escrevendo = sinal();
    const segundoPronto = sinal();
    const anexar = host.anexarAoDiario;
    const escrita = vi.spyOn(host, "anexarAoDiario").mockImplementation(async (pedido) => {
      if (pedido.mundoId === a) {
        escrevendo.resolve();
        await liberar.promise;
      }
      return anexar(pedido);
    });
    const atorB = instancia.ator(b);
    if (!atorB) throw new Error("sem segundo mundo");
    const passoB = atorB.passo.bind(atorB);
    vi.spyOn(atorB, "passo").mockImplementation(async () => {
      await passoB();
      segundoPronto.resolve();
    });
    const primeiro = instancia.passo();
    try {
      await Promise.all([escrevendo.promise, segundoPronto.promise]);
      const tickA = mundoDe(instancia, a).estado.relogio.tick;
      const tickB = mundoDe(instancia, b).estado.relogio.tick;
      for (let i = 0; i < 3; i++) await instancia.passo();
      expect(mundoDe(instancia, a).estado.relogio.tick).toBe(tickA);
      expect(mundoDe(instancia, b).estado.relogio.tick).toBe(tickB + 3);
      expect(escrita).toHaveBeenCalledTimes(1);
    } finally {
      liberar.resolve();
      await primeiro;
      await instancia.encerrar();
    }
  });
});
