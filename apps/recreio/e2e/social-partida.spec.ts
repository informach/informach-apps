import { expect, type Page, test } from "@playwright/test";
import postgres from "postgres";
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
function sinal() {
  let concluir: () => void = () => {
    throw new Error("Sinal não preparado");
  };
  const promessa = new Promise<void>((resolve) => {
    concluir = resolve;
  });
  return { promessa, concluir: () => concluir() };
}
/** Caso já respondido como precondição; o atendimento real tem jornada própria com TOTP. */
async function respostaParaRevisao(protocolo: string) {
  const url = new URL(process.env.DATABASE_URL ?? "");
  if (
    process.env.RECREIO_ISOLATED_TEST !== "1" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    !/^\/recreio_review_[a-f0-9]{32}$/.test(url.pathname)
  )
    throw new Error("Fixture só no banco descartável");
  const db = postgres(url.toString(), { max: 1 });
  try {
    const rows = await db`update recreio.safety_reports set state='resolvida',revision=revision+1,
      decision='sem_elementos',updated_at=clock_timestamp() where id=${protocolo} returning id`;
    expect(rows).toHaveLength(1);
  } finally {
    await db.end();
  }
}
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

test("convite pelo portal é conferido e aceito fora da partida sem abrir uma sessão de jogo", async ({
  browser,
}) => {
  const a = await novaPessoa(browser, "Sol convite portal"),
    b = await novaPessoa(browser, "Mar convite portal");
  await amizade(a.page, b.page);
  const mundo = await criarMundo(a.page, "Jogo de teste", "Casa convidada pelo portal");
  let sessoes = 0;
  for (const p of [a.page, b.page])
    p.on("request", (r) => {
      if (new URL(r.url()).pathname === "/api/sdk/v1/sessao" && r.method() === "POST") sessoes++;
    });
  await a.page.goto("/amigos");
  await a.page.getByRole("link", { name: "Convidar para um mundo", exact: true }).click();
  await expect(
    a.page.getByRole("heading", { name: "Convite para Mar convite portal", exact: true }),
  ).toBeVisible();
  const escolher = a.page.getByRole("combobox", { name: "Escolha um mundo", exact: true });
  await hidratado(escolher);
  await escolher.selectOption(mundo);
  await a.page.getByRole("button", { name: "Convidar para este mundo", exact: true }).click();
  await expect(
    a.page.getByText("Convite registrado. Confira as confirmações em Convites de mundos.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(escolher).toBeDisabled();
  await b.page.goto("/amigos");
  await b.page.getByRole("link", { name: "Convites de mundos", exact: true }).click();
  const caixa = b.page.getByRole("region", { name: "Convites de mundos", exact: true });
  await expect(caixa.getByText("Convite recebido", { exact: true })).toBeVisible();
  await caixa.getByRole("button", { name: "Conferir convite", exact: true }).click();
  const detalhe = caixa.getByRole("region", { name: "Participação a confirmar", exact: true });
  await expect(
    detalhe.getByRole("heading", { name: "Casa convidada pelo portal", exact: true }),
  ).toBeVisible();
  await b.page.setViewportSize({ width: 390, height: 844 });
  await detalhe.scrollIntoViewIfNeeded();
  expect(
    await b.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
  ).toBe(true);
  await tela(b.page, "convites-portal-mobile", { paginaInteira: true });
  await detalhe.getByRole("button", { name: "Aceitar participação", exact: true }).click();
  await expect(
    caixa.getByText("Participação confirmada. O mundo está na sua estante.", { exact: true }),
  ).toBeVisible();
  await expect(b.page).toHaveURL(/\/convites$/);
  expect(sessoes).toBe(0);
  await b.page.getByRole("link", { name: "Voltar para jogar", exact: true }).click();
  await expect(
    b.page.getByRole("heading", { name: "Casa convidada pelo portal", exact: true }),
  ).toBeVisible();
});

test("convite dirigido atravessa dois mundos sem sair da partida e recupera o ACK com painel fechado", async ({
  browser,
}) => {
  const a = await novaPessoa(browser, "Sol anfitrião"),
    b = await novaPessoa(browser, "Mar convidado");
  await amizade(a.page, b.page);
  const mundoA = await criarMundo(a.page, "Jogo de teste", "Casa do convite dirigido"),
    mundoB = await criarMundo(b.page, "Jogo de teste", "Casa de quem recebeu");
  await contador.iniciar();
  await a.page.goto(`/jogar/teste?mundo=${mundoA}`);
  await b.page.goto(`/jogar/teste?mundo=${mundoB}`);
  await expect(a.page.getByLabel("Valor do contador", { exact: true })).toHaveText("0");
  await expect(b.page.getByLabel("Valor do contador", { exact: true })).toHaveText("0");
  await a.page.getByRole("button", { name: "Somar 1", exact: true }).click();
  await expect(a.page.getByLabel("Valor do contador", { exact: true })).toHaveText("1");
  await a.page.getByRole("button", { name: "Amigos e proteção", exact: true }).click();
  const painelA = a.page.getByRole("dialog", { name: "Amigos e proteção", exact: true });
  const conviteA = painelA.getByRole("region", {
    name: "Convites de mundos na partida",
    exact: true,
  });
  await expect(conviteA.getByText("Nenhum convite nesta página.", { exact: true })).toBeVisible();
  const confirmado = sinal(),
    soltar = sinal();
  let enviado = false,
    getsDepois = 0;
  a.page.on("request", (p) => {
    if (
      enviado &&
      p.method() === "GET" &&
      new URL(p.url()).pathname === "/api/sdk/v1/convites-dirigidos"
    )
      getsDepois++;
  });
  await a.page.route("**/api/sdk/v1/convites-dirigidos", async (rota) => {
    const resposta = await rota.fetch();
    const corpo: unknown =
      rota.request().method() === "POST" ? rota.request().postDataJSON() : null;
    if (corpo && typeof corpo === "object" && "operacao" in corpo && corpo.operacao === "emitir") {
      confirmado.concluir();
      await soltar.promessa;
    }
    await rota.fulfill({ response: resposta });
  });
  try {
    await painelA.getByRole("button", { name: "Convidar para este mundo", exact: true }).click();
    await confirmado.promessa;
    await painelA.getByRole("button", { name: "Voltar à partida", exact: true }).click();
    enviado = true;
    soltar.concluir();
    await a.page.getByRole("button", { name: "Somar 1", exact: true }).click();
    await expect(a.page.getByLabel("Valor do contador", { exact: true })).toHaveText("2");
    expect(getsDepois).toBe(0);
  } finally {
    soltar.concluir();
    await a.page.unroute("**/api/sdk/v1/convites-dirigidos");
  }
  let saidas = 0;
  b.page.on("request", (p) => {
    if (new URL(p.url()).pathname === "/api/sdk/v1/sessao/sair") saidas++;
  });
  await b.page.getByRole("button", { name: "Amigos e proteção", exact: true }).click();
  const painelB = b.page.getByRole("dialog", { name: "Amigos e proteção", exact: true }),
    convitesB = painelB.getByRole("region", { name: "Convites de mundos na partida", exact: true });
  await expect(convitesB.getByText("Convite recebido", { exact: true })).toBeVisible();
  await convitesB.getByRole("button", { name: "Conferir convite", exact: true }).click();
  const detalhe = convitesB.getByRole("region", { name: "Participação a confirmar", exact: true });
  await expect(
    detalhe.getByRole("heading", { name: "Casa do convite dirigido", exact: true }),
  ).toBeVisible();
  await expect(
    detalhe.getByRole("button", { name: "Aceitar participação", exact: true }),
  ).toBeEnabled();
  await b.page.setViewportSize({ width: 390, height: 844 });
  await detalhe.scrollIntoViewIfNeeded();
  expect(await painelB.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  await tela(b.page, "convites-dirigidos-partida-mobile");
  await detalhe.getByRole("button", { name: "Aceitar participação", exact: true }).click();
  await expect(convitesB.getByText(/Participação confirmada/)).toBeVisible();
  expect(saidas).toBe(0);
  await expect(b.page).toHaveURL(`/jogar/teste?mundo=${mundoB}`);
  await expect(b.page.getByLabel("Valor do contador", { exact: true })).toHaveText("0");
  await painelB.getByRole("button", { name: "Voltar à partida", exact: true }).click();
  await b.page.getByRole("button", { name: "Sair por dentro do jogo", exact: true }).click();
  await expect(b.page).toHaveURL(/\/estante$/);
  await b.page.goto(`/jogar/teste?mundo=${mundoA}`);
  await expect(b.page.getByLabel("Valor do contador", { exact: true })).toHaveText("2");
  await b.page.getByRole("button", { name: "Somar 1", exact: true }).click();
  await expect(a.page.getByLabel("Valor do contador", { exact: true })).toHaveText("3");
  await b.page.getByRole("button", { name: "Sair por dentro do jogo", exact: true }).click();
  await a.page.getByRole("button", { name: "Sair por dentro do jogo", exact: true }).click();
  await expect(a.page).toHaveURL(/\/estante$/);
});

test("participante sem amizade recebe proteção pelo portal e dentro da partida", async ({
  browser,
}) => {
  const a = await novaPessoa(browser, "Sol participante"),
    b = await novaPessoa(browser, "Mar participante");
  const mundo = await criarMundo(a.page, "Jogo de teste", "Casa dos participantes");
  await convidar(a.page, b.page, mundo);
  await a.page.getByRole("link", { name: "Participantes e proteção", exact: true }).click();
  await expect(a.page).toHaveURL(`/participantes/${mundo}`);
  await expect(
    a.page.getByRole("heading", { name: "Mar participante", exact: true }),
  ).toBeVisible();
  await expect(a.page.getByText("Amizade confirmada", { exact: true })).toHaveCount(0);
  await a.page.getByRole("button", { name: "Denunciar contato", exact: true }).click();
  await a.page
    .getByRole("combobox", { name: "O que aconteceu?", exact: true })
    .selectOption("outro");
  await a.page.getByRole("button", { name: "Enviar denúncia", exact: true }).click();
  await expect(a.page.getByLabel("Protocolo da denúncia", { exact: true })).toBeVisible();
  await a.page.setViewportSize({ width: 390, height: 844 });
  expect(await a.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await tela(a.page, "participantes-protecao-mobile", { paginaInteira: true });
  await contador.iniciar();
  await a.page.goto(`/jogar/teste?mundo=${mundo}`);
  await b.page.goto(`/jogar/teste?mundo=${mundo}`);
  await expect(a.page.getByLabel("Valor do contador", { exact: true })).toHaveText("0");
  await a.page.getByRole("button", { name: "Amigos e proteção", exact: true }).click();
  const painel = a.page.getByRole("dialog", { name: "Amigos e proteção", exact: true });
  const participantes = painel.getByRole("region", {
    name: "Participantes deste mundo",
    exact: true,
  });
  await expect(
    participantes.getByRole("heading", { name: "Mar participante", exact: true }),
  ).toBeVisible();
  await participantes.getByRole("button", { name: "Silenciar", exact: true }).click();
  await expect(participantes.getByText("Silenciado", { exact: true })).toBeVisible();
  await participantes.getByRole("button", { name: "Bloquear", exact: true }).click();
  await expect(participantes.getByText("Bloqueado por você", { exact: true })).toBeVisible();
  await b.page.getByRole("button", { name: "Somar 1", exact: true }).click();
  await expect(a.page.getByLabel("Valor do contador", { exact: true })).toHaveText("1");
  await painel.getByRole("button", { name: "Voltar à partida", exact: true }).click();
  await a.page.getByRole("button", { name: "Sair por dentro do jogo", exact: true }).click();
  await b.page.getByRole("button", { name: "Sair por dentro do jogo", exact: true }).click();
  await expect(a.page).toHaveURL(/\/estante$/);
  await a.page.goto(`/mundos/${mundo}`);
  await expect(
    a.page.getByRole("heading", { name: "Casa dos participantes", exact: true }),
  ).toBeVisible();
  await expect(a.page.getByText("Mar participante", { exact: true })).toBeVisible();
});

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
  await painel
    .getByRole("combobox", { name: "O que aconteceu?", exact: true })
    .selectOption("outro");
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
  const retorno = painel.getByRole("button", { name: "Voltar à partida", exact: true });
  const limites = await painel.boundingBox(),
    botao = await retorno.boundingBox();
  if (!limites || !botao) throw new Error("Controles do diálogo não apareceram");
  expect(botao.y).toBeGreaterThanOrEqual(limites.y);
  expect(botao.y + botao.height).toBeLessThanOrEqual(limites.y + limites.height);
  await tela(a.page, "host-social-mobile-cuidados");
  await test.step(
    "fechar durante confirmação de revisão não inicia leitura posterior",
    async () => {
      await respostaParaRevisao(protocolo);
      await painel.getByRole("button", { name: "Consultar meus protocolos", exact: true }).click();
      const rever = painel.getByRole("button", { name: "Pedir revisão da resposta", exact: true });
      await expect(rever).toBeVisible();
      const confirmada = sinal(),
        liberar = sinal(),
        entregue = sinal();
      let leituras = 0;
      await a.contexto.route("**/api/sdk/v1/denuncias", async (rota) => {
        if (rota.request().method() !== "POST") {
          leituras++;
          await rota.fallback();
          return;
        }
        const resposta = await rota.fetch({ maxRetries: 0, maxRedirects: 0 });
        expect(resposta.status()).toBe(200);
        confirmada.concluir();
        await liberar.promessa;
        await rota.fulfill({ response: resposta });
        entregue.concluir();
      });
      try {
        await rever.click();
        await confirmada.promessa;
        await retorno.click();
        await expect(painel).not.toBeVisible();
        liberar.concluir();
        await entregue.promessa;
        await a.page.evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
            ),
        );
        expect(leituras).toBe(0);
        await a.page.getByRole("button", { name: "Amigos e proteção", exact: true }).click();
        await painel
          .getByRole("button", { name: "Consultar meus protocolos", exact: true })
          .click();
        await expect(
          painel.getByRole("heading", { name: "Revisão recebida", exact: true }),
        ).toBeVisible();
        expect(leituras).toBe(1);
        await retorno.click();
      } finally {
        liberar.concluir();
      }
    },
    { timeout: 30000 },
  );
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
