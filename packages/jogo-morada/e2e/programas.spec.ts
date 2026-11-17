import { expect, test } from "@playwright/test";

test("ligação WebGL válida e recusa de shader inválido real", async ({ page }) => {
  const erros: string[] = [];
  page.on("pageerror", (erro) => erros.push(erro.message));
  await page.goto("/programas.html");
  await page.getByRole("button", { name: "Conferir programa válido", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Programa válido aceito");
  await page.getByRole("button", { name: "Conferir shader inválido", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Programa inválido recusado");
  await page.getByRole("button", { name: "Conferir programa válido", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Programa válido aceito");
  expect(erros).toEqual([]);
});
