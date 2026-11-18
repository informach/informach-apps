import { expect, type Page, test } from "@playwright/test";
import { comecarVigia, fecharAparelhos, hidratado, tela, vigia } from "./apoio";
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

test("dois responsáveis sem jogador aprovam convite dos aparelhos infantis e conservam ambos os mundos", async ({
  browser,
}) => {
  test.setTimeout(120000);
  const a = await familiaComAparelho(browser, "Lua dos convites"),
    b = await familiaComAparelho(browser, "Rio dos convites");
  await b.infantil.goto("/amigos");
  const gerar = b.infantil.getByRole("button", { name: "Gerar código", exact: true });
  await hidratado(gerar);
  await gerar.click();
  const codigo = await b.infantil.getByLabel("Código de amizade", { exact: true }).innerText();
  await a.infantil.goto("/amigos");
  const campo = a.infantil.getByLabel("Código que você recebeu", { exact: true });
  await hidratado(campo);
  await campo.fill(codigo);
  await a.infantil.getByRole("button", { name: "Enviar pedido", exact: true }).click();
  await expect(campo).toHaveValue("");
  await b.infantil.reload();
  await clicarComRecarga(b.infantil, "Aceitar pedido");
  for (const f of [a, b]) {
    await f.adulto.page.goto(f.contatos);
    const confirmacao = f.adulto.page.getByRole("checkbox", {
      name: "Conheço este contato e autorizo esta amizade para o perfil sob minha responsabilidade.",
      exact: true,
    });
    await hidratado(confirmacao);
    await confirmacao.check();
    await clicarComRecarga(f.adulto.page, "Aprovar amizade");
  }
  const mundoA = await mundoNoAparelho(a, "Casa da Lua convidando"),
    mundoB = await mundoNoAparelho(b, "Casa do Rio recebendo");
  await contador.iniciar();
  await a.infantil.goto(`/jogar/teste?mundo=${mundoA}`);
  await b.infantil.goto(`/jogar/teste?mundo=${mundoB}`);
  await expect(a.infantil.getByLabel("Valor do contador", { exact: true })).toHaveText("0");
  await expect(b.infantil.getByLabel("Valor do contador", { exact: true })).toHaveText("0");
  await a.infantil.getByRole("button", { name: "Somar 1", exact: true }).click();
  await expect(a.infantil.getByLabel("Valor do contador", { exact: true })).toHaveText("1");
  await a.infantil.getByRole("button", { name: "Amigos e proteção", exact: true }).click();
  const painelA = a.infantil.getByRole("dialog", { name: "Amigos e proteção", exact: true });
  await painelA.getByRole("button", { name: "Convidar para este mundo", exact: true }).click();
  await expect(
    painelA.getByRole("button", { name: "Convite registrado", exact: true }),
  ).toBeVisible();
  await painelA.getByRole("button", { name: "Voltar à partida", exact: true }).click();
  await b.infantil.getByRole("button", { name: "Amigos e proteção", exact: true }).click();
  const painelB = b.infantil.getByRole("dialog", { name: "Amigos e proteção", exact: true }),
    caixa = painelB.getByRole("region", { name: "Convites de mundos na partida", exact: true });
  await expect(caixa.getByText("Convite recebido", { exact: true })).toBeVisible();
  await caixa.getByRole("button", { name: "Conferir convite", exact: true }).click();
  await expect(
    caixa.getByRole("button", { name: "Aceitar participação", exact: true }),
  ).toBeDisabled();
  for (const f of [a, b]) {
    await f.adulto.page.goto(f.convites);
    await f.adulto.page.getByRole("link", { name: "Conferir convite", exact: true }).click();
    await expect(
      f.adulto.page.getByRole("heading", { name: "Casa da Lua convidando", exact: true }),
    ).toBeVisible();
    const aprovar = f.adulto.page.getByRole("checkbox", {
      name: "Li o convite e autorizo a participação do perfil sob meus cuidados.",
      exact: true,
    });
    await hidratado(aprovar);
    await expect(
      f.adulto.page.getByRole("button", { name: "Registrar aprovação", exact: true }),
    ).toBeDisabled();
    if (f === a) {
      await f.adulto.page.setViewportSize({ width: 390, height: 844 });
      expect(
        await f.adulto.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBe(true);
      await tela(f.adulto.page, "convites-responsavel-mobile", { paginaInteira: true });
    }
    await aprovar.check();
    await f.adulto.page.getByRole("button", { name: "Registrar aprovação", exact: true }).click();
    await expect(f.adulto.page.getByRole("status")).toContainText("Sua aprovação foi registrada");
  }
  await caixa.getByRole("button", { name: "Atualizar convites", exact: true }).click();
  await caixa.getByRole("button", { name: "Conferir convite", exact: true }).click();
  await expect(
    caixa.getByRole("button", { name: "Aceitar participação", exact: true }),
  ).toBeEnabled();
  await caixa.getByRole("button", { name: "Aceitar participação", exact: true }).click();
  await expect(caixa.getByText(/Participação confirmada/)).toBeVisible();
  await expect(b.infantil).toHaveURL(`/jogar/teste?mundo=${mundoB}`);
  await painelB.getByRole("button", { name: "Voltar à partida", exact: true }).click();
  await b.infantil.getByRole("button", { name: "Sair por dentro do jogo", exact: true }).click();
  await expect(b.infantil).toHaveURL(/\/aparelho$/);
  await b.infantil.goto(`/jogar/teste?mundo=${mundoA}`);
  await expect(b.infantil.getByLabel("Valor do contador", { exact: true })).toHaveText("1");
  await b.infantil.getByRole("button", { name: "Somar 1", exact: true }).click();
  await expect(a.infantil.getByLabel("Valor do contador", { exact: true })).toHaveText("2");
  await b.infantil.getByRole("button", { name: "Sair por dentro do jogo", exact: true }).click();
  await a.infantil.getByRole("button", { name: "Sair por dentro do jogo", exact: true }).click();
  await expect(a.infantil).toHaveURL(/\/aparelho$/);
});
