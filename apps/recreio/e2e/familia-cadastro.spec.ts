import { expect, test } from "@playwright/test";
import { comecarVigia, fecharAparelhos, hidratado, novaPessoa, tela, vigia } from "./apoio";

test.beforeEach(comecarVigia);
test.afterEach(async () => {
  await fecharAparelhos();
  expect(vigia().violacoes).toEqual([]);
  expect(vigia().errosDePagina).toEqual([]);
});

test("responsável sem jogador cadastra, reabre a lista e cancela outro formulário", async ({
  browser,
}) => {
  const { page } = await novaPessoa(browser, "Responsável", { semPerfil: true });
  await page.goto("/conta");
  await page.getByRole("link", { name: "Gerenciar perfis", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Perfis sob sua responsabilidade", exact: true }),
  ).toBeVisible();
  const adicionar = page.getByRole("button", { name: "Adicionar perfil", exact: true });
  await hidratado(adicionar);
  await adicionar.click();
  const apelido = page.getByLabel("Apelido", { exact: true });
  await hidratado(apelido);
  await apelido.fill("Lua da casa");
  await page.getByLabel("Mês de nascimento", { exact: true }).selectOption("1");
  await page
    .getByLabel("Ano de nascimento", { exact: true })
    .fill(String(new Date().getUTCFullYear() - 8));
  const declaracao = page.getByRole("checkbox", { name: /Declaro que tenho 18/ });
  await expect(declaracao).not.toBeChecked();
  await declaracao.check();
  await page.getByRole("button", { name: "Confirmar cadastro", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Lua da casa", exact: true })).toBeVisible();
  await expect(page.getByText("Ativo · Conteúdo até 6 anos", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Lua da casa", exact: true })).toBeVisible();
  await hidratado(adicionar);
  await adicionar.click();
  await hidratado(apelido);
  await apelido.fill("Sem confirmar");
  await page.getByRole("button", { name: "Cancelar cadastro", exact: true }).click();
  await expect(apelido).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Lua da casa", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sem confirmar", exact: true })).toHaveCount(0);
  await tela(page, "familia-cadastro-sem-jogador");
  await page.getByRole("link", { name: "Voltar à conta", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Quem está jogando", exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("link", { name: "Criar meu perfil para jogar", exact: true }),
  ).toBeVisible();
});
