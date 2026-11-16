import { describe, expect, it, vi } from "vitest";
import { PreparoDaCena } from "./preparo-da-cena";

function espera() {
  let soltar: (() => void) | undefined;
  let recusar: ((erro: unknown) => void) | undefined;
  const promessa = new Promise<void>((resolve, reject) => {
    soltar = resolve;
    recusar = reject;
  });
  return {
    promessa,
    concluir() {
      if (!soltar) throw new Error("Espera não iniciada");
      soltar();
    },
    falhar(erro: unknown) {
      if (!recusar) throw new Error("Espera não iniciada");
      recusar(erro);
    },
  };
}
async function assentar() {
  for (let n = 0; n < 6; n++) await Promise.resolve();
}

describe("preparação dos programas sem bloquear o desenho da interface", () => {
  it("mantém somente um trabalho pendente e prepara a última alteração em seguida", async () => {
    const a = espera(),
      b = espera();
    let chamadas = 0;
    const falha = vi.fn();
    const preparo = new PreparoDaCena(() => (++chamadas === 1 ? a.promessa : b.promessa), falha);
    expect(preparo.pronta()).toBe(false);
    await assentar();
    for (let i = 0; i < 50; i++) {
      preparo.invalidar();
      expect(preparo.pronta()).toBe(false);
    }
    expect(chamadas).toBe(1);
    a.concluir();
    await assentar();
    expect(preparo.pronta()).toBe(false);
    await assentar();
    expect(chamadas).toBe(2);
    b.concluir();
    await assentar();
    expect(preparo.pronta()).toBe(true);
    expect(preparo.pronta()).toBe(true);
    expect(chamadas).toBe(2);
    expect(falha).not.toHaveBeenCalled();
  });

  it("falha atual é entregue uma vez e não inicia retentativas por quadro", async () => {
    const a = espera(),
      falha = vi.fn();
    let chamadas = 0;
    const preparo = new PreparoDaCena(() => {
      chamadas++;
      return a.promessa;
    }, falha);
    const erro = new Error("programa recusado");
    preparo.pronta();
    await assentar();
    a.falhar(erro);
    await assentar();
    for (let i = 0; i < 50; i++) expect(preparo.pronta()).toBe(false);
    expect(chamadas).toBe(1);
    expect(falha).toHaveBeenCalledExactlyOnceWith(erro);
  });

  it("restauração invalida o resultado e a falha do contexto anterior", async () => {
    const a = espera(),
      falha = vi.fn();
    let chamadas = 0;
    const preparo = new PreparoDaCena(
      () => (++chamadas === 1 ? a.promessa : Promise.resolve()),
      falha,
    );
    preparo.pronta();
    await assentar();
    preparo.invalidar();
    a.falhar(new Error("contexto anterior"));
    await assentar();
    expect(preparo.pronta()).toBe(false);
    await assentar();
    expect(preparo.pronta()).toBe(true);
    expect(falha).not.toHaveBeenCalled();
  });

  it("desmontagem antes da microtarefa não toca o renderer descartado", async () => {
    const compilar = vi.fn(async () => {}),
      falha = vi.fn();
    const preparo = new PreparoDaCena(compilar, falha);
    preparo.pronta();
    preparo.dispose();
    await assentar();
    expect(compilar).not.toHaveBeenCalled();
    expect(preparo.pronta()).toBe(false);
  });

  it("desmontagem durante a preparação ignora o resultado atrasado", async () => {
    const a = espera(),
      falha = vi.fn();
    const preparo = new PreparoDaCena(() => a.promessa, falha);
    preparo.pronta();
    await assentar();
    preparo.dispose();
    a.concluir();
    await assentar();
    expect(preparo.pronta()).toBe(false);
    expect(falha).not.toHaveBeenCalled();
  });
});
