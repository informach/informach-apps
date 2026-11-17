import { expect, type Page, test } from "@playwright/test";
import {
  comecarVigia,
  fecharAparelhos,
  hidratado,
  novaPessoa,
  novoAparelho,
  tela,
  vigia,
} from "./apoio";

test.beforeEach(comecarVigia);
test.afterEach(async () => {
  await fecharAparelhos();
  expect(vigia().violacoes).toEqual([]);
  expect(vigia().errosDePagina).toEqual([]);
  expect(vigia().errosDeConsole).toEqual([]);
});

async function codigo(page: Page) {
  await page.goto("/amigos");
  const gerar = page.getByRole("button", { name: "Gerar código", exact: true });
  await hidratado(gerar);
  await gerar.click();
  const exibido = page.getByLabel("Código de amizade", { exact: true });
  await expect(exibido).toBeVisible();
  return exibido.innerText();
}
async function pedir(page: Page, recebido: string) {
  await page.goto("/amigos");
  const campo = page.getByLabel("Código que você recebeu", { exact: true });
  await hidratado(campo);
  await campo.fill(recebido);
  await page.getByRole("button", { name: "Enviar pedido", exact: true }).click();
  await expect(campo).toHaveValue("");
  await expect(page.getByRole("article")).toHaveCount(1);
}
async function clicar(page: Page, nome: string) {
  const botao = page.getByRole("button", { name: nome, exact: true });
  await hidratado(botao);
  // Cada confirmação volta à projeção atual do servidor, sem atualizar autoridade no cliente.
  await Promise.all([page.waitForEvent("load"), botao.click()]);
}

