import { expect, type Page, test } from "@playwright/test";
import {
  capturarJsonDoPortal,
  comecarVigia,
  convidar,
  criarMundo,
  fecharAparelhos,
  hidratado,
  novaPessoa,
  tela,
  vigia,
} from "./apoio";
import { familiaComAparelho, mundoNoAparelho } from "./familia-apoio";
import { observarPresencas } from "./presencas-apoio";
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
function sinal() {
  let concluir: () => void = () => {
    throw new Error("Sinal não preparado");
  };
  const promessa = new Promise<void>((resolve) => {
    concluir = resolve;
  });
  return { promessa, concluir: () => concluir() };
}

test("gestão nativa aprova visita de um membro sem confundir anfitrião com responsável pelo mundo", async ({
  browser,
}) => {
  const dono = await novaPessoa(browser, "Sol da visita"),
    anfitriao = await novaPessoa(browser, "Mar recebe visita"),
    visitante = await novaPessoa(browser, "Rio visita");
  const mundo = await criarMundo(dono.page, "Jogo de teste", "Casa de encontros do Sol");
  await convidar(dono.page, anfitriao.page, mundo);
  await visitante.page.goto("/amigos");
  const gerar = visitante.page.getByRole("button", { name: "Gerar código", exact: true });
  await hidratado(gerar);
  await gerar.click();
  const codigo = await visitante.page.getByLabel("Código de amizade", { exact: true }).innerText();
  await anfitriao.page.goto("/amigos");
  const campo = anfitriao.page.getByLabel("Código que você recebeu", { exact: true });
  await hidratado(campo);
  await campo.fill(codigo);
  await anfitriao.page.getByRole("button", { name: "Enviar pedido", exact: true }).click();
  await expect(campo).toHaveValue("");
  await visitante.page.reload();
  const aceitarAmizade = visitante.page.getByRole("button", {
    name: "Aceitar pedido",
    exact: true,
  });
  await hidratado(aceitarAmizade);
  await aceitarAmizade.click();
  await expect(visitante.page.getByText("Amizade confirmada", { exact: true })).toBeVisible();
  const mundoAnterior = await criarMundo(visitante.page, "Jogo de teste", "Casa guardada do Rio");
  await contador.iniciar();
  await anfitriao.page.goto(`/jogar/teste?mundo=${mundo}`);
  await expect(anfitriao.page.getByLabel("Valor do contador", { exact: true })).toHaveText("0");
  await visitante.page.goto(`/jogar/teste?mundo=${mundoAnterior}`);
  await expect(visitante.page.getByLabel("Valor do contador", { exact: true })).toHaveText("0");
  for (let soma = 1; soma <= 2; soma++) {
    await visitante.page.getByRole("button", { name: "Somar 1", exact: true }).click();
    await expect(visitante.page.getByLabel("Valor do contador", { exact: true })).toHaveText(
      String(soma),
    );
  }
  await expect.poll(() => observarPresencas(mundo)).toMatchObject({ ativas: 1, membros: 2 });
  await anfitriao.page.getByRole("button", { name: "Amigos e proteção", exact: true }).click();
  const painel = anfitriao.page.getByRole("dialog", { name: "Amigos e proteção", exact: true });
  await painel.getByRole("button", { name: "Convidar para visitar", exact: true }).click();
  await expect(
    painel.getByRole("button", { name: "Convite de visita registrado", exact: true }),
  ).toBeVisible();
  await painel.getByRole("button", { name: "Voltar à partida", exact: true }).click();
  await visitante.page.getByRole("button", { name: "Amigos e proteção", exact: true }).click();
  const painelVisitante = visitante.page.getByRole("dialog", {
      name: "Amigos e proteção",
      exact: true,
    }),
    caixa = painelVisitante.getByRole("region", {
      name: "Visitas com amigos na partida",
      exact: true,
    });
  await caixa.getByRole("button", { name: "Conferir visita", exact: true }).click();
  await expect(caixa.getByRole("button", { name: "Aceitar visita", exact: true })).toBeDisabled();
  await dono.page.goto(`/conta/mundos/${mundo}/gestao`);
  await dono.page.getByRole("link", { name: "Conferir visitas ao mundo", exact: true }).click();
  await dono.page.getByRole("link", { name: "Conferir convite de visita", exact: true }).click();
  await expect(
    dono.page.getByRole("heading", { name: "Casa de encontros do Sol", exact: true }),
  ).toBeVisible();
  const aprovar = dono.page.getByRole("checkbox", {
    name: "Li o convite e autorizo a visita neste mundo.",
    exact: true,
  });
  await hidratado(aprovar);
  await dono.page.setViewportSize({ width: 390, height: 844 });
  expect(await dono.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await tela(dono.page, "visitas-gestao-mobile", { paginaInteira: true });
  await aprovar.check();
  await dono.page.getByRole("button", { name: "Aprovar visita", exact: true }).click();
  await expect(dono.page.getByRole("status")).toContainText("Sua aprovação foi registrada");
  await dono.page.getByRole("link", { name: "Voltar e conferir situação", exact: true }).click();
  await expect(
    dono.page.getByText("Nenhuma visita aguarda sua decisão nesta página.", { exact: true }),
  ).toBeVisible();
  await caixa.getByRole("button", { name: "Atualizar visitas", exact: true }).click();
  await caixa.getByRole("button", { name: "Conferir visita", exact: true }).click();
  await caixa.getByRole("button", { name: "Aceitar visita", exact: true }).click();
  await expect(caixa.getByRole("status")).toContainText("Convite aceito");
  await caixa.getByRole("button", { name: "Conferir visita", exact: true }).click();
  const visitar = caixa.getByRole("button", { name: "Salvar e visitar", exact: true });
  await expect(visitar).toBeEnabled();
  await visitante.page.setViewportSize({ width: 390, height: 844 });
  expect(
    await visitante.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true);
  await tela(visitante.page, "visitas-partida-mobile", { paginaInteira: true });
  const chegou = sinal(),
    liberar = sinal();
  let novasSessoes = 0;
  visitante.page.on("request", (r) => {
    if (new URL(r.url()).pathname === "/api/sdk/v1/sessao" && r.method() === "POST") novasSessoes++;
  });
  // Retém os bytes reais da primeira consulta do recibo, sem alterar corpo/status
  // ou repetir pedidos. A barreira é liberada por fato, sem espera arbitrária.
  const recibo = capturarJsonDoPortal(
    visitante.page.context(),
    "/api/sdk/v1/sessao/salvamento",
    "GET",
    async () => {
      chegou.concluir();
      await liberar.promessa;
    },
  );
  const respostaPendente = Promise.race([
    chegou.promessa,
    recibo.then(() => {
      throw new Error("Recibo entregue antes da barreira");
    }),
  ]);
  try {
    await visitar.click();
    await respostaPendente;
    expect(new URL(visitante.page.url()).pathname + new URL(visitante.page.url()).search).toBe(
      `/jogar/teste?mundo=${mundoAnterior}`,
    );
    expect(novasSessoes).toBe(0);
  } finally {
    liberar.concluir();
  }
  expect((await recibo).status).toBe(200);
  await expect(visitante.page).toHaveURL(
    new RegExp(`/jogar/teste\\?mundo=${mundo}&visita=[0-9a-f-]{36}$`),
  );
  await expect(visitante.page.getByLabel("Valor do contador", { exact: true })).toHaveText("0");
  await expect
    .poll(() => observarPresencas(mundo))
    .toMatchObject({ ativas: 1, membros: 2, visitantes_admitidos: 1 });
  await anfitriao.page
    .getByRole("button", { name: "Sair por dentro do jogo", exact: true })
    .click();
  await expect(anfitriao.page).toHaveURL(/\/estante$/);
  await expect(
    visitante.page.getByRole("button", { name: "Somar 1", exact: true }),
  ).not.toBeVisible();
  await expect
    .poll(() => observarPresencas(mundo))
    .toMatchObject({
      ativas: 0,
      membros: 2,
      sessoes_abertas: 0,
      visitantes_admitidos: 0,
      visitas_encerradas: 1,
    });
  await visitante.page.goto(`/jogar/teste?mundo=${mundoAnterior}`);
  await expect(visitante.page.getByLabel("Valor do contador", { exact: true })).toHaveText("2");
  await visitante.page
    .getByRole("button", { name: "Sair por dentro do jogo", exact: true })
    .click();
  await expect(visitante.page).toHaveURL(/\/estante$/);
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
