import { expect, type Page, test } from "@playwright/test";
import { comecarVigia, fecharAparelhos, hidratado, tela, vigia } from "./apoio";
import { familiaComAparelho, mundoNoAparelho } from "./familia-apoio";
import { observarPresencas } from "./presencas-apoio";
import { servidorDoContador } from "./servidor-apoio";
import { provarVisitaNaGestao } from "./visitas-gestao-apoio";

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
test("gestão nativa aprova visita e conserva a saída manual sem capacidade de salvamento", async ({
  browser,
}) => {
  await provarVisitaNaGestao(browser, contador, false);
});

test("visita infantil exige os dois responsáveis, não cria membro e termina ao sair ou perder o anfitrião", async ({
  browser,
}) => {
  test.setTimeout(240000);
  const a = await familiaComAparelho(browser, "Lua das visitas"),
    b = await familiaComAparelho(browser, "Rio das visitas");
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
    const aprovar = f.adulto.page.getByRole("checkbox", {
      name: "Conheço este contato e autorizo esta amizade para o perfil sob minha responsabilidade.",
      exact: true,
    });
    await hidratado(aprovar);
    await aprovar.check();
    await clicarComRecarga(f.adulto.page, "Aprovar amizade");
  }
  const mundo = await mundoNoAparelho(a, "Casa de visitas da Lua");
  await contador.iniciar();
  await a.infantil.goto(`/jogar/teste?mundo=${mundo}`);
  await expect(a.infantil.getByLabel("Valor do contador", { exact: true })).toHaveText("0");
  await expect
    .poll(() => observarPresencas(mundo))
    .toMatchObject({ ativas: 1, membros: 1, sessoes_abertas: 1 });
  let ingressoDoVisitante = 0;
  b.infantil.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/sdk/v1/sessao" && r.method() === "POST")
      ingressoDoVisitante++;
  });
  for (const rodada of [1, 2]) {
    await a.infantil.getByRole("button", { name: "Amigos e proteção", exact: true }).click();
    const painel = a.infantil.getByRole("dialog", { name: "Amigos e proteção", exact: true });
    await painel.getByRole("button", { name: "Convidar para visitar", exact: true }).click();
    await expect(
      painel.getByRole("button", { name: "Convite de visita registrado", exact: true }),
    ).toBeVisible();
    await painel.getByRole("button", { name: "Voltar à partida", exact: true }).click();
    await b.infantil.goto("/visitas");
    await b.infantil.getByRole("link", { name: "Conferir visita", exact: true }).click();
    await expect(b.infantil).toHaveURL(/\/visitas\/[0-9a-f-]{36}$/);
    const paginaDoConvite = new URL(b.infantil.url()).pathname;
    await expect(
      b.infantil.getByRole("button", { name: "Aceitar visita", exact: true }),
    ).toBeDisabled();
    expect(ingressoDoVisitante).toBe(rodada - 1);
    for (const f of [a, b]) {
      await f.adulto.page.goto(`/conta/perfis/${f.perfilId}/visitas`);
      await f.adulto.page.getByRole("link", { name: "Conferir visita", exact: true }).click();
      const aprovar = f.adulto.page.getByRole("checkbox", {
        name: "Li o convite e autorizo a visita do perfil sob meus cuidados.",
        exact: true,
      });
      await hidratado(aprovar);
      await expect(
        f.adulto.page.getByRole("button", { name: "Aprovar visita", exact: true }),
      ).toBeDisabled();
      if (rodada === 1 && f === a) {
        await f.adulto.page.setViewportSize({ width: 390, height: 844 });
        expect(
          await f.adulto.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        ).toBe(true);
        await tela(f.adulto.page, "visitas-responsavel-mobile", { paginaInteira: true });
      }
      await aprovar.check();
      await f.adulto.page.getByRole("button", { name: "Aprovar visita", exact: true }).click();
      await expect(f.adulto.page.getByRole("status")).toContainText("Sua aprovação foi registrada");
    }
    await b.infantil.goto(paginaDoConvite);
    const aceitar = b.infantil.getByRole("button", { name: "Aceitar visita", exact: true });
    await hidratado(aceitar);
    await aceitar.click();
    await expect(b.infantil.getByRole("status")).toContainText("Convite aceito");
    await expect(
      b.infantil.getByRole("button", { name: "Encerrar visita", exact: true }),
    ).toBeEnabled();
    const entrar = b.infantil.getByRole("link", { name: "Conferir entrada no mundo", exact: true }),
      destino = await entrar.getAttribute("href");
    if (!destino) throw new Error("Finalidade de visita ausente");
    if (rodada === 1) {
      await b.infantil.setViewportSize({ width: 390, height: 844 });
      expect(
        await b.infantil.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      ).toBe(true);
      await tela(b.infantil, "visitas-aceite-mobile", { paginaInteira: true });
    }
    await entrar.click();
    await expect(b.infantil.getByLabel("Valor do contador", { exact: true })).toHaveText("0");
    await expect
      .poll(() => observarPresencas(mundo))
      .toMatchObject({ ativas: 1, membros: 1, sessoes_abertas: 2, visitantes_admitidos: 1 });
    if (rodada === 1) {
      await b.infantil
        .getByRole("button", { name: "Sair por dentro do jogo", exact: true })
        .click();
      await expect(b.infantil).toHaveURL(/\/aparelho$/);
      await expect
        .poll(() => observarPresencas(mundo))
        .toMatchObject({
          membros: 1,
          sessoes_abertas: 1,
          visitantes_admitidos: 0,
          visitas_encerradas: 1,
        });
      await b.infantil.goto(destino);
      await expect(
        b.infantil.getByRole("heading", { name: "Este mundo não está disponível", exact: true }),
      ).toBeVisible();
    } else {
      await b.infantil.getByRole("button", { name: "Somar 1", exact: true }).click();
      await expect(a.infantil.getByLabel("Valor do contador", { exact: true })).toHaveText("1");
      await a.infantil
        .getByRole("button", { name: "Sair por dentro do jogo", exact: true })
        .click();
      await expect(a.infantil).toHaveURL(/\/aparelho$/);
      await expect(
        b.infantil.getByRole("button", { name: "Somar 1", exact: true }),
      ).not.toBeVisible();
      await expect
        .poll(() => observarPresencas(mundo))
        .toMatchObject({
          ativas: 0,
          membros: 1,
          sessoes_abertas: 0,
          visitantes_admitidos: 0,
          visitas_encerradas: 2,
        });
      await a.infantil.goto(`/jogar/teste?mundo=${mundo}`);
      await expect(a.infantil.getByLabel("Valor do contador", { exact: true })).toHaveText("1");
      await b.infantil.goto(destino);
      await expect(
        b.infantil.getByRole("heading", { name: "Este mundo não está disponível", exact: true }),
      ).toBeVisible();
      await a.infantil
        .getByRole("button", { name: "Sair por dentro do jogo", exact: true })
        .click();
      await expect(a.infantil).toHaveURL(/\/aparelho$/);
    }
  }
});
