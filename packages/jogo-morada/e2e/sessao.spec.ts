import { expect, type Page, test } from "@playwright/test";
import { entrar } from "./apoio";

/**
 * A sessão de jogo na bancada: o servidor de desenvolvimento a emite com
 * validade curta, a fonte da bancada a renova e o jogo passa do prazo. É o
 * mesmo caminho que deixa um jogo de desenvolvimento rodar além dos 15 minutos.
 */

const VALIDADE_S = 9;

const renovacoes = (pagina: Page) =>
  pagina.evaluate(() => Number(document.documentElement.dataset.moradaRenovacoes ?? 0));

test("a sessão é renovada sozinha e o jogo passa da validade dela", async ({ page }) => {
  const erros: string[] = [];
  page.on("pageerror", (erro) => erros.push(erro.message));
  await entrar(page, "Rita", VALIDADE_S);
  const jogadorId = await page.evaluate(() => window.__morada?.jogadorId());
  const tickDaEntrada = await page.evaluate(() => window.__morada?.tick() ?? 0);

  // A bancada renova a um terço da validade. Cinco renovações são mais de uma validade e meia.
  await expect.poll(() => renovacoes(page), { timeout: 60_000 }).toBeGreaterThanOrEqual(5);
  const passou = (await page.evaluate(() => window.__morada?.tick() ?? 0)) - tickDaEntrada;
  expect(passou).toBeGreaterThan(VALIDADE_S * 10);

  // Na mesma conexão, como a mesma pessoa: o servidor não fechou nem o jogo reabriu o mundo.
  expect(await page.evaluate(() => window.__morada?.conexao())).toBe("pronto");
  expect(await page.evaluate(() => window.__morada?.jogadorId())).toBe(jogadorId);
  await expect(page.locator(".morada-faixa")).toHaveCount(0);
  await expect(page.locator("html")).not.toHaveAttribute("data-morada-fim", /./);
  expect(erros).toEqual([]);
});

test("sem conseguir renovar, a sessão vence e o jogo diz por quê", async ({ page }) => {
  // O servidor de desenvolvimento deixa de responder à renovação.
  await page.route("**/dev/renovar", (rota) => rota.abort());
  await entrar(page, "Rita", VALIDADE_S);

  await expect(page.getByRole("alertdialog")).toContainText("Sua sessão de jogo terminou", {
    timeout: 60_000,
  });
  await expect(page.locator("html")).toHaveAttribute("data-morada-fim", "sessao");
  expect(await renovacoes(page)).toBe(0);
});
