import { expect, test } from "@playwright/test";

/**
 * Compila as rotas pesadas antes da suíte começar.
 *
 * O e2e sobe um `next dev`, que só compila uma rota na PRIMEIRA requisição a
 * ela. `/api/recados/parse` puxa Mastra, pdf-lib, Drizzle, billing e ioredis no
 * topo do módulo, e a suíte inteira a toca uma única vez: ali a compilação é
 * garantidamente fria. Sem este aquecimento, esse custo era cobrado do
 * `actionTimeout` do teste que a tocava, e derrubava o CI.
 *
 * Não exige sucesso: qualquer resposta serve. O módulo da rota (e todos os
 * imports de topo) é avaliado antes do handler decidir o status, então um 401
 * ou 403 já pagou a compilação. Como nenhuma credencial é enviada, nada é
 * criado ou alterado.
 *
 * Ao acrescentar uma rota de API pesada que a suíte toque poucas vezes,
 * inclua-a aqui.
 */
const WARMUP: Array<{ path: string; method: "GET" | "POST" }> = [
  // A mais pesada do app, tocada uma vez só (review-fixes.spec.ts).
  { path: "/api/recados/parse", method: "POST" },
  { path: "/api/data/export", method: "GET" },
  { path: "/api/product-event", method: "POST" },
];

// Generoso de propósito: é o orçamento de compilação, não de uma interação.
const WARMUP_TIMEOUT = 120_000;

test("aquece as rotas pesadas do servidor de desenvolvimento", async ({ request, baseURL }) => {
  test.setTimeout(WARMUP_TIMEOUT + 30_000);
  for (const { path, method } of WARMUP) {
    const response =
      method === "GET"
        ? await request.get(`${baseURL}${path}`, {
            timeout: WARMUP_TIMEOUT,
            failOnStatusCode: false,
          })
        : await request.post(`${baseURL}${path}`, {
            timeout: WARMUP_TIMEOUT,
            failOnStatusCode: false,
            data: {},
          });
    // Só interessa que o servidor tenha respondido, ou seja, que a rota
    // compilou. O status esperado aqui é de recusa: não há sessão.
    expect(response.status(), `${method} ${path} não respondeu`).toBeGreaterThan(0);
  }
});
