import { expect, test } from "@playwright/test";
import { hidratado, novaPessoa, tela } from "./apoio";
import { familiaComAparelho } from "./familia-apoio";

test("conta sem jogador prepara e cancela uma prévia sem encerrar login ou criar perfil", async ({
  browser,
}) => {
  const pessoa = await novaPessoa(browser, "Dados pessoais", { semPerfil: true });
  const { page } = pessoa;
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/conta/dados");
    await expect(page.getByRole("heading", { name: "Meus dados", exact: true })).toBeVisible();
    const escolha = page.getByRole("radio", {
      name: "Encerrar minha participação no Recreio",
      exact: true,
    });
    await hidratado(escolha);
    await escolha.check();
    await expect(
      page.getByText("Sua conta não tem perfil de jogador ou responsabilidade por perfil."),
    ).toBeVisible();
    await page.getByRole("checkbox", { name: /Conferi a seleção e quero preparar/ }).check();
    await page.getByRole("button", { name: "Preparar prévia", exact: true }).click();
    const resultado = page.getByRole("region", { name: "Sua prévia", exact: true });
    await expect(resultado).toBeVisible();
    await expect(resultado.getByText("Preparada", { exact: true })).toBeVisible();
    await expect(resultado.getByText(/Nenhum dado foi excluído/)).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await tela(page, "direitos-previa-conta-sem-jogador", { paginaInteira: true });
    await resultado.getByRole("button", { name: "Cancelar esta prévia", exact: true }).click();
    await expect(resultado.getByText("Cancelada", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Voltar à conta", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Conta", exact: true })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Criar meu perfil para jogar", exact: true }),
    ).toBeVisible();
  } finally {
    await pessoa.contexto.close();
  }
});

test("o responsável vê o menor e um aparelho pareado não abre a gestão de dados", async ({
  browser,
}) => {
  const familia = await familiaComAparelho(browser, "Perfil protegido");
  try {
    await familia.adulto.page.goto("/conta/dados");
    const campo = familia.adulto.page.getByLabel("Perfil", { exact: true });
    await hidratado(campo);
    await campo.selectOption(familia.perfilId);
    await familia.adulto.page
      .getByRole("checkbox", { name: /Conferi a seleção e quero preparar/ })
      .check();
    await familia.adulto.page.getByRole("button", { name: "Preparar prévia", exact: true }).click();
    await expect(
      familia.adulto.page.getByRole("region", { name: "Sua prévia", exact: true }),
    ).toBeVisible();
    await familia.infantil.goto("/conta/dados");
    await expect(familia.infantil).toHaveURL(/\/(entrar|aparelho|perfis)(?:\?|$)/);
    await expect(
      familia.infantil.getByRole("heading", { name: "Meus dados", exact: true }),
    ).toHaveCount(0);
  } finally {
    await familia.infantil.context().close();
    await familia.adulto.contexto.close();
  }
});
