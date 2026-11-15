import { expect, test } from "@playwright/test";
import { browserFamily, enterCozya } from "./fixtures/compasso";

test("recipe validation works with the production CSP and without unsafe eval", async ({
  page,
}) => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("unsafe-eval")) violations.push(message.text());
  });
  const family = await browserFamily();
  await enterCozya(page, family, "/receitas");
  const response = await page.reload();
  const csp = response?.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("script-src");
  expect(csp).not.toContain("'unsafe-eval'");
  await page.getByRole("button", { name: "Trazer uma receita", exact: true }).click();
  await page.getByRole("button", { name: /^Escrever do meu jeito/ }).click();
  const dialog = page.locator('[role="dialog"][data-state="open"]');
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(dialog.getByText("Informe um nome", { exact: true })).toBeVisible();
  expect(violations).toEqual([]);
});
