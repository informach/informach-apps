import { expect, test } from "@playwright/test";
import {
  comecarVigia,
  convidar,
  criarMundo,
  entrarDeNovo,
  fecharAparelhos,
  novaPessoa,
  novoAparelho,
  tela,
  vigia,
} from "./apoio";
import { conferirCarregamento } from "./hidratacao-apoio";

test.beforeEach(comecarVigia);
test.afterEach(async () => {
  await fecharAparelhos();
  expect(vigia().violacoes).toEqual([]);
  expect(vigia().errosDePagina).toEqual([]);
});

test("entrada aguarda os scripts antes de aceitar dados ou mudar o modo", async ({ browser }) => {
  const contexto = await novoAparelho(browser);
  const page = await contexto.newPage();
  await page.goto("/entrar");
  await conferirCarregamento(page, [
    page.getByLabel("E-mail", { exact: true }),
    page.getByLabel("Senha", { exact: true }),
    page.getByRole("button", { name: "Entrar", exact: true }),
    page.getByRole("button", { name: "Criar conta", exact: true }),
    page.getByRole("button", { name: "Entrar no Recreio", exact: true }),
    page.getByRole("button", { name: "Esqueci minha senha", exact: true }),
  ]);
  await page.getByRole("button", { name: "Criar conta", exact: true }).click();
  await expect(page.getByLabel("Como podemos chamar você?", { exact: true })).toBeEnabled();
  await tela(page, "entrada-pronta");
});

test("perfil, mundos, convites, aparelhos e encerramentos aguardam os scripts", async ({
  browser,
}) => {
  const lia = await novaPessoa(browser, "Lia carregamento");
  const bruno = await novaPessoa(browser, "Bruno carregamento");
  const id = await criarMundo(lia.page, "Morada", "Mundo do carregamento");
  await convidar(lia.page, bruno.page, id);
  await entrarDeNovo(browser, lia);
  const page = lia.page;

  await page.goto("/estante");
  const morada = page.getByRole("region", { name: "Seus mundos no Morada", exact: true });
  await conferirCarregamento(page, [
    morada.getByLabel("Nome do mundo", { exact: true }),
    morada.getByRole("button", { name: "Criar mundo", exact: true }),
    page.getByLabel("Código do convite", { exact: true }),
    page.getByRole("button", { name: "Entrar no mundo", exact: true }),
  ]);
  await morada.getByLabel("Nome do mundo", { exact: true }).fill("Escolha preservada");
  await expect(morada.getByLabel("Nome do mundo", { exact: true })).toHaveValue(
    "Escolha preservada",
  );

  await page.goto(`/mundos/${id}`);
  await conferirCarregamento(page, [
    page.getByRole("button", { name: "Gerar código de convite", exact: true }),
  ]);
  await page.goto("/perfis");
  await conferirCarregamento(page, [page.getByRole("button", { name: /Lia carregamento/ })]);
  await page.goto("/conta/perfil");
  await conferirCarregamento(page, [
    page.getByLabel("Apelido", { exact: true }),
    page.getByRole("radio", { name: "Sol", exact: true }),
    page.getByRole("button", { name: "Salvar perfil", exact: true }),
  ]);
  await page.goto("/conta/aparelhos");
  await conferirCarregamento(page, [
    page.getByRole("button", { name: /Desconectar aparelho iniciado em/ }),
  ]);
  await page.goto(`/conta/mundos/${id}/membros`);
  await conferirCarregamento(page, [
    page.getByRole("button", { name: "Cancelar", exact: true, includeHidden: true }),
    page.getByRole("button", { name: "Confirmar remoção", exact: true, includeHidden: true }),
  ]);
  await page.goto("/conta");
  await conferirCarregamento(page, [
    page.getByRole("button", { name: "Sair da conta", exact: true }),
  ]);
  await bruno.page.goto("/conta/mundos");
  await conferirCarregamento(bruno.page, [
    bruno.page.getByRole("button", { name: "Cancelar", exact: true, includeHidden: true }),
    bruno.page.getByRole("button", { name: "Confirmar saída", exact: true, includeHidden: true }),
  ]);
});
