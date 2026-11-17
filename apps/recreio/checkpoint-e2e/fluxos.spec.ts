import { expect, test } from "@playwright/test";
import { comecarVigia, entrarDeNovo, fecharAparelhos, novaPessoa, vigia } from "../e2e/apoio";

test.beforeEach(comecarVigia);
test.afterEach(async () => {
  await fecharAparelhos();
  expect(vigia().violacoes).toEqual([]);
  expect(vigia().errosDePagina).toEqual([]);
});

test("dois aparelhos aguardam o checkpoint real antes de transferir o progresso", async ({
  browser,
}) => {
  const pessoa = await novaPessoa(browser, "Troca");
  const outro = await entrarDeNovo(browser, pessoa);
  const antigo = pessoa.page;
  const novo = outro.page;
  let liberar = () => {};
  const espera = new Promise<void>((resolve) => {
    liberar = resolve;
  });
  await antigo.route("**/api/sdk/v1/sessao/checkpoint", async (rota) => {
    await espera;
    await rota.continue();
  });
  const leitura = antigo.waitForRequest((r) => new URL(r.url()).pathname === "/api/sdk/v1/dados");
  await antigo.goto("/jogar/perfil-teste");
  const autorizacao = (await leitura).headers().authorization;
  if (!autorizacao) throw new Error("Sessão do jogo ausente");
  try {
    await expect(antigo.getByRole("button", { name: "Ganhar ponto" })).toBeEnabled();
    await antigo.getByRole("button", { name: "Ganhar ponto" }).click();
    await expect(antigo.getByRole("status", { name: "Estado do progresso" })).toContainText(
      "Progresso salvo",
    );
    await novo.goto("/jogar/perfil-teste");
    await expect(
      novo.getByRole("heading", { name: "Você já está jogando em outro lugar" }),
    ).toBeVisible();
    const ack = antigo.waitForRequest(
      (r) => new URL(r.url()).pathname === "/api/sdk/v1/sessao/checkpoint",
    );
    await novo.getByRole("button", { name: "Continuar aqui" }).click();
    await ack;
    await expect(
      novo.getByRole("heading", { name: "Aguardando o outro aparelho salvar…" }),
    ).toBeVisible();
    await expect(novo.getByLabel("Pontos salvos")).toHaveCount(0);
    await expect(
      antigo.getByRole("button", { name: "Ganhar ponto", includeHidden: true }),
    ).toBeDisabled();
    liberar();
    await expect(novo.getByRole("button", { name: "Ganhar ponto" })).toBeEnabled();
    await expect(novo.getByLabel("Pontos salvos")).toHaveText("1");
    await expect(
      antigo.getByRole("heading", { name: "Você continuou o jogo em outro lugar" }),
    ).toBeVisible();
    const recusada = await pessoa.contexto.request.post("/api/sdk/v1/dados", {
      headers: { authorization: autorizacao },
      data: { operacao: "gravar", chave: "pontos", revisao: 2, conteudo: "OQ==" },
    });
    expect(recusada.status()).toBe(403);
    await novo.getByRole("button", { name: "Salvar e sair" }).click();
    await expect(novo).toHaveURL(/\/estante$/);
  } finally {
    liberar();
  }
});

test("conflito recusa a troca; resolver e pedir novamente conserva a escolha", async ({
  browser,
}) => {
  const pessoa = await novaPessoa(browser, "Conflito da troca");
  const outro = await entrarDeNovo(browser, pessoa);
  const antigo = pessoa.page;
  const novo = outro.page;
  const leitura = antigo.waitForRequest((r) => new URL(r.url()).pathname === "/api/sdk/v1/dados");
  await antigo.goto("/jogar/perfil-teste");
  const autorizacao = (await leitura).headers().authorization;
  if (!autorizacao) throw new Error("Sessão do jogo ausente");
  await expect(antigo.getByRole("button", { name: "Ganhar ponto" })).toBeEnabled();
  const externa = await pessoa.contexto.request.post("/api/sdk/v1/dados", {
    headers: { authorization: autorizacao },
    data: { operacao: "gravar", chave: "pontos", revisao: 0, conteudo: "Nw==" },
  });
  expect(externa.status()).toBe(200);
  await antigo.getByRole("button", { name: "Ganhar ponto" }).click();
  await expect(antigo.getByRole("status", { name: "Estado do progresso" })).toContainText(
    "Seus pontos foram preservados",
  );
  await novo.goto("/jogar/perfil-teste");
  await novo.getByRole("button", { name: "Continuar aqui" }).click();
  await expect(novo.getByRole("heading", { name: "A troca não foi confirmada" })).toBeVisible();
  await expect(novo.getByLabel("Pontos salvos")).toHaveCount(0);
  await antigo.getByRole("button", { name: "Usar os pontos deste aparelho" }).click();
  await expect(antigo.getByRole("status", { name: "Estado do progresso" })).toContainText(
    "Versão escolhida e salva",
  );
  await novo.getByRole("button", { name: "Tentar de novo" }).click();
  await novo.getByRole("button", { name: "Continuar aqui" }).click();
  await expect(novo.getByRole("button", { name: "Ganhar ponto" })).toBeEnabled();
  await expect(novo.getByLabel("Pontos salvos")).toHaveText("1");
  await novo.getByRole("button", { name: "Salvar e sair" }).click();
  await expect(novo).toHaveURL(/\/estante$/);
});

test("resposta do ACK perdida depois do commit não impede a troca já confirmada", async ({
  browser,
}) => {
  const pessoa = await novaPessoa(browser, "ACK perdido");
  const outro = await entrarDeNovo(browser, pessoa);
  const antigo = pessoa.page;
  const novo = outro.page;
  let descartadas = 0;
  await antigo.route("**/api/sdk/v1/sessao/checkpoint", async (rota) => {
    const resposta = await rota.fetch();
    expect(resposta.status()).toBe(200);
    descartadas++;
    await rota.abort("failed");
  });
  await antigo.goto("/jogar/perfil-teste");
  await expect(antigo.getByRole("button", { name: "Ganhar ponto" })).toBeEnabled();
  await antigo.getByRole("button", { name: "Ganhar ponto" }).click();
  await expect(antigo.getByRole("status", { name: "Estado do progresso" })).toContainText(
    "Progresso salvo",
  );
  await novo.goto("/jogar/perfil-teste");
  await novo.getByRole("button", { name: "Continuar aqui" }).click();
  await expect(novo.getByRole("button", { name: "Ganhar ponto" })).toBeEnabled();
  await expect(novo.getByLabel("Pontos salvos")).toHaveText("1");
  expect(descartadas).toBe(1);
  await expect(
    antigo.getByRole("heading", { name: "Você continuou o jogo em outro lugar" }),
  ).toBeVisible();
  await novo.getByRole("button", { name: "Salvar e sair" }).click();
  await expect(novo).toHaveURL(/\/estante$/);
});
