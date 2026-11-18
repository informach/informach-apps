import { expect, type Page, test } from "@playwright/test";
import { comecarVigia, fecharAparelhos, hidratado, novaPessoa, tela, vigia } from "./apoio";
import { familiaComAparelho, mundoNoAparelho } from "./familia-apoio";
import { servidorDoContador } from "./servidor-apoio";

const contador = servidorDoContador();
test.beforeEach(comecarVigia);
test.afterEach(async () => {
  await fecharAparelhos();
  await contador.parar();
  expect(vigia().violacoes).toEqual([]);
  expect(vigia().errosDePagina).toEqual([]);
  expect(vigia().errosDeConsole).toEqual([]);
});
async function clicarComRecarga(page: Page, nome: string) {
  const botao = page.getByRole("button", { name: nome, exact: true });
  await hidratado(botao);
  await Promise.all([page.waitForEvent("load"), botao.click()]);
}
test("responsável sem jogador transfere mundo infantil por aceite independente, preservando participação e progresso", async ({
  browser,
}) => {
  test.setTimeout(120000);
  const f = await familiaComAparelho(browser, "Lua da continuidade"),
    adulto = await novaPessoa(browser, "Mar da continuidade");
  const mundo = await mundoNoAparelho(f, "Casa que continua");
  await contador.iniciar();
  await f.infantil.goto(`/jogar/teste?mundo=${mundo}`);
  await expect(f.infantil.getByLabel("Valor do contador", { exact: true })).toHaveText("0");
  await f.infantil.getByRole("button", { name: "Somar 1", exact: true }).click();
  await expect(f.infantil.getByLabel("Valor do contador", { exact: true })).toHaveText("1");
  await f.infantil.getByRole("button", { name: "Sair por dentro do jogo", exact: true }).click();
  await expect(f.infantil).toHaveURL(/\/aparelho$/);
  await adulto.page.goto("/amigos");
  const gerar = adulto.page.getByRole("button", { name: "Gerar código", exact: true });
  await hidratado(gerar);
  await gerar.click();
  const codigo = await adulto.page.getByLabel("Código de amizade", { exact: true }).innerText();
  await f.infantil.goto("/amigos");
  const campo = f.infantil.getByLabel("Código que você recebeu", { exact: true });
  await hidratado(campo);
  await campo.fill(codigo);
  await f.infantil.getByRole("button", { name: "Enviar pedido", exact: true }).click();
  await expect(campo).toHaveValue("");
  await adulto.page.reload();
  await clicarComRecarga(adulto.page, "Aceitar pedido");
  await f.adulto.page.goto(f.contatos);
  const amizade = f.adulto.page.getByRole("checkbox", {
    name: "Conheço este contato e autorizo esta amizade para o perfil sob minha responsabilidade.",
    exact: true,
  });
  await hidratado(amizade);
  await amizade.check();
  await clicarComRecarga(f.adulto.page, "Aprovar amizade");
  await f.infantil.goto("/amigos");
  await f.infantil.getByRole("link", { name: "Convidar para um mundo", exact: true }).click();
  const escolha = f.infantil.getByRole("combobox", { name: "Escolha um mundo", exact: true });
  await hidratado(escolha);
  await escolha.selectOption(mundo);
  await f.infantil.getByRole("button", { name: "Convidar para este mundo", exact: true }).click();
  await expect(
    f.infantil.getByText("Convite registrado. Confira as confirmações em Convites de mundos.", {
      exact: true,
    }),
  ).toBeVisible();
  await f.adulto.page.goto(f.convites);
  await f.adulto.page.getByRole("link", { name: "Conferir convite", exact: true }).click();
  const participacao = f.adulto.page.getByRole("checkbox", {
    name: "Li o convite e autorizo a participação do perfil sob meus cuidados.",
    exact: true,
  });
  await hidratado(participacao);
  await participacao.check();
  await f.adulto.page.getByRole("button", { name: "Registrar aprovação", exact: true }).click();
  await expect(f.adulto.page.getByRole("status")).toContainText("Sua aprovação foi registrada");
  await adulto.page.goto("/convites");
  const caixa = adulto.page.getByRole("region", { name: "Convites de mundos", exact: true });
  await caixa.getByRole("button", { name: "Conferir convite", exact: true }).click();
  await caixa.getByRole("button", { name: "Aceitar participação", exact: true }).click();
  await expect(
    caixa.getByText("Participação confirmada. O mundo está na sua estante.", { exact: true }),
  ).toBeVisible();
  await f.adulto.page.goto(`/conta/perfis/${f.perfilId}/mundos/${mundo}/gestao`);
  await f.adulto.page
    .getByRole("link", { name: "Transferir responsabilidade pelo mundo", exact: true })
    .click();
  const destinatario = f.adulto.page.getByRole("combobox", {
    name: "Adulto que receberá a responsabilidade",
    exact: true,
  });
  await hidratado(destinatario);
  await destinatario.selectOption({ label: "Mar da continuidade" });
  const propor = f.adulto.page.getByRole("button", {
    name: "Propor transferência do mundo",
    exact: true,
  });
  await expect(propor).toBeDisabled();
  await f.adulto.page
    .getByRole("checkbox", {
      name: "Conferi o adulto escolhido e autorizo esta transferência se ele aceitar. O perfil sob meus cuidados continuará participante.",
      exact: true,
    })
    .check();
  await f.adulto.page.setViewportSize({ width: 390, height: 844 });
  expect(
    await f.adulto.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  await tela(f.adulto.page, "sucessao-menor-mobile", { paginaInteira: true });
  await propor.click();
  await expect(f.adulto.page.getByRole("status")).toContainText("Proposta registrada");
  await adulto.page.goto(`/conta/mundos/${mundo}/responsabilidade`);
  await adulto.page.getByText("Avaliar proposta", { exact: true }).click();
  const aceitar = adulto.page.getByRole("button", {
    name: "Aceitar e assumir responsabilidade",
    exact: true,
  });
  await hidratado(aceitar);
  await aceitar.click();
  await expect(adulto.page.getByRole("status")).toContainText("A proposta foi aceita");
  await expect(
    adulto.page.getByRole("heading", { name: "Você responde por este mundo", exact: true }),
  ).toBeVisible();
  await adulto.page.goto(`/jogar/teste?mundo=${mundo}`);
  await expect(adulto.page.getByLabel("Valor do contador", { exact: true })).toHaveText("1");
  await f.infantil.goto(`/jogar/teste?mundo=${mundo}`);
  await expect(f.infantil.getByLabel("Valor do contador", { exact: true })).toHaveText("1");
  await f.infantil.getByRole("button", { name: "Somar 1", exact: true }).click();
  await expect(adulto.page.getByLabel("Valor do contador", { exact: true })).toHaveText("2");
  await f.infantil.getByRole("button", { name: "Sair por dentro do jogo", exact: true }).click();
  await adulto.page.getByRole("button", { name: "Sair por dentro do jogo", exact: true }).click();
  await expect(f.infantil).toHaveURL(/\/aparelho$/);
  await expect(adulto.page).toHaveURL(/\/estante$/);
});
