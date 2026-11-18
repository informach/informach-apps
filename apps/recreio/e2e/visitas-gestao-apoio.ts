import { type Browser, expect } from "@playwright/test";
import { capturarJsonDoPortal, convidar, criarMundo, hidratado, novaPessoa, tela } from "./apoio";
import { observarPresencas } from "./presencas-apoio";
import type { servidorDoContador } from "./servidor-apoio";

function sinal() {
  let concluir: () => void = () => {
    throw new Error("Sinal não preparado");
  };
  const promessa = new Promise<void>((resolve) => {
    concluir = resolve;
  });
  return { promessa, concluir: () => concluir() };
}

export async function provarVisitaNaGestao(
  browser: Browser,
  contador: ReturnType<typeof servidorDoContador>,
  coordenado: boolean,
) {
  if ((process.env.RECREIO_CHECKPOINT_MODE === "on") !== coordenado)
    throw new Error("A jornada exige o modo real de salvamento correspondente");
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
  if (coordenado) {
    await expect(visitar).toBeEnabled();
    await visitante.page.setViewportSize({ width: 390, height: 844 });
    expect(
      await visitante.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
    await visitar.scrollIntoViewIfNeeded();
    await tela(visitante.page, "visitas-partida-mobile", { paginaInteira: true });
    const chegou = sinal(),
      liberar = sinal();
    let novasSessoes = 0;
    visitante.page.on("request", (r) => {
      if (new URL(r.url()).pathname === "/api/sdk/v1/sessao" && r.method() === "POST")
        novasSessoes++;
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
  } else {
    await expect(visitar).toHaveCount(0);
    const orientacao = caixa.getByText(
      "Saia pelo próprio jogo para salvar. Depois abra Visitas com amigos pelo portal.",
      { exact: true },
    );
    await expect(orientacao).toBeVisible();
    await visitante.page.setViewportSize({ width: 390, height: 844 });
    expect(
      await visitante.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
    await orientacao.scrollIntoViewIfNeeded();
    await tela(visitante.page, "visitas-partida-manual-mobile", { paginaInteira: true });
    await painelVisitante.getByRole("button", { name: "Voltar à partida", exact: true }).click();
    await visitante.page
      .getByRole("button", { name: "Sair por dentro do jogo", exact: true })
      .click();
    await expect(visitante.page).toHaveURL(/\/estante$/);
    await visitante.page.goto("/visitas");
    await visitante.page.getByRole("link", { name: "Conferir visita", exact: true }).click();
    await expect(visitante.page).toHaveURL(/\/visitas\/[0-9a-f-]{36}$/);
    await visitante.page
      .getByRole("link", { name: "Conferir entrada no mundo", exact: true })
      .click();
  }
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
}
