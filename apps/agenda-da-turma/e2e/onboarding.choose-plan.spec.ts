import { expect, test } from "@playwright/test";
import { extractOtp, waitForEmail } from "./fixtures/email";

// E2E light pro fluxo /choose-plan. Cobre:
//   1. Página gated por sessão — GET sem auth redireciona pra /login.
//   2. Após signup+verify, GET autenticado renderiza com as opções de plano
//      (HTML inclui labels de Free/Pro/Mensal/Anual).
//
// O que NÃO cobre: clicar "Pro Mensal" → Stripe Checkout. Server actions do
// Next 16 exigem protocolo `Next-Action` + form data + RSC streaming; testar
// via `request` puro é frágil e duplicaria a cobertura do unit test do
// `startProCheckoutAction`. Pro path em E2E exigiria Playwright `page`
// (browser) + Stripe test mode keys configuradas — escopo separado.

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}@e2e.local`;
}

function authHeaders(baseURL: string | undefined) {
  const origin = baseURL ?? process.env.E2E_BASE_URL ?? "http://localhost:3001";
  return {
    Origin: origin,
    Referer: `${origin}/signup`,
  };
}

test.describe("/choose-plan", () => {
  test("redireciona para /login quando não autenticado", async ({ request }) => {
    // `maxRedirects: 0` força que a resposta seja o 3xx em si, sem seguir.
    // O `safeInternalPath` do login page valida o `next` query string.
    const response = await request.get("/choose-plan", { maxRedirects: 0 });
    expect(response.status()).toBe(307); // Next redirect
    const location = response.headers().location ?? "";
    expect(location).toContain("/login");
  });

  test("renderiza opções de plano para usuário autenticado", async ({ request, baseURL }) => {
    const email = uniqueEmail("agenda-choose-plan");
    const password = "S3cretP4ss!";
    const headers = authHeaders(baseURL);

    // Sequência mínima de signup → verify (mesma do auth.signup-and-verify.spec).
    const signup = await request.post("/api/auth/sign-up/email", {
      data: { name: "E2E Plan", email, password },
      headers,
    });
    expect(signup.ok(), `sign-up failed: ${await signup.text()}`).toBeTruthy();

    const verifyEmail = await waitForEmail({ to: email, category: "auth.verify-email-otp" });
    const otp = extractOtp(verifyEmail);

    const verify = await request.post("/api/auth/email-otp/verify-email", {
      data: { email, otp },
      headers,
    });
    expect(verify.ok(), `verify failed: ${await verify.text()}`).toBeTruthy();

    // Agora autenticado — /choose-plan deve renderizar 200 (RSC HTML).
    const planPage = await request.get("/choose-plan");
    expect(planPage.status()).toBe(200);
    const html = await planPage.text();

    // Sanity: HTML contém labels esperadas. Não testamos UI precisa (depende
    // de design tokens / classnames), só presença textual dos planos. Se a
    // copy mudar, atualizar aqui — drift consciente.
    expect(html).toContain("Free");
    expect(html).toContain("Pro");
    expect(html.toLowerCase()).toMatch(/mensal|monthly/);
    expect(html.toLowerCase()).toMatch(/anual|annual|ano/);
  });
});
