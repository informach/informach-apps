import { expect, test } from "@playwright/test";
import {
  comecarVigia,
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

test("desconecta outro aparelho, preserva o atual e permite uma nova autenticação", async ({
  browser,
}) => {
  const primeiro = await novaPessoa(browser, "Lia", { comAcesso: false });
  const segundo = await entrarDeNovo(browser, primeiro);
  await primeiro.page.goto("/conta");
  await primeiro.page.getByRole("link", { name: "Gerenciar aparelhos" }).click();
  await expect(primeiro.page.getByRole("region", { name: "Este aparelho" })).toBeVisible();
  const outros = primeiro.page.getByRole("region", { name: "Outros aparelhos" });
  const desconectar = outros.getByRole("button", { name: /Desconectar aparelho iniciado em/ });
  await expect(desconectar).toHaveCount(1);
  await hidratado(desconectar);
  await desconectar.click();
  await expect(
    outros.getByText("Nenhum outro aparelho nesta página.", { exact: true }),
  ).toBeVisible();
  await tela(primeiro.page, "aparelhos-proprios");
  await segundo.page.goto("/conta");
  await expect(segundo.page).toHaveURL(/\/entrar\?encerrada=1$/);
  await expect(
    segundo.page.getByText("A sessão neste aparelho foi encerrada. Entre de novo para continuar.", {
      exact: true,
    }),
  ).toBeVisible();
  const email = segundo.page.getByLabel("E-mail", { exact: true });
  await hidratado(email);
  await email.fill(primeiro.email);
  await segundo.page.getByLabel("Senha", { exact: true }).fill(SENHA);
  await segundo.page.getByRole("button", { name: "Entrar no Recreio", exact: true }).click();
  await expect(segundo.page).toHaveURL(/\/perfis$/);
  const perfil = segundo.page.getByRole("button", { name: /Lia/ });
  await hidratado(perfil);
  await perfil.click();
  await expect(segundo.page).toHaveURL(/\/estante$/);
  await primeiro.page.reload();
  await expect(primeiro.page.getByRole("region", { name: "Este aparelho" })).toBeVisible();
  await expect(desconectar).toHaveCount(1);
});
