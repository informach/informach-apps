import { expect, test } from "@playwright/test";

/**
 * Compila as rotas pesadas antes da suíte começar.
 *
 * Mesmo motivo do aquecimento da Agenda da Turma: o e2e sobe um `next dev`,
 * que só compila uma rota na PRIMEIRA requisição a ela, e o custo dessa
 * compilação acabava dentro do timeout do teste que a tocava. Foi o que deixou
 * `kitchen.spec.ts` instável no CI, estourando 30 s em `/api/account/export`.
 *
 * Não exige sucesso: qualquer resposta serve. O módulo da rota é avaliado antes
 * do handler decidir o status, então um 401 já pagou a compilação. Nenhuma
 * credencial é enviada, então nada é criado ou alterado.
 */
const WARMUP: Array<{ path: string; method: "GET" | "POST" }> = [
  { path: "/api/account/export", method: "GET" },
  { path: "/api/ai/recipes/refine", method: "POST" },
];

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
    expect(response.status(), `${method} ${path} não respondeu`).toBeGreaterThan(0);
  }
});
