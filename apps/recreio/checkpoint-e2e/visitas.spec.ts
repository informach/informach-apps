import { expect, test } from "@playwright/test";
import { comecarVigia, fecharAparelhos, vigia } from "../e2e/apoio";
import { servidorDoContador } from "../e2e/servidor-apoio";
import { provarVisitaNaGestao } from "../e2e/visitas-gestao-apoio";

const contador = servidorDoContador();
test.beforeEach(comecarVigia);
test.afterEach(async () => {
  await fecharAparelhos();
  await contador.parar();
  if (test.info().status !== test.info().expectedStatus)
    await test
      .info()
      .attach("servidor-do-contador.log", { body: contador.log(), contentType: "text/plain" });
  expect(vigia().violacoes).toEqual([]);
  expect(vigia().errosDePagina).toEqual([]);
  expect(vigia().errosDeConsole).toEqual([]);
});

test("salvar e visitar espera o recibo real e preserva o mundo anterior", async ({ browser }) => {
  await provarVisitaNaGestao(browser, contador, true);
});
