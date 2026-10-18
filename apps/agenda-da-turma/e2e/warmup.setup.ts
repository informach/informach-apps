import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { db, eq } from "@informach/db";
import { accounts, users } from "@informach/db/schema";
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
 * **Com sessão.** `/api/recados` e `/api/data` estão em `requireAuth` no
 * `proxy.ts`: sem cookie, o proxy responde o redirect para `/login` antes de o
 * módulo da rota ser avaliado, e o aquecimento compilava só a página de login.
 * Ninguém percebia porque qualquer resposta servia. O log do servidor mostrava
 * `POST /login?next=%2Fapi%2Frecados%2Fparse` e, depois, a rota compilando
 * dentro do teste (`/api/recados/parse 200 in 10.2s`, 7,9 s de compilação),
 * acima dos 10 s de uma interação local. Agora uma conta sintética entra,
 * toca as rotas e é apagada.
 *
 * Não exige sucesso: o corpo vazio cai na validação (400) e nada é criado. O
 * que interessa é que a resposta tenha vindo da ROTA, e não do proxy: por isso
 * o redirect não é seguido (`maxRedirects: 0`) e um redirect para `/login`
 * reprova.
 *
 * **Páginas também.** Este arquivo dizia que aquecer página não adiantava, e
 * tinha medido: sete páginas subiram o aquecimento em 2 s sem tirar nenhum
 * segundo dos testes. A medida estava certa e a conclusão, não: sem sessão as
 * sete viravam o mesmo redirect para `/login`, e nenhuma compilava. Com a conta
 * sintética elas compilam aqui, e o primeiro teste que visita `/dashboard` ou
 * o detalhe da atividade deixa de esperar a compilação dentro de um `expect`
 * de 5 s. Rodando uma spec sozinha com o `.next` limpo, a primeira página
 * autenticada falhava assim.
 *
 * As páginas públicas vão antes de entrar: logada, a pessoa que abre
 * `/signup` é mandada para dentro do app, e a página não compilaria.
 *
 * Ao acrescentar uma rota pesada que a suíte toque poucas vezes, ou uma página
 * que um teste visite, inclua-a aqui.
 */
type Route = { path: string; method: "GET" | "POST" };
// Rotas dinâmicas levam um id que não existe: a resposta é 404 da própria
// rota, que já compilou o módulo.
const MISSING = "00000000-0000-4000-8000-000000000000";
const PUBLIC: Route[] = [
  { path: "/", method: "GET" },
  { path: "/signup", method: "GET" },
  { path: "/login", method: "GET" },
];
const SIGNED_IN: Route[] = [
  // As páginas que a suíte visita logada, da mais visitada para a menos.
  { path: "/atividades", method: "GET" },
  { path: "/atividades/nova", method: "GET" },
  { path: "/recados/novo", method: "GET" },
  { path: "/dashboard", method: "GET" },
  { path: "/calendario", method: "GET" },
  { path: "/familia", method: "GET" },
  { path: "/familia/adultos", method: "GET" },
  { path: "/familia/turmas", method: "GET" },
  { path: "/familia/ajustes", method: "GET" },
  { path: "/perfis", method: "GET" },
  { path: "/turmas", method: "GET" },
  { path: "/upgrade", method: "GET" },
  // Só redireciona para a oferta, mas a rota compila na primeira chamada.
  { path: "/choose-plan", method: "GET" },
  { path: "/recados", method: "GET" },
  { path: "/settings/account", method: "GET" },
  { path: `/atividades/${MISSING}`, method: "GET" },
  { path: `/recados/${MISSING}`, method: "GET" },
  // A mais pesada do app, tocada uma vez só (review-fixes.spec.ts).
  { path: "/api/recados/parse", method: "POST" },
  { path: "/api/data/export", method: "GET" },
  { path: "/api/product-event", method: "POST" },
  // O download do original, uma vez só e dentro de um `waitForEvent` de 10 s.
  { path: `/api/recados/${MISSING}/anexo`, method: "GET" },
  // A conclusão pela fila offline (offline-queue.spec.ts).
  { path: `/api/tasks/${MISSING}/status`, method: "POST" },
];

// Generoso de propósito: é o orçamento de compilação, não de uma interação.
const WARMUP_TIMEOUT = 120_000;
const PASSWORD = "Warmup!Synthetic2026";

test("aquece as rotas pesadas do servidor de desenvolvimento", async ({ request, baseURL }) => {
  test.setTimeout(WARMUP_TIMEOUT * 3);
  if (!baseURL) throw new Error("Local app required");
  const id = `warmup-${randomUUID()}`;
  const email = `${id}@e2e.local`;
  const warm = async ({ path: route, method }: Route) => {
    const options = {
      timeout: WARMUP_TIMEOUT,
      failOnStatusCode: false,
      maxRedirects: 0,
      headers: { Origin: baseURL },
    };
    const response =
      method === "GET"
        ? await request.get(`${baseURL}${route}`, options)
        : await request.post(`${baseURL}${route}`, { ...options, data: {} });
    // Um redirect para o login é o proxy respondendo no lugar da rota: a
    // compilação não aconteceu, e o teste que tocar a rota vai pagar por ela.
    // O redirect da própria página (`/perfis` vai para `/familia`) já compilou.
    const status = response.status();
    const location = response.headers().location ?? "";
    const bounced =
      status >= 300 && status < 400 && new URL(location, baseURL).pathname === "/login";
    expect(bounced, `${method} ${route} não chegou à rota`).toBe(false);
    // A página compila em duas metades: o servidor no pedido do HTML, e os
    // pedaços do navegador só quando alguém pede cada script. Sem pedir os
    // scripts aqui, o primeiro teste que abre a página pagava essa segunda
    // compilação, e o `next dev` recarregava a página no meio do clique
    // ("[Fast Refresh] rebuilding" logo depois de carregar).
    if (method === "GET" && status === 200) {
      const html = await response.text();
      const scripts = [...html.matchAll(/<script[^>]+src="(\/_next\/[^"]+)"/g)].map(
        (match) => match[1],
      );
      await Promise.all(
        [...new Set(scripts)].map((src) =>
          request.get(`${baseURL}${src}`, { timeout: WARMUP_TIMEOUT, failOnStatusCode: false }),
        ),
      );
    }
  };
  try {
    for (const route of PUBLIC) await warm(route);
    const authRequire = createRequire(
      path.resolve(process.cwd(), "../../packages/auth/package.json"),
    );
    const { hashPassword } = await import(
      pathToFileURL(authRequire.resolve("better-auth/crypto")).href
    );
    await db.insert(users).values({ id, name: "Aquecimento fictício", email, emailVerified: true });
    await db.insert(accounts).values({
      id: randomUUID(),
      userId: id,
      accountId: id,
      providerId: "credential",
      password: await hashPassword(PASSWORD),
    });
    // O `request` guarda o cookie da sessão para as chamadas seguintes.
    const login = await request.post(`${baseURL}/api/auth/sign-in/email`, {
      headers: { Origin: baseURL },
      data: { email, password: PASSWORD },
      timeout: WARMUP_TIMEOUT,
    });
    expect(login.ok(), "a conta do aquecimento não entrou").toBe(true);

    for (const route of SIGNED_IN) await warm(route);
  } finally {
    await db.delete(users).where(eq(users.id, id));
  }
});
