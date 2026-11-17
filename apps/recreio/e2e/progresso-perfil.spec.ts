import { expect, test } from "@playwright/test";
import { novaPessoa } from "./apoio";

test("jogo 2D sem mundos salva, sai e recupera progresso pelo SDK", async ({ browser }) => {
  const pessoa = await novaPessoa(browser, "Progresso");
  const { page } = pessoa;
  const pedidos: string[] = [];
  page.on("request", (request) => pedidos.push(new URL(request.url()).pathname));
  try {
    await page.goto("/jogar/perfil-teste");
    await expect(page.getByRole("button", { name: "Ganhar ponto" })).toBeEnabled();
    await page.getByRole("button", { name: "Ganhar ponto" }).click();
    await expect(page.getByLabel("Pontos salvos")).toHaveText("1");
    await expect(page.getByRole("status", { name: "Estado do progresso" })).toContainText(
      "Progresso salvo",
    );
    await expect(page.getByRole("button", { name: "Salvar e sair" })).toBeEnabled();
    await page.getByRole("button", { name: "Salvar e sair" }).click();
    await expect(page).toHaveURL(/\/estante$/);
    await page.goto("/jogar/perfil-teste");
    await expect(page.getByRole("button", { name: "Ganhar ponto" })).toBeEnabled();
    await expect(page.getByLabel("Pontos salvos")).toHaveText("1");
    expect(pedidos.some((caminho) => caminho === "/api/sdk/v1/dados")).toBe(true);
    expect(pedidos.some((caminho) => caminho.startsWith("/api/sdk/v1/mundos"))).toBe(false);
    expect(pedidos.some((caminho) => /morada|three/i.test(caminho))).toBe(false);
    await page.getByRole("button", { name: "Salvar e sair" }).click();
    await expect(page).toHaveURL(/\/estante$/);
  } finally {
    await pessoa.contexto.close();
  }
});
