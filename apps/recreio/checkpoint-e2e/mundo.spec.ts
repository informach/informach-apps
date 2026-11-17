import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  comecarVigia,
  convidar,
  criarMundo,
  entrarDeNovo,
  fecharAparelhos,
  novaPessoa,
  vigia,
} from "../e2e/apoio";
import { servidorDoContador } from "../e2e/servidor-apoio";

const servidor = servidorDoContador();
test.beforeEach(() => {
  comecarVigia();
  servidor.limparLog();
});
test.afterEach(async () => {
  await fecharAparelhos();
  await servidor.parar();
  if (test.info().status !== test.info().expectedStatus)
    await test
      .info()
      .attach("servidor-do-contador.log", { body: servidor.log(), contentType: "text/plain" });
  expect(vigia().violacoes).toEqual([]);
  expect(vigia().errosDePagina).toEqual([]);
});

test("a instância confirma a fotografia antes da troca e preserva os outros membros", async ({
  browser,
}) => {
  const pessoa = await novaPessoa(browser, "Morador da troca");
  const visita = await novaPessoa(browser, "Outro morador");
  const mundo = await criarMundo(pessoa.page, "Jogo de teste", "Mundo da troca");
  await convidar(pessoa.page, visita.page, mundo);
  const outro = await entrarDeNovo(browser, pessoa);
  await servidor.iniciar();
  let liberar = () => {};
  const espera = new Promise<void>((resolve) => {
    liberar = resolve;
  });
  let checkpointRecebido = false;
  let comandoAntigoEnviado = false;
  await pessoa.page.routeWebSocket("**", (socket) => {
    const real = socket.connectToServer();
    socket.onMessage(async (mensagem) => {
      const quadro: unknown = JSON.parse(String(mensagem));
      if (
        typeof quadro === "object" &&
        quadro !== null &&
        "t" in quadro &&
        quadro.t === "checkpoint"
      ) {
        checkpointRecebido = true;
        await espera;
      }
      real.send(mensagem);
    });
    real.onMessage((mensagem) => {
      const quadro: unknown = JSON.parse(String(mensagem));
      if (
        typeof quadro === "object" &&
        quadro !== null &&
        "t" in quadro &&
        quadro.t === "checkpoint" &&
        "confirmado" in quadro &&
        quadro.confirmado === true
      ) {
        // O comando chega depois da barreira real, pela conexão antiga ainda aberta.
        comandoAntigoEnviado = true;
        real.send(JSON.stringify({ t: "somar", id: randomUUID() }));
      }
      socket.send(mensagem);
    });
  });
  const endereco = `/jogar/teste?mundo=${mundo}`;
  try {
    await pessoa.page.goto(endereco);
    await pessoa.page.getByRole("button", { name: "Somar 1" }).click();
    await expect(pessoa.page.getByLabel("Valor do contador")).toHaveText("1");
    await visita.page.goto(endereco);
    await visita.page.getByRole("button", { name: "Somar 1" }).click();
    await expect(pessoa.page.getByLabel("Valor do contador")).toHaveText("2");
    await outro.page.goto(endereco);
    await outro.page.getByRole("button", { name: "Continuar aqui" }).click();
    await expect.poll(() => checkpointRecebido).toBe(true);
    await expect(
      outro.page.getByRole("heading", { name: "Aguardando o outro aparelho salvar…" }),
    ).toBeVisible();
    await expect(outro.page.getByLabel("Valor do contador")).toHaveCount(0);
    await expect(
      pessoa.page.getByRole("button", { name: "Somar 1", includeHidden: true }),
    ).toBeDisabled();
    await visita.page.getByRole("button", { name: "Somar 1" }).click();
    await expect(visita.page.getByLabel("Valor do contador")).toHaveText("3");
    liberar();
    await expect(outro.page.getByLabel("Valor do contador")).toHaveText("3");
    expect(comandoAntigoEnviado).toBe(true);
    await expect(
      pessoa.page.getByRole("heading", { name: "Você continuou o jogo em outro lugar" }),
    ).toBeVisible();
    await visita.page.getByRole("button", { name: "Somar 1" }).click();
    await expect(outro.page.getByLabel("Valor do contador")).toHaveText("4");
    await outro.page.getByRole("button", { name: "Somar 1" }).click();
    await expect(visita.page.getByLabel("Valor do contador")).toHaveText("5");
    await outro.page.getByRole("button", { name: "Sair por dentro do jogo" }).click();
    await expect(outro.page).toHaveURL(/\/estante$/);
    await visita.page.getByRole("button", { name: "Sair por dentro do jogo" }).click();
    await expect(visita.page).toHaveURL(/\/estante$/);
    await outro.page.goto(endereco);
    await expect(outro.page.getByLabel("Valor do contador")).toHaveText("5");
  } finally {
    liberar();
  }
});