test("duas contas fazem amizade; silêncio persiste e desbloquear não restaura a relação", async ({
  browser,
}) => {
  const a = await novaPessoa(browser, "Sol social", { comAcesso: false });
  const b = await novaPessoa(browser, "Mar social", { comAcesso: false });
  await pedir(a.page, await codigo(b.page));
  await expect(a.page.getByRole("button", { name: "Cancelar pedido", exact: true })).toBeVisible();
  await b.page.reload();
  await clicar(b.page, "Aceitar pedido");
  await expect(b.page.getByText("Amizade confirmada", { exact: true })).toBeVisible();
  await expect(b.page.getByRole("heading", { name: "Sol social", exact: true })).toBeVisible();
  await a.page.reload();
  await expect(a.page.getByRole("heading", { name: "Mar social", exact: true })).toBeVisible();
  await clicar(a.page, "Silenciar");
  await expect(a.page.getByText("Silenciado", { exact: true })).toBeVisible();
  await a.page.reload();
  await expect(a.page.getByRole("button", { name: "Retirar silêncio", exact: true })).toBeVisible();
  await clicar(a.page, "Bloquear");
  await expect(a.page.getByText("Bloqueado por você", { exact: true })).toBeVisible();
  await b.page.reload();
  await expect(b.page.getByText("Amizade confirmada", { exact: true })).toHaveCount(0);
  await clicar(a.page, "Desbloquear");
  await expect(a.page.getByText("Amizade confirmada", { exact: true })).toHaveCount(0);
  await expect(a.page.getByText("Silenciado", { exact: true })).toBeVisible();
  await clicar(a.page, "Retirar silêncio");
  await expect(a.page.getByRole("article")).toHaveCount(0);
  const invisivel = a.page.getByRole("radio", { name: "Invisível", exact: true });
  await hidratado(invisivel);
  await invisivel.check();
  await clicar(a.page, "Salvar presença");
  await expect(a.page.getByRole("radio", { name: "Invisível", exact: true })).toBeChecked();
  await a.page.setViewportSize({ width: 390, height: 844 });
  expect(await a.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await tela(a.page, "social-adulto-mobile");
});

test("responsável sem jogador aprova o contato do aparelho infantil e pode bloqueá-lo", async ({
  browser,
}) => {
  const responsavel = await novaPessoa(browser, "Responsável social", { semPerfil: true });
  const adulto = await novaPessoa(browser, "Contato conhecido", { comAcesso: false });
  const { page } = responsavel;
  await page.goto("/conta/perfis");
  const adicionar = page.getByRole("button", { name: "Adicionar perfil", exact: true });
  await hidratado(adicionar);
  await adicionar.click();
  await hidratado(page.getByLabel("Apelido", { exact: true }));
  await page.getByLabel("Apelido", { exact: true }).fill("Lua social");
  await page.getByLabel("Mês de nascimento", { exact: true }).selectOption("1");
  await page
    .getByLabel("Ano de nascimento", { exact: true })
    .fill(String(new Date().getUTCFullYear() - 8));
  await page.getByRole("checkbox", { name: /Declaro que tenho 18/ }).check();
  await page.getByRole("button", { name: "Confirmar cadastro", exact: true }).click();
  await page.getByRole("link", { name: "Supervisionar Lua social", exact: true }).click();
  const contatos = page.getByRole("checkbox", { name: /Permitir pedidos de contato/ });
  await hidratado(contatos);
  await contatos.check();
  await page.getByLabel("Revisei e confirmo estas regras para o perfil.", { exact: true }).check();
  await clicar(page, "Salvar supervisão");
  await page.goto("/conta/perfis");
  const destinoContatos = await page
    .getByRole("link", { name: "Contatos e pedidos de Lua social", exact: true })
    .getAttribute("href");
  if (!destinoContatos) throw new Error("O perfil precisa oferecer a supervisão de contatos.");
  await page.getByRole("link", { name: "Gerenciar aparelhos de Lua social", exact: true }).click();
  const tablet = await novoAparelho(browser);
  const infantil = await tablet.newPage();
  await infantil.goto("/parear");
  const mostrar = infantil.getByRole("button", {
    name: "Mostrar código deste aparelho",
    exact: true,
  });
  await hidratado(mostrar);
  await mostrar.click();
  const pareamento = infantil.getByLabel("Código de pareamento", { exact: true });
  await expect(pareamento).toBeVisible();
  const campo = page.getByLabel("Código mostrado no outro aparelho", { exact: true });
  await hidratado(campo);
  await campo.fill((await pareamento.innerText()).replace(/\s/g, ""));
  await page.getByRole("button", { name: "Confirmar aparelho de Lua social", exact: true }).click();
  await expect(infantil).toHaveURL(/\/aparelho$/);
  await pedir(adulto.page, await codigo(infantil));
  await infantil.reload();
  await clicar(infantil, "Aceitar pedido");
  await expect(infantil.getByText("Amizade confirmada", { exact: true })).toHaveCount(0);
  await page.goto(destinoContatos);
  await expect(
    page.getByRole("heading", { name: "Contatos de Lua social", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Contato conhecido", exact: true })).toBeVisible();
  await expect(page.getByText("1 aviso aguarda sua leitura.", { exact: true })).toBeVisible();
  const aprovacao = page.getByRole("checkbox", {
    name: "Conheço este contato e autorizo esta amizade para o perfil sob minha responsabilidade.",
    exact: true,
  });
  await hidratado(aprovacao);
  await expect(page.getByRole("button", { name: "Aprovar amizade", exact: true })).toBeDisabled();
  await aprovacao.check();
  await clicar(page, "Aprovar amizade");
  await expect(page.getByText("Amizade confirmada", { exact: true })).toBeVisible();
  await clicar(page, "Marcar aviso como lido");
  await expect(page.getByText("Nenhum aviso pendente de leitura.", { exact: true })).toBeVisible();
  await infantil.reload();
  await expect(infantil.getByText("Amizade confirmada", { exact: true })).toBeVisible();
  await expect(infantil.getByRole("button", { name: "Salvar presença", exact: true })).toHaveCount(
    0,
  );
  await infantil.setViewportSize({ width: 390, height: 844 });
  expect(await infantil.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await tela(infantil, "social-infantil-mobile");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await tela(page, "social-responsavel-sem-jogador-mobile");
  await clicar(page, "Bloquear");
  await infantil.reload();
  await expect(infantil.getByText("Bloqueado por você", { exact: true })).toBeVisible();
  await infantil.goto(destinoContatos);
  await expect(infantil).toHaveURL(/\/entrar\?encerrada=1$/);
  await expect(infantil.getByRole("button", { name: "Aprovar amizade", exact: true })).toHaveCount(
    0,
  );
});
