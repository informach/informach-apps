import { expect, test } from "@playwright/test";
import { entrar } from "./apoio";

test("quadros visíveis acima de 250 ms reduzem a qualidade até o degrau baixo", async ({
  page,
}) => {
  // Só o agendador externo é desacelerado. Cena, WebGL, medidas e política
  // são reais; nenhuma API de teste é acrescentada ao cliente.
  await page.addInitScript(() => {
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
