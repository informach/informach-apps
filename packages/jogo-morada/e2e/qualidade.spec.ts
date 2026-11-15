import { expect, test } from "@playwright/test";
import { entrar, retrato } from "./apoio";

declare global {
  interface Window {
    gpuDoEnsaio?: {
      reter: boolean;
      pendentes: number;
      maximo: number;
      consultas: number;
      esperasBloqueantes: number;
    };
  }
}

test("GPU ocupada não acumula quadros e o HUD continua respondendo", async ({ page }) => {
  // WebGL e desenho reais. A fronteira da GPU retém somente a confirmação;
  // a aplicação não recebe flags ou métodos adicionais para este ensaio.
  await page.addInitScript(() => {
    const medida = { reter: true, pendentes: 0, maximo: 0, consultas: 0, esperasBloqueantes: 0 };
    window.gpuDoEnsaio = medida;
    const pendentes = new Set<WebGLSync>();
    const prototipo = WebGL2RenderingContext.prototype;
    const inserir = prototipo.fenceSync;
    const consultar = prototipo.clientWaitSync;
    const remover = prototipo.deleteSync;
    prototipo.fenceSync = function (this: WebGL2RenderingContext, condicao, flags) {
      const sinal = inserir.call(this, condicao, flags);
      if (sinal) pendentes.add(sinal);
      medida.pendentes = pendentes.size;
      medida.maximo = Math.max(medida.maximo, pendentes.size);
      return sinal;
    };
    prototipo.clientWaitSync = function (this: WebGL2RenderingContext, sinal, flags, prazo) {
      medida.consultas++;
      if (prazo !== 0) medida.esperasBloqueantes++;
      return medida.reter ? this.TIMEOUT_EXPIRED : consultar.call(this, sinal, flags, prazo);
    };
    prototipo.deleteSync = function (this: WebGL2RenderingContext, sinal) {
      if (sinal) pendentes.delete(sinal);
      medida.pendentes = pendentes.size;
      remover.call(this, sinal);
    };
  });
  await entrar(page, "Prova da fila da GPU");
  await expect
    .poll(() => page.evaluate(() => window.gpuDoEnsaio?.consultas ?? 0))
    .toBeGreaterThan(2);
  const quadros = await page.evaluate(() => window.__morada?.medidas().quadros);
  await retrato(page, "Lia").click();
  await expect(retrato(page, "Lia")).toHaveAttribute("data-estado", "voce");
  const parada = await page.evaluate(() => ({
    quadros: window.__morada?.medidas().quadros,
    pendentes: window.gpuDoEnsaio?.pendentes,
    maximo: window.gpuDoEnsaio?.maximo,
    esperasBloqueantes: window.gpuDoEnsaio?.esperasBloqueantes,
  }));
  expect(parada).toEqual({ quadros, pendentes: 1, maximo: 1, esperasBloqueantes: 0 });
  await page.evaluate(() => {
    if (window.gpuDoEnsaio) window.gpuDoEnsaio.reter = false;
  });
  await expect
    .poll(() => page.evaluate(() => window.__morada?.medidas().quadros ?? 0))
    .toBeGreaterThan(quadros ?? 0);
  expect(await page.evaluate(() => window.__morada?.conexao())).toBe("pronto");
});

test("quadros visíveis acima de 250 ms reduzem a qualidade até o degrau baixo", async ({
  page,
}) => {
  // A placa/CPU informadas escolhem o ponto de partida alto; o renderer
  // continua sendo o SwiftShader real. Isto verifica adaptação, não FPS.
  // Só o agendador externo é desacelerado, sem API de teste no cliente.
  await page.addInitScript(() => {
    const getParameter = WebGL2RenderingContext.prototype.getParameter;
    WebGL2RenderingContext.prototype.getParameter = function (
      this: WebGL2RenderingContext,
      parameter: number,
    ) {
      return parameter === 37446 ? "GPU dedicada de ensaio" : getParameter.call(this, parameter);
    };
    Object.defineProperty(navigator, "hardwareConcurrency", { get: () => 8 });
    window.requestAnimationFrame = (callback) =>
      window.setTimeout(() => callback(performance.now()), 500);
    window.cancelAnimationFrame = (id) => window.clearTimeout(id);
  });
  await entrar(page, "Prova de qualidade");
  expect(await page.evaluate(() => document.visibilityState)).toBe("visible");
  expect(await page.evaluate(() => window.__morada?.medidas().qualidade)).toBe("alta");
  await expect
    .poll(() => page.evaluate(() => window.__morada?.medidas().qualidade), {
      timeout: 13_000,
      intervals: [250],
    })
    .toBe("baixa");
  expect(await page.evaluate(() => window.__morada?.medidas().p95Ms ?? 0)).toBeGreaterThan(400);
  expect(await page.evaluate(() => window.__morada?.conexao())).toBe("pronto");
});
