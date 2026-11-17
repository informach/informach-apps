import { expect, type Page, test } from "@playwright/test";
import {
  comecarVigia,
  convidar,
  criarMundo,
  fecharAparelhos,
  hidratado,
  novaPessoa,
  tela,
  vigia,
} from "./apoio";
import {
  enderecoDoJogo,
  iniciarServidor as iniciarMorada,
  jogoEm,
  mundoNaTela,
  pararServidor as pararMorada,
} from "./morada-apoio";
import { servidorDoContador } from "./servidor-apoio";

const contador = servidorDoContador();
test.beforeEach(comecarVigia);
test.afterEach(async () => {
  await fecharAparelhos();
  await contador.parar();
  await pararMorada();
  expect(vigia().violacoes).toEqual([]);
  expect(vigia().errosDePagina).toEqual([]);
  expect(vigia().errosDeConsole).toEqual([]);
});
async function amizade(a: Page, b: Page) {
  await b.goto("/amigos");
  const gerar = b.getByRole("button", { name: "Gerar código", exact: true });
  await hidratado(gerar);
  await gerar.click();
  const codigo = await b.getByLabel("Código de amizade", { exact: true }).innerText();
  await a.goto("/amigos");
  const campo = a.getByLabel("Código que você recebeu", { exact: true });
  await hidratado(campo);
  await campo.fill(codigo);
  await a.getByRole("button", { name: "Enviar pedido", exact: true }).click();
  await expect(a.getByRole("article")).toHaveCount(1);
  await b.reload();
  const aceitar = b.getByRole("button", { name: "Aceitar pedido", exact: true });
  await hidratado(aceitar);
  await aceitar.click();
  await expect(b.getByText("Amizade confirmada", { exact: true })).toBeVisible();
}

test("painel social usa o SID sem sair, pausar o mundo ou retirar outros membros", async ({
  browser,
}) => {
  const a = await novaPessoa(browser, "Sol na partida"),
    b = await novaPessoa(browser, "Mar na partida");
  await amizade(a.page, b.page);
  const mundo = await criarMundo(a.page, "Jogo de teste", "Casa com painel");
  await convidar(a.page, b.page, mundo);
  await contador.iniciar();
  const destino = `/jogar/teste?mundo=${mundo}`;
  await a.page.goto(destino);
  await b.page.goto(destino);
  const valor = a.page.locator('[aria-label="Valor do contador"]');
  await expect(valor).toHaveText("0");
  await expect(a.page.getByRole("list", { name: "Quem está aqui" })).toContainText(
    "Mar na partida",
  );
  await a.page.getByRole("button", { name: "Somar 1", exact: true }).click();
  await expect(valor).toHaveText("1");
  let saidas = 0;
  a.page.on("request", (pedido) => {
    if (new URL(pedido.url()).pathname === "/api/sdk/v1/sessao/sair") saidas++;
  });
  await a.page.getByRole("button", { name: "Amigos e proteção", exact: true }).click();
  const painel = a.page.getByRole("dialog", { name: "Amigos e proteção", exact: true });
  await expect(painel).toBeVisible();
  await expect(a.page.locator("[data-palco]")).toHaveAttribute("inert", "");
  await expect(painel.getByRole("button", { name: "Voltar à partida", exact: true })).toBeFocused();
  await expect(painel.getByRole("heading", { name: "Mar na partida", exact: true })).toBeVisible();
  for (let i = 0; i < 12; i++) {
    await a.page.keyboard.press("Tab");
    expect(await a.page.evaluate(() => !!document.activeElement?.closest("dialog"))).toBe(true);
  }
  for (let i = 0; i < 12; i++) {
    await a.page.keyboard.press("Shift+Tab");
    expect(await a.page.evaluate(() => !!document.activeElement?.closest("dialog"))).toBe(true);
  }
  await b.page.getByRole("button", { name: "Somar 1", exact: true }).click();
  await expect(valor).toHaveText("2");
  await painel.getByRole("button", { name: "Silenciar", exact: true }).click();
  await expect(painel.getByText("Silenciado", { exact: true })).toBeVisible();
  await painel.getByRole("button", { name: "Denunciar contato", exact: true }).click();
  await painel.getByLabel("O que aconteceu?", { exact: true }).selectOption("outro");
  await painel.getByRole("button", { name: "Enviar denúncia", exact: true }).click();
  await expect(
    painel.getByLabel("Protocolo da denúncia na partida", { exact: true }),
  ).toBeVisible();
  const protocolo = await painel
    .getByLabel("Protocolo da denúncia na partida", { exact: true })
    .innerText();
  await painel.getByRole("button", { name: "Consultar meus protocolos", exact: true }).click();
  const acompanhamento = painel.getByRole("region", {
    name: "Denúncias deste perfil na partida",
    exact: true,
  });
  await expect(acompanhamento.getByText(protocolo, { exact: true })).toBeVisible();
  await expect(acompanhamento.getByRole("heading", { name: "Recebida pela equipe" })).toBeVisible();
  await painel.getByRole("button", { name: "Bloquear", exact: true }).click();
  await expect(painel.getByText("Bloqueado por você", { exact: true })).toBeVisible();
  await b.page.getByRole("button", { name: "Somar 1", exact: true }).click();
  await expect(valor).toHaveText("3");
  expect(saidas).toBe(0);
  await expect(a.page).toHaveURL(destino);
  await a.page.setViewportSize({ width: 390, height: 844 });
  expect(await painel.evaluate((elemento) => elemento.scrollWidth <= elemento.clientWidth)).toBe(
    true,
  );
  await painel.evaluate((elemento) => {
    elemento.scrollTop = 0;
  });
  await tela(a.page, "host-social-mobile-topo");
  await painel.evaluate((elemento) => {
    elemento.scrollTop = elemento.scrollHeight;
  });
  await tela(a.page, "host-social-mobile-cuidados");
  await painel.getByRole("button", { name: "Voltar à partida", exact: true }).click();
  await expect(painel).not.toBeVisible();
  await expect(a.page.locator("[data-palco]")).not.toHaveAttribute("inert", "");
  await a.page.getByRole("button", { name: "Somar 1", exact: true }).click();
  await expect(valor).toHaveText("4");
  expect(saidas).toBe(0);
  await a.page.getByRole("button", { name: "Sair por dentro do jogo", exact: true }).click();
  await expect(a.page).toHaveURL(/\/estante$/);
  expect(saidas).toBeGreaterThan(0);
  await b.page.getByRole("button", { name: "Sair por dentro do jogo", exact: true }).click();
  await expect(b.page).toHaveURL(/\/estante$/);
});

