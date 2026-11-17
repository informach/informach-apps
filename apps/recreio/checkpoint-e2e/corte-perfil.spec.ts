import { VersoesDeDadosSchema } from "@informach/recreio/contrato";
import { expect, test } from "@playwright/test";
import { comecarVigia, fecharAparelhos, novaPessoa, vigia } from "../e2e/apoio";

test.beforeEach(comecarVigia);
test.afterEach(async () => {
  await fecharAparelhos();
  expect(vigia().violacoes).toEqual([]);
  expect(vigia().errosDePagina).toEqual([]);
});

test("corte conserva o módulo e recupera respostas perdidas antes de confirmar e reabrir", async ({
  browser,
}) => {
  const pessoa = await novaPessoa(browser, "Corte e progresso");
  const { page } = pessoa;
  let liberar = () => {};
  const espera = new Promise<void>((resolve) => {
    liberar = resolve;
  });
  let normalPerdida = false;
  let finais = 0;
  await page.route("**/api/sdk/v1/dados", async (rota) => {
    if (rota.request().method() !== "POST" || normalPerdida) return rota.continue();
    const resposta = await rota.fetch();
    expect(resposta.status()).toBe(200);
    normalPerdida = true;
    await rota.abort("failed");
  });
  await page.route("**/api/sdk/v1/sessao/salvamento", async (rota) => {
    if (rota.request().method() !== "POST") return rota.continue();
    finais++;
    if (finais !== 1) return rota.continue();
    await espera;
    const resposta = await rota.fetch();
    expect(resposta.status()).toBe(200);
    await rota.abort("failed");
  });
  try {
    const leitura = page.waitForRequest(
      (pedido) =>
        new URL(pedido.url()).pathname === "/api/sdk/v1/dados" && pedido.method() === "GET",
    );
    await page.goto("/jogar/perfil-teste");
    const autorizacao = (await leitura).headers().authorization;
    if (!autorizacao) throw new Error("Sessão do SDK ausente");
    await expect(page.getByRole("button", { name: "Ganhar ponto" })).toBeEnabled();
    await page.getByRole("button", { name: "Ganhar ponto" }).click();
    await expect(page.getByRole("status", { name: "Estado do progresso" })).toContainText(
      "Não foi possível salvar",
    );
    expect(normalPerdida).toBe(true);
    expect(
      (
        await pessoa.contexto.request.post("/api/sdk/v1/sessao/sair", {
          headers: { authorization: autorizacao },
        })
      ).status(),
    ).toBe(200);
    await expect.poll(() => finais).toBe(1);
    await expect(page.getByRole("heading", { name: "Salvando antes de encerrar…" })).toBeVisible();
    await expect(page.getByLabel("Pontos salvos")).toHaveCount(1);
    await expect(page.getByText("Progresso salvo e confirmado.")).toHaveCount(0);
    liberar();
    await expect(page.getByRole("heading", { name: "Você saiu do jogo" })).toBeVisible();
    await expect(page.getByText("Progresso salvo e confirmado.")).toBeVisible();
    expect(finais).toBe(2);
    await expect(page.getByLabel("Pontos salvos")).toHaveCount(0);
    await page.getByRole("link", { name: "Voltar à estante" }).click();
    await expect(page).toHaveURL(/\/estante$/);
    const recarregada = page.waitForRequest(
      (pedido) =>
        new URL(pedido.url()).pathname === "/api/sdk/v1/dados" && pedido.method() === "GET",
    );
    await page.goto("/jogar/perfil-teste");
    const novaAutorizacao = (await recarregada).headers().authorization;
    if (!novaAutorizacao) throw new Error("Sessão reaberta ausente");
    await expect(page.getByRole("button", { name: "Ganhar ponto" })).toBeEnabled();
    // Ler pela nova autorização, após a navegação. Corpos de respostas de um
    // documento anterior não sobrevivem à navegação no protocolo do Chromium.
    const atual = await pessoa.contexto.request.get("/api/sdk/v1/dados?chave=pontos&historico=1", {
      headers: { authorization: novaAutorizacao },
    });
    expect(atual.status()).toBe(200);
    const dados = VersoesDeDadosSchema.parse(await atual.json());
    expect(dados.revisaoAtual).toBe(1);
    expect(dados.versoes.filter((versao) => versao.estado === "accepted")).toHaveLength(1);
    await expect(page.getByLabel("Pontos salvos")).toHaveText("1");
    await expect(page.getByRole("button", { name: "Salvar e sair" })).toBeEnabled();
    await page.getByRole("button", { name: "Salvar e sair" }).click();
    await expect(page).toHaveURL(/\/estante$/);
  } finally {
    liberar();
    await page.unrouteAll({ behavior: "wait" });
    await pessoa.contexto.close();
  }
});
