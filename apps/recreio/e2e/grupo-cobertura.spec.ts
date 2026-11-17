import { expect, test } from "@playwright/test";
import {
  comecarVigia,
  conceder,
  fecharAparelhos,
  hidratado,
  novaPessoa,
  tela,
  vigia,
} from "./apoio";

test.beforeEach(comecarVigia);
test.afterEach(async () => {
  await fecharAparelhos();
  expect(vigia().violacoes).toEqual([]);
  expect(vigia().errosDePagina).toEqual([]);
});

test("titular sem jogador escolhe e troca a vaga Individual sem recriar os menores", async ({
  browser,
}) => {
  const pessoa = await novaPessoa(browser, "Responsável", { semPerfil: true, comAcesso: false });
  const { page } = pessoa;
  await page.goto("/conta/perfis");
  for (const nome of ["Luar", "Maré"]) {
    const adicionar = page.getByRole("button", { name: "Adicionar perfil", exact: true });
    await hidratado(adicionar);
    await adicionar.click();
    await hidratado(page.getByLabel("Apelido", { exact: true }));
    await page.getByLabel("Apelido", { exact: true }).fill(nome);
    await page.getByLabel("Mês de nascimento", { exact: true }).selectOption("1");
    await page
      .getByLabel("Ano de nascimento", { exact: true })
      .fill(String(new Date().getUTCFullYear() - 8));
    await page.getByRole("checkbox", { name: /Declaro que tenho 18/ }).check();
    await page.getByRole("button", { name: "Confirmar cadastro", exact: true }).click();
    await expect(page.getByRole("heading", { name: nome, exact: true })).toBeVisible();
  }
  const referencias = await page
    .getByRole("link", { name: /^Supervisionar / })
    .evaluateAll((links) => links.map((link) => link.getAttribute("href")));
  conceder(pessoa.email, "individual");
  await page.goto("/conta");
  await page.getByRole("link", { name: "Gerenciar cobertura", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Cobertura do grupo", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("A cobertura atual permite 1 jogador.", { exact: true }),
  ).toBeVisible();
  const luar = page.getByRole("checkbox", { name: /^Luar / });
  const mare = page.getByRole("checkbox", { name: /^Maré / });
  const reconhecer = page.getByRole("checkbox", { name: /^Conferi a seleção/ });
  const salvar = page.getByRole("button", { name: "Salvar cobertura", exact: true });
  await hidratado(luar);
  await expect(luar).toBeChecked();
  await expect(mare).toBeChecked();
  await expect(salvar).toBeDisabled();
  await luar.uncheck();
  await reconhecer.check();
  await Promise.all([page.waitForEvent("domcontentloaded"), salvar.click()]);
  await expect(page.getByRole("status")).toHaveText(
    "Cobertura confirmada. Confira abaixo a seleção atual.",
  );
  await page.reload();
  await hidratado(luar);
  await expect(luar).not.toBeChecked();
  await expect(mare).toBeChecked();
  await expect(page.getByText("Na cobertura atual", { exact: true })).toHaveCount(1);
  await luar.check();
  await expect(
    page.getByRole("alert").filter({ hasText: "Selecione até 1 perfil para confirmar." }),
  ).toHaveText("Selecione até 1 perfil para confirmar.");
  await expect(salvar).toBeDisabled();
  await mare.uncheck();
  await reconhecer.check();
  await Promise.all([page.waitForEvent("domcontentloaded"), salvar.click()]);
  await expect(page.getByRole("status")).toHaveText(
    "Cobertura confirmada. Confira abaixo a seleção atual.",
  );
  await expect(luar).toBeChecked();
  await expect(mare).not.toBeChecked();
  await page.reload();
  await expect(luar).toBeChecked();
  await expect(mare).not.toBeChecked();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await tela(page, "grupo-cobertura-celular");
  await page.getByRole("link", { name: "Perfis sob sua responsabilidade", exact: true }).click();
  expect(
    await page
      .getByRole("link", { name: /^Supervisionar / })
      .evaluateAll((links) => links.map((link) => link.getAttribute("href"))),
  ).toEqual(referencias);
  await page.goto("/conta");
  await expect(page.getByRole("heading", { name: "Quem está jogando", exact: true })).toHaveCount(
    0,
  );
});