test("Morada mantém o ritmo enquanto o teclado está no painel e conserva a saída com salvamento", async ({
  browser,
}) => {
  const a = await novaPessoa(browser, "Sol no Morada"),
    mundo = await criarMundo(a.page, "Morada", "Casa com cuidados");
  await iniciarMorada();
  await a.page.goto(enderecoDoJogo(mundo));
  const jogo = jogoEm(a.page);
  await mundoNaTela(jogo);
  const normal = a.page.locator('.morada-ritmo button[aria-label="Velocidade 1 vezes"]');
  await expect(normal).toHaveAttribute("aria-pressed", "true");
  await a.page.setViewportSize({ width: 390, height: 844 });
  await tela(a.page, "host-controle-morada-mobile");
  await a.page.getByRole("button", { name: "Amigos e proteção", exact: true }).click();
  const painel = a.page.getByRole("dialog", { name: "Amigos e proteção", exact: true });
  const campo = painel.getByLabel("Código que você recebeu", { exact: true });
  await expect(campo).toBeEnabled();
  await campo.fill("AAAAAAAAAAAA");
  await campo.press("Space");
  await expect(normal).toHaveAttribute("aria-pressed", "true");
  await expect(jogo.hud).toHaveAttribute("data-morada-conexao", "pronto");
  await tela(a.page, "host-social-morada-mobile");
  await a.page.keyboard.press("Escape");
  await expect(painel).not.toBeVisible();
  await jogo.cena.focus();
  await jogo.cena.press("Space");
  await expect(a.page.getByRole("button", { name: "Pausar", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await jogo.cena.press("Space");
  await expect(normal).toHaveAttribute("aria-pressed", "true");
  await jogo.sair.click();
  await expect(a.page).toHaveURL(/\/estante$/);
});
