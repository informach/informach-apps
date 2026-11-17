import { expect, test } from "@playwright/test";
import {
  comecarVigia,
  conceder,
  fecharAparelhos,
  hidratado,
  novaPessoa,
  novoAparelho,
  tela,
  vigia,
} from "../e2e/apoio";

test.beforeEach(comecarVigia);
test.afterEach(async () => {
  await fecharAparelhos();
  expect(vigia().violacoes).toEqual([]);
  expect(vigia().errosDePagina).toEqual([]);
});

test("minuto real do perfil infantil termina com recibo, recusa direta e relatório privado", async ({
  browser,
}) => {
  const responsavel = await novaPessoa(browser, "Responsável", {
    semPerfil: true,
    comAcesso: false,
  });
  const { page } = responsavel;
  await page.goto("/conta/perfis");
  const adicionar = page.getByRole("button", { name: "Adicionar perfil", exact: true });
  await hidratado(adicionar);
  await adicionar.click();
  await hidratado(page.getByLabel("Apelido", { exact: true }));
  await page.getByLabel("Apelido", { exact: true }).fill("Minuto");
  await page.getByLabel("Mês de nascimento", { exact: true }).selectOption("1");
  await page
    .getByLabel("Ano de nascimento", { exact: true })
    .fill(String(new Date().getUTCFullYear() - 8));
  await page.getByRole("checkbox", { name: /Declaro que tenho 18/ }).check();
  await page.getByRole("button", { name: "Confirmar cadastro", exact: true }).click();
  conceder(responsavel.email, "family");
  await page.getByRole("link", { name: "Supervisionar Minuto", exact: true }).click();
  const limite = page.getByLabel("Limite diário em minutos", { exact: true });
  await hidratado(limite);
  await limite.fill("1");
  await page.getByLabel("Revisei e confirmo estas regras para o perfil.", { exact: true }).check();
  await page.getByRole("button", { name: "Salvar supervisão", exact: true }).click();
  await expect(
    page.getByText("Supervisão confirmada. Confira abaixo as regras atuais.", { exact: true }),
  ).toBeVisible();
  const supervisao = page.url();
  await page.goto("/conta/perfis");
  await page.getByRole("link", { name: "Gerenciar aparelhos de Minuto", exact: true }).click();
  const contexto = await novoAparelho(browser);
  const tablet = await contexto.newPage();
  await tablet.goto("/parear");
  const mostrar = tablet.getByRole("button", {
    name: "Mostrar código deste aparelho",
    exact: true,
  });
  await hidratado(mostrar);
  await mostrar.click();
  const codigoNaTela = tablet.getByLabel("Código de pareamento", { exact: true });
  await expect(codigoNaTela).toBeVisible();
  const codigo = (await codigoNaTela.innerText()).replace(/\s/g, "");
  await hidratado(page.getByLabel("Código mostrado no outro aparelho", { exact: true }));
  await page.getByLabel("Código mostrado no outro aparelho", { exact: true }).fill(codigo);
  await page.getByRole("button", { name: "Confirmar aparelho de Minuto", exact: true }).click();
  await expect(tablet).toHaveURL(/\/aparelho$/);
  const primeira = tablet.waitForRequest(
    (pedido) => new URL(pedido.url()).pathname === "/api/sdk/v1/dados" && pedido.method() === "GET",
  );
  await tablet
    .getByRole("link", { name: "Jogar Prova de progresso por perfil", exact: true })
    .click();
  const autorizacao = (await primeira).headers().authorization;
  if (!autorizacao) throw new Error("Sessão do jogo ausente");
  await expect(tablet.getByRole("button", { name: "Ganhar ponto", exact: true })).toBeEnabled();
  await tablet.getByRole("button", { name: "Ganhar ponto", exact: true }).click();
  await expect(tablet.getByRole("status", { name: "Estado do progresso", exact: true })).toHaveText(
    "Progresso salvo.",
  );
  await expect(tablet.getByText(/Faltam cerca de 1 minuto para a pausa/)).toBeVisible();
  // Espera o orçamento real, sem adiantar relógio, encurtar a política ou forjar resposta.
  await expect(
    tablet.getByRole("heading", { name: "Hora de fazer uma pausa", exact: true }),
  ).toBeVisible({ timeout: 90_000 });
  await expect(tablet.getByText("Progresso salvo e confirmado.", { exact: true })).toBeVisible();
  expect(
    (
      await contexto.request.post("/api/sdk/v1/dados", {
        headers: { authorization: autorizacao },
        data: { operacao: "gravar", chave: "apos-corte", revisao: 0, conteudo: "MQ==" },
      })
    ).status(),
  ).toBe(401);
  await expect(tablet.getByRole("button", { name: "Ganhar ponto", exact: true })).toHaveCount(0);
  await tablet.getByRole("link", { name: "Voltar à estante", exact: true }).click();
  await expect(tablet).toHaveURL(/\/aparelho$/);
  await page.goto(supervisao);
  await expect(
    page.getByRole("table", { name: "Tempo agregado dos últimos sete dias, por data de Brasília" }),
  ).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Para salvar", exact: true })).toBeVisible();
  await tela(page, "supervisao-tempo-real");
});
