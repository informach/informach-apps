import { expect, test } from "@playwright/test";
import { comecarVigia, criarMundo, fecharAparelhos, novaPessoa, vigia } from "./apoio";
import {
  enderecoDoJogo,
  iniciarServidor,
  jogoEm,
  mundoNaTela,
  pararServidor,
} from "./morada-apoio";

test.beforeEach(comecarVigia);
test.afterEach(async () => {
  await fecharAparelhos();
  await pararServidor();
  expect(vigia().violacoes).toEqual([]);
  expect(vigia().errosDePagina).toEqual([]);
});

test("Morada não sai como salvo quando perde o ACK; reabre e permite conferir antes de tentar sair", async ({
  browser,
}) => {
  await iniciarServidor();
  const pessoa = await novaPessoa(browser, "Saída confirmada");
  const { page } = pessoa;
  const mundo = await criarMundo(page, "Morada", "Casa da confirmação");
  let descartadas = 0;
  // Proxy para o servidor REAL: só a primeira confirmação de saída se perde.
  await page.routeWebSocket("**", (socket) => {
    const servidor = socket.connectToServer();
    servidor.onMessage((mensagem) => {
      if (typeof mensagem === "string") {
        const quadro: unknown = JSON.parse(mensagem);
        if (
          quadro &&
          typeof quadro === "object" &&
          "t" in quadro &&
          quadro.t === "saiu" &&
          descartadas === 0
        ) {
          descartadas++;
          return;
        }
      }
      socket.send(mensagem);
    });
  });
  await page.goto(enderecoDoJogo(mundo));
  const jogo = jogoEm(page);
  await mundoNaTela(jogo);
  await jogo.retrato("Lia").click();
  await expect(jogo.retrato("Lia")).toHaveAttribute("data-estado", "voce");
  await jogo.preferido.click();
  await expect(jogo.retrato("Lia")).toHaveAttribute("data-morada-preferido", "sim");
  await jogo.sair.click();
  await expect(
    page.getByText(
      "Não foi possível confirmar o salvamento. Vamos reabrir o mundo para conferir; tente sair novamente.",
    ),
  ).toBeVisible();
  expect(descartadas).toBe(1);
  await expect(page).toHaveURL(/\/jogar\/morada\?mundo=/);
  await mundoNaTela(jogo);
  await expect(jogo.retrato("Lia")).toHaveAttribute("data-morada-preferido", "sim");
  await jogo.sair.click();
  await expect(page).toHaveURL(/\/estante$/);
});
