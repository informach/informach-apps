import { expect, test } from "@playwright/test";
import { novaPessoa } from "./apoio";

test("jogo 2D sem mundos salva, sai e recupera progresso pelo SDK", async ({ browser }) => {
  const pessoa = await novaPessoa(browser, "Progresso");
  const { page } = pessoa;
  const pedidos: string[] = [];
  page.on("request", (request) => pedidos.push(new URL(request.url()).pathname));
  try {
    await page.goto("/jogar/perfil-teste");
    await expect(page.getByRole("button", { name: "Ganhar ponto" })).toBeEnabled();
    await page.getByRole("button", { name: "Ganhar ponto" }).click();
    await expect(page.getByLabel("Pontos salvos")).toHaveText("1");
    await expect(page.getByRole("status", { name: "Estado do progresso" })).toContainText(
      "Progresso salvo",
    );
    await expect(page.getByRole("button", { name: "Salvar e sair" })).toBeEnabled();
    await page.getByRole("button", { name: "Salvar e sair" }).click();
    await expect(page).toHaveURL(/\/estante$/);
    await page.goto("/jogar/perfil-teste");
    await expect(page.getByRole("button", { name: "Ganhar ponto" })).toBeEnabled();
    await expect(page.getByLabel("Pontos salvos")).toHaveText("1");
    expect(pedidos.some((caminho) => caminho === "/api/sdk/v1/dados")).toBe(true);
    expect(pedidos.some((caminho) => caminho.startsWith("/api/sdk/v1/mundos"))).toBe(false);
    expect(pedidos.some((caminho) => /morada|three/i.test(caminho))).toBe(false);
    await page.getByRole("button", { name: "Salvar e sair" }).click();
    await expect(page).toHaveURL(/\/estante$/);
  } finally {
    await pessoa.contexto.close();
  }
});

test("conflito real é preservado e a pessoa escolhe a cópia no navegador", async ({ browser }) => {
  const pessoa = await novaPessoa(browser, "Conflito");
  const { page } = pessoa;
  try {
    const primeiraLeitura = page.waitForRequest(
      (pedido) =>
        new URL(pedido.url()).pathname === "/api/sdk/v1/dados" && pedido.method() === "GET",
    );
    await page.goto("/jogar/perfil-teste");
    const autorizacao = (await primeiraLeitura).headers().authorization;
    if (!autorizacao?.startsWith("Bearer ")) throw new Error("Sessão do SDK ausente");
    await expect(page.getByRole("button", { name: "Ganhar ponto" })).toBeEnabled();
    // O navegador conserva revisão 0. Outra escrita REAL confirma revisão 1.
    const outraEscrita = await pessoa.contexto.request.post("/api/sdk/v1/dados", {
      headers: { authorization: autorizacao },
      data: { operacao: "gravar", chave: "pontos", revisao: 0, conteudo: "Nw==" },
    });
    expect(outraEscrita.status()).toBe(200);
    await page.getByRole("button", { name: "Ganhar ponto" }).click();
    await expect(page.getByRole("status", { name: "Estado do progresso" })).toContainText(
      "Seus pontos foram preservados",
    );
    await expect(page.getByRole("button", { name: "Salvar e sair" })).toBeDisabled();
    await page.getByRole("button", { name: "Usar os pontos deste aparelho" }).click();
    await expect(page.getByRole("status", { name: "Estado do progresso" })).toHaveText(
      "Versão escolhida e salva.",
    );
    await page.getByRole("button", { name: "Salvar e sair" }).click();
    await expect(page).toHaveURL(/\/estante$/);
    await page.goto("/jogar/perfil-teste");
    await expect(page.getByRole("button", { name: "Ganhar ponto" })).toBeEnabled();
    await expect(page.getByLabel("Pontos salvos")).toHaveText("1");
    await page.getByRole("button", { name: "Salvar e sair" }).click();
    await expect(page).toHaveURL(/\/estante$/);
  } finally {
    await pessoa.contexto.close();
  }
});

test("reabrir conserva o conflito e exige escolher a versão que vai continuar", async ({
  browser,
}) => {
  const pessoa = await novaPessoa(browser, "Versões ao voltar");
  const { page } = pessoa;
  try {
    const leitura = page.waitForRequest(
      (pedido) =>
        new URL(pedido.url()).pathname === "/api/sdk/v1/dados" && pedido.method() === "GET",
    );
    await page.goto("/jogar/perfil-teste");
    const autorizacao = (await leitura).headers().authorization;
    if (!autorizacao) throw new Error("Sessão do SDK ausente");
    await expect(page.getByRole("button", { name: "Ganhar ponto" })).toBeEnabled();
    expect(
      (
        await pessoa.contexto.request.post("/api/sdk/v1/dados", {
          headers: { authorization: autorizacao },
          data: { operacao: "gravar", chave: "pontos", revisao: 0, conteudo: "Nw==" },
        })
      ).status(),
    ).toBe(200);
    await page.getByRole("button", { name: "Ganhar ponto" }).click();
    await expect(page.getByRole("status", { name: "Estado do progresso" })).toContainText(
      "Seus pontos foram preservados",
    );
    await page.goto("/estante");
    await page.goto("/jogar/perfil-teste");
    await expect(page.getByRole("button", { name: "Ganhar ponto" })).toBeDisabled();
    await expect(page.getByLabel("Versões preservadas")).toBeVisible();
    await expect(page.getByRole("button", { name: "Usar versão selecionada" })).toBeDisabled();
    await page.getByLabel("Versões preservadas").selectOption({ label: "Versão 1: 1 ponto" });
    await page.getByRole("button", { name: "Usar versão selecionada" }).click();
    await expect(page.getByRole("status", { name: "Estado do progresso" })).toHaveText(
      "Versão escolhida e salva.",
    );
    await expect(page.getByLabel("Pontos salvos")).toHaveText("1");
    await page.getByRole("button", { name: "Salvar e sair" }).click();
    await expect(page).toHaveURL(/\/estante$/);
  } finally {
    await pessoa.contexto.close();
  }
});
