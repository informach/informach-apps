import { INFORMACH_CONTACT } from "@informach/config/contact";
import { expect, test } from "@playwright/test";
import { comecarVigia, fecharAparelhos, novoAparelho, tela, vigia } from "./apoio";

test.beforeEach(comecarVigia);
test.afterEach(async () => {
  await fecharAparelhos();
  expect(vigia().violacoes).toEqual([]);
  expect(vigia().errosDePagina).toEqual([]);
});

test("ficha pública informa o alfa sem abrir o jogo, funciona em 390 px e mantém títulos internos fora do catálogo", async ({
  browser,
  request,
}) => {
  const contexto = await novoAparelho(browser),
    page = await contexto.newPage();
  await page.goto("/");
  await page.getByRole("link", { name: "Conhecer o Morada", exact: true }).click();
  await expect(page).toHaveURL(/\/jogos\/morada$/);
  await expect(page.getByRole("heading", { level: 1, name: "Morada", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Antes de jogar", exact: true })).toBeVisible();
  await expect(
    page.getByText("O alfa fechado está disponível para adultos convidados pela equipe.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "A classificação indicativa está em análise. O Morada ainda não está liberado para perfis de menores.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Controles", exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "O que você precisa", exact: true }),
  ).toBeVisible();
  await expect(page.locator("canvas,.morada-hud")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Fale com a gente no Instagram", exact: true }),
  ).toHaveAttribute("href", INFORMACH_CONTACT.directMessageUrl);
  await tela(page, "ficha-morada-desktop", { paginaInteira: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await tela(page, "ficha-morada-390", { paginaInteira: true });
  // Catalogue visibility never grants a game session; the destination still
  // requires the native login and the server's own admission checks.
  await page.getByRole("link", { name: "Ir para a estante", exact: true }).click();
  await expect(page).toHaveURL(/\/entrar(?:\?|$)/);
  for (const id of ["nao-existe", "teste", "perfil-teste", "carga-teste"]) {
    const resposta = await request.get(`/jogos/${id}`);
    expect(resposta.status()).toBe(404);
    expect(await resposta.text()).not.toContain("Prova de progresso por perfil");
  }
});
