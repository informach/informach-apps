import { expect, test } from "@playwright/test";
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

test.beforeEach(comecarVigia);
test.afterEach(async () => {
  await fecharAparelhos();
  expect(vigia().violacoes).toEqual([]);
  expect(vigia().errosDePagina).toEqual([]);
  expect(vigia().errosDeConsole).toEqual([]);
});

test("responsável nomeia coadmin, arquiva e retoma sem conceder gestão ao outro adulto", async ({
  browser,
}) => {
  const a = await novaPessoa(browser, "Sol da gestão"),
    b = await novaPessoa(browser, "Mar da gestão");
  const mundo = await criarMundo(a.page, "Jogo de teste", "Casa com continuidade");
  await convidar(a.page, b.page, mundo);
  const destino = `/conta/mundos/${mundo}/gestao`;
  await a.page.goto(destino);
  const participante = a.page.getByRole("combobox", { name: "Participante adulto", exact: true });
  await hidratado(participante);
  await participante.selectOption({ label: "Mar da gestão" });
  const confirmar = a.page.getByRole("button", { name: "Confirmar mudança no mundo", exact: true });
  await expect(confirmar).toBeDisabled();
  await a.page.getByRole("checkbox", { name: /Conferi a pessoa/ }).check();
  await confirmar.click();
  await expect(a.page.getByRole("status")).toContainText("Mudança confirmada e registrada");
  await a.page.getByRole("link", { name: "Atualizar gestão do mundo", exact: true }).click();
  await expect(
    a.page
      .getByRole("region", { name: "Participantes e papéis", exact: true })
      .getByText("Coadministrador", { exact: true }),
  ).toBeVisible();
  await b.page.goto(destino);
  await expect(b.page.getByText(/Você pode acompanhar a gestão/)).toBeVisible();
  await expect(
    b.page.getByRole("button", { name: "Confirmar mudança no mundo", exact: true }),
  ).toHaveCount(0);
  const acao = a.page.getByRole("combobox", { name: "O que você quer fazer?", exact: true });
  await hidratado(acao);
  await acao.selectOption("arquivar");
  await expect(a.page.getByText(/Todos precisam sair pelo jogo/)).toBeVisible();
  await a.page.getByRole("checkbox", { name: /Conferi a pessoa/ }).check();
  await confirmar.click();
  await expect(a.page.getByRole("status")).toContainText("Mudança confirmada e registrada");
  await a.page.getByRole("link", { name: "Atualizar gestão do mundo", exact: true }).click();
  await expect(a.page.getByText("Gestão do mundo · Arquivado", { exact: true })).toBeVisible();
  await a.page.setViewportSize({ width: 390, height: 844 });
  expect(await a.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await tela(a.page, "mundos-gestao-mobile", { paginaInteira: true });
  await a.page.goto("/estante");
  const cartao = a.page
    .getByRole("region", { name: "Seus mundos no Jogo de teste", exact: true })
    .getByRole("listitem")
    .filter({ has: a.page.getByRole("link", { name: "Casa com continuidade", exact: true }) });
  await expect(cartao).toContainText("arquivado");
  await expect(
    cartao.getByRole("link", { name: "Jogar em Casa com continuidade", exact: true }),
  ).toHaveCount(0);
  await a.page.goto(destino);
  await hidratado(acao);
  await acao.selectOption("retomar");
  await a.page.getByRole("checkbox", { name: /Conferi a pessoa/ }).check();
  await confirmar.click();
  await expect(a.page.getByRole("status")).toContainText("Mudança confirmada e registrada");
  await a.page.getByRole("link", { name: "Atualizar gestão do mundo", exact: true }).click();
  await expect(a.page.getByText("Gestão do mundo · Disponível", { exact: true })).toBeVisible();
  await a.page.goto("/estante");
  await expect(
    a.page.getByRole("link", { name: "Jogar em Casa com continuidade", exact: true }),
  ).toBeVisible();
});
