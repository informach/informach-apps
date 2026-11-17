import { expect, test } from "@playwright/test";
import { novaPessoa } from "./apoio";

test("conta confirmada administra aparelhos e sai sem criar um jogador", async ({ browser }) => {
  const pessoa = await novaPessoa(browser, "Responsável", { semPerfil: true });
  const { page } = pessoa;
  try {
    await page.goto("/conta");
    await expect(page).toHaveURL(/\/conta$/);
    await expect(page.getByRole("heading", { name: "Conta", exact: true })).toBeVisible();
    await expect(
      page.getByText("Você pode administrar sua conta sem usar um perfil de jogador."),
    ).toBeVisible();
    await page.getByRole("link", { name: "Gerenciar aparelhos" }).click();
    await expect(page).toHaveURL(/\/conta\/aparelhos$/);
    await expect(page.getByRole("heading", { name: "Este aparelho" })).toBeVisible();
    await page.goto("/conta");
    await expect(page.getByRole("link", { name: "Criar meu perfil para jogar" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Quem está jogando" })).toHaveCount(0);
    await page.getByRole("button", { name: "Sair da conta" }).click();
    await expect(page).toHaveURL(/\/$/);
  } finally {
    await pessoa.contexto.close();
  }
});
