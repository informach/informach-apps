import { expect, test } from "@playwright/test";
import {
  comecarVigia,
  conceder,
  entrarDeNovo,
  fecharAparelhos,
  hidratado,
  novaPessoa,
  SENHA,
  tela,
  vigia,
} from "./apoio";

test.beforeEach(comecarVigia);
test.afterEach(async () => {
  await fecharAparelhos();
  expect(vigia().violacoes).toEqual([]);
  expect(vigia().errosDePagina).toEqual([]);
});

test("dois aparelhos pareiam um menor, não herdam gestão e respeitam revogação", async ({
  browser,
}) => {
  const responsavel = await novaPessoa(browser, "Responsável", { comAcesso: false });
  const { page } = responsavel;
  await page.goto("/conta/perfis");
  const adicionar = page.getByRole("button", { name: "Adicionar perfil", exact: true });
  await hidratado(adicionar);
  await adicionar.click();
  await hidratado(page.getByLabel("Apelido", { exact: true }));
  await page.getByLabel("Apelido", { exact: true }).fill("Lua protegida");
  await page.getByLabel("Mês de nascimento", { exact: true }).selectOption("1");
  await page
    .getByLabel("Ano de nascimento", { exact: true })
    .fill(String(new Date().getUTCFullYear() - 8));
  await page.getByRole("checkbox", { name: /Declaro que tenho 18/ }).check();
  await page.getByRole("button", { name: "Confirmar cadastro", exact: true }).click();
  conceder(responsavel.email, "family");
  await page.getByRole("link", { name: "Supervisionar Lua protegida", exact: true }).click();
  const confirmarRegras = page.getByLabel("Revisei e confirmo estas regras para o perfil.", {
    exact: true,
  });
  await hidratado(confirmarRegras);
  await confirmarRegras.check();
  await page.getByRole("button", { name: "Salvar supervisão", exact: true }).click();
  await expect(
    page.getByText("Supervisão confirmada. Confira abaixo as regras atuais.", { exact: true }),
  ).toBeVisible();
  await page.goto("/conta/perfis");
  await page
    .getByRole("link", { name: "Gerenciar aparelhos de Lua protegida", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Aparelhos de Lua protegida", exact: true }),
  ).toBeVisible();

  // Este tablet tinha a mesma conta adulta. O pareamento precisa retirar sua autoridade anterior.
  const tablet = await entrarDeNovo(browser, responsavel);
  await tablet.page.goto("/parear");
  const mostrar = tablet.page.getByRole("button", {
    name: "Mostrar código deste aparelho",
    exact: true,
  });
  await hidratado(mostrar);
  await mostrar.click();
  const codigoNaTela = tablet.page.getByLabel("Código de pareamento", { exact: true });
  await expect(codigoNaTela).toBeVisible();
  const codigo = (await codigoNaTela.innerText()).replace(/\s/g, "");
  await hidratado(page.getByLabel("Código mostrado no outro aparelho", { exact: true }));
  await page.getByLabel("Código mostrado no outro aparelho", { exact: true }).fill(codigo);
  await page
    .getByRole("button", { name: "Confirmar aparelho de Lua protegida", exact: true })
    .click();
  await expect(
    page.getByText("Aprovado. O outro aparelho vai confirmar a entrada.", { exact: true }),
  ).toBeVisible();
  await expect(tablet.page).toHaveURL(/\/aparelho$/);
  await expect(
    tablet.page.getByRole("heading", { name: "Olá, Lua protegida!", exact: true }),
  ).toBeVisible();
  await tablet.page
    .getByRole("link", { name: "Jogar Prova de progresso por perfil", exact: true })
    .click();
  await expect(tablet.page.getByLabel("Pontos salvos", { exact: true })).toHaveText("0");
  await tablet.page.getByRole("button", { name: "Ganhar ponto", exact: true }).click();
  await expect(
    tablet.page.getByRole("status", { name: "Estado do progresso", exact: true }),
  ).toHaveText("Progresso salvo.");
  await tablet.page.getByRole("button", { name: "Salvar e sair", exact: true }).click();
  await expect(tablet.page).toHaveURL(/\/aparelho$/);
  const cookie = (await tablet.contexto.cookies()).find((item) => item.name === "recreio-pareado");
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Strict", path: "/" });
  expect(await tablet.page.evaluate(() => document.cookie.includes("recreio-pareado"))).toBe(false);
  await tela(tablet.page, "aparelho-pareado-protegido");
  await tablet.page.setViewportSize({ width: 390, height: 844 });
  expect(
    await tablet.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  await tela(tablet.page, "aparelho-pareado-mobile");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await tela(page, "aparelhos-menor-mobile");
  await tablet.page.goto("/conta");
  await expect(tablet.page).toHaveURL(/\/entrar\?encerrada=1$/);
  await expect(tablet.page.getByRole("heading", { name: "Conta", exact: true })).toHaveCount(0);
  await tablet.page.goto("/aparelho");
  await expect(
    tablet.page.getByRole("heading", { name: "Olá, Lua protegida!", exact: true }),
  ).toBeVisible();
  await tablet.page
    .getByRole("link", { name: "Jogar Prova de progresso por perfil", exact: true })
    .click();
  await expect(tablet.page.getByLabel("Pontos salvos", { exact: true })).toHaveText("1");
  await page.reload();
  const desconectar = page.getByRole("button", { name: "Desconectar aparelho", exact: true });
  await hidratado(desconectar);
  await desconectar.click();
  await expect(
    page.getByText("Nenhum aparelho pareado neste perfil.", { exact: true }),
  ).toBeVisible();
  const recusado = tablet.page.waitForResponse(
    (resposta) =>
      new URL(resposta.url()).pathname === "/api/sdk/v1/dados" &&
      resposta.request().method() === "POST",
  );
  await tablet.page.getByRole("button", { name: "Ganhar ponto", exact: true }).click();
  expect((await recusado).status()).toBe(401);
  await expect(
    tablet.page.getByRole("status", { name: "Estado do progresso", exact: true }),
  ).toHaveText(
    "Não foi possível salvar. Seus pontos continuam nesta tela; tente novamente antes de sair.",
  );
  await tablet.page.reload();
  await expect(tablet.page).toHaveURL(/\/parear$/);
  await tablet.page.goto("/conta");
  await expect(tablet.page).toHaveURL(/\/entrar\?encerrada=1$/);

  // Só uma autenticação nova permite retomar a administração neste navegador.
  await tablet.page.goto("/entrar?recente=1&next=%2Fconta");
  const email = tablet.page.getByLabel("E-mail", { exact: true });
  await hidratado(email);
  await email.fill(responsavel.email);
  await tablet.page.getByLabel("Senha", { exact: true }).fill(SENHA);
  await tablet.page.getByRole("button", { name: "Entrar no Recreio", exact: true }).click();
  await expect(tablet.page).toHaveURL(/\/conta$/);
  await expect(tablet.page.getByRole("heading", { name: "Conta", exact: true })).toBeVisible();
  expect((await tablet.contexto.cookies()).some((item) => item.name === "recreio-pareado")).toBe(
    false,
  );
});
