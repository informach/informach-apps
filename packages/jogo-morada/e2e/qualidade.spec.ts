import { expect, test } from "@playwright/test";
import { entrar } from "./apoio";

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
