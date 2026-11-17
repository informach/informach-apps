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
} from "./apoio";

test.beforeEach(comecarVigia);
test.afterEach(async () => {
  await fecharAparelhos();
  expect(vigia().violacoes).toEqual([]);
  expect(vigia().errosDePagina).toEqual([]);
  expect(vigia().errosDeConsole).toEqual([]);
});

test("responsável sem jogador gerencia o mundo criado no aparelho infantil, sem abrir gestão nele", async ({
  browser,
}) => {
  const adulto = await novaPessoa(browser, "Responsável dos mundos", { semPerfil: true });
  conceder(adulto.email, "family");
  const { page } = adulto;
  await page.goto("/conta/perfis");
  const adicionar = page.getByRole("button", { name: "Adicionar perfil", exact: true });
  await hidratado(adicionar);
  await adicionar.click();
  const apelido = page.getByLabel("Apelido", { exact: true });
  await hidratado(apelido);
  await apelido.fill("Lua dos mundos");
  await page.getByLabel("Mês de nascimento", { exact: true }).selectOption("1");
  await page
    .getByLabel("Ano de nascimento", { exact: true })
    .fill(String(new Date().getUTCFullYear() - 8));
  await page.getByRole("checkbox", { name: /Declaro que tenho 18/ }).check();
  await page.getByRole("button", { name: "Confirmar cadastro", exact: true }).click();
  const lista = await page
    .getByRole("link", { name: "Mundos de Lua dos mundos", exact: true })
    .getAttribute("href");
  if (!lista) throw new Error("Gestão dos mundos do perfil ausente");
  await page.getByRole("link", { name: "Supervisionar Lua dos mundos", exact: true }).click();
  const revisar = page.getByLabel("Revisei e confirmo estas regras para o perfil.", {
    exact: true,
  });
  await hidratado(revisar);
  await revisar.check();
  await Promise.all([
    page.waitForEvent("load"),
    page.getByRole("button", { name: "Salvar supervisão", exact: true }).click(),
  ]);
  await page.goto("/conta/perfis");
  await page
    .getByRole("link", { name: "Gerenciar aparelhos de Lua dos mundos", exact: true })
    .click();
  const tablet = await novoAparelho(browser),
    infantil = await tablet.newPage();
  await infantil.goto("/parear");
  const mostrar = infantil.getByRole("button", {
    name: "Mostrar código deste aparelho",
    exact: true,
  });
  await hidratado(mostrar);
  await mostrar.click();
  const codigo = infantil.getByLabel("Código de pareamento", { exact: true });
  await expect(codigo).toBeVisible();
  const campo = page.getByLabel("Código mostrado no outro aparelho", { exact: true });
  await hidratado(campo);
  await campo.fill((await codigo.innerText()).replace(/\s/g, ""));
  await page
    .getByRole("button", { name: "Confirmar aparelho de Lua dos mundos", exact: true })
    .click();
  await expect(infantil).toHaveURL(/\/aparelho$/);
  // Título interno Livre. Não altera a classificação pública do Morada.
  const secao = infantil.getByRole("region", { name: "Seus mundos no Jogo de teste", exact: true });
  const nomeDoMundo = secao.getByLabel("Nome do mundo", { exact: true });
  await hidratado(nomeDoMundo);
  await nomeDoMundo.fill("Casa da Lua");
  await secao.getByRole("button", { name: "Criar mundo", exact: true }).click();
  await expect(infantil).toHaveURL(/\/aparelho\?mundoCriado=[0-9a-f-]{36}$/);
  const mundo = new URL(infantil.url()).searchParams.get("mundoCriado");
  if (!mundo) throw new Error("Mundo criado não confirmado");
  await expect(
    secao.getByRole("link", { name: "Jogar em Casa da Lua", exact: true }),
  ).toBeVisible();
  await expect(infantil.getByRole("link", { name: "Gestão do mundo", exact: true })).toHaveCount(0);
  await page.goto(lista);
  await expect(
    page.getByRole("heading", { name: "Mundos de Lua dos mundos", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Participantes e proteção de Casa da Lua", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Proteção nos mundos do perfil", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Nenhum outro participante nesta página.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Mundos do perfil", exact: true }).click();
  await page.getByRole("link", { name: "Gerenciar Casa da Lua", exact: true }).click();
  const destino = `${lista}/${mundo}/gestao`;
  await expect(page).toHaveURL(destino);
  await expect(page.getByText(/Você cuida deste mundo como responsável atual/)).toBeVisible();
  const acao = page.getByRole("combobox", { name: "O que você quer fazer?", exact: true });
  await hidratado(acao);
  await acao.selectOption("arquivar");
  await page.getByRole("checkbox", { name: /Conferi a pessoa/ }).check();
  await page.getByRole("button", { name: "Confirmar mudança no mundo", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Mudança confirmada e registrada");
  await page.getByRole("link", { name: "Atualizar gestão do mundo", exact: true }).click();
  await expect(page.getByText("Gestão do mundo · Arquivado", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await tela(page, "mundos-menor-gestao-mobile", { paginaInteira: true });
  await infantil.goto(destino);
  await expect(
    infantil.getByRole("button", { name: "Confirmar mudança no mundo", exact: true }),
  ).toHaveCount(0);
  await expect(infantil.getByText(/Você cuida deste mundo como responsável atual/)).toHaveCount(0);
  await acao.selectOption("retomar");
  await page.getByRole("checkbox", { name: /Conferi a pessoa/ }).check();
  await page.getByRole("button", { name: "Confirmar mudança no mundo", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Mudança confirmada e registrada");
  await page.getByRole("link", { name: "Atualizar gestão do mundo", exact: true }).click();
  await expect(page.getByText("Gestão do mundo · Disponível", { exact: true })).toBeVisible();
  await page.goto("/conta/perfis");
  await expect(page.getByRole("heading", { name: "Lua dos mundos", exact: true })).toBeVisible();
});
