import { randomUUID } from "node:crypto";
import { db, eq, inArray } from "@informach/db";
import {
  agendaProductEvents,
  agendaStudentProfiles,
  emailDeliveries,
  users,
} from "@informach/db/schema";
import { type APIRequestContext, expect, test } from "@playwright/test";
import { extractOtp, waitForEmail } from "./fixtures/email";

/**
 * O cadastro em quatro passos e o plano fora dele.
 *
 * O grátis vale por padrão: conta, código, o nome da criança e o primeiro
 * recado. Quem escolheu o Pro na página de vendas vai ao pagamento depois do
 * código, e o ciclo escolhido não se perde em nenhum dos caminhos de quem já
 * tem conta. O pagamento em si não é aberto aqui: depende do Stripe do
 * ambiente, e o que importa (o ciclo que chega à oferta) se prova sem ele.
 */

const created: string[] = [];
test.afterEach(async () => {
  if (!created.length) return;
  const ids = created.splice(0);
  await db.delete(agendaProductEvents).where(inArray(agendaProductEvents.userId, ids));
  await db.delete(emailDeliveries).where(inArray(emailDeliveries.userId, ids));
  await db.delete(users).where(inArray(users.id, ids));
});

function headers(baseURL: string) {
  return { Origin: baseURL, Referer: `${baseURL}/signup` };
}

/** Uma conta confirmada pela API, para os testes que começam já com sessão. */
async function verifiedAccount(request: APIRequestContext, baseURL: string, label: string) {
  const email = `${label}-${randomUUID()}@e2e.local`;
  const signup = await request.post("/api/auth/sign-up/email", {
    data: { name: "Responsável fictício", email, password: "Signup!Synthetic2026" },
    headers: headers(baseURL),
  });
  expect(signup.ok(), `sign-up failed: ${await signup.text()}`).toBeTruthy();
  created.push((await signup.json()).user.id as string);
  const mail = await waitForEmail({ to: email, category: "auth.verify-email-otp" });
  const verify = await request.post("/api/auth/email-otp/verify-email", {
    data: { email, otp: extractOtp(mail) },
    headers: headers(baseURL),
  });
  expect(verify.ok(), `verify failed: ${await verify.text()}`).toBeTruthy();
}

test("a escolha de plano antiga pede login e leva à oferta no ciclo da URL", async ({
  page,
  baseURL,
}) => {
  if (!baseURL) throw new Error("Local app required");
  const anonymous = await page.request.get("/choose-plan", { maxRedirects: 0 });
  expect(anonymous.status()).toBe(307);
  expect(anonymous.headers().location ?? "").toContain("/login");

  await verifiedAccount(page.request, baseURL, "agenda-choose-plan");
  const annual = await page.request.get("/choose-plan?cycle=anual", { maxRedirects: 0 });
  expect(annual.status()).toBe(307);
  expect(annual.headers().location ?? "").toMatch(/\/upgrade\?cycle=anual$/);

  // Quem já tem conta e volta ao cadastro com o Pro escolhido cai na oferta,
  // no mesmo ciclo: é o caminho de quem recarrega a tela depois do código.
  await page.goto("/signup?plan=pro&cycle=anual");
  await expect(page).toHaveURL(/\/upgrade\?cycle=anual$/);
  await expect(page.getByRole("button", { name: /^Anual/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("a oferta do Pro abre no ciclo escolhido e responde ao motivo", async ({ page, baseURL }) => {
  if (!baseURL) throw new Error("Local app required");
  await verifiedAccount(page.request, baseURL, "agenda-upgrade");

  await page.goto("/upgrade?cycle=anual");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("O Pro é para a casa inteira.");
  await expect(page.getByRole("button", { name: /^Anual/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByText("R$ 199,00", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Voltar para Hoje" })).toBeVisible();

  await page.goto("/upgrade?motivo=imprimir");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "A semana em PDF faz parte do Pro.",
  );
  await expect(page.getByRole("button", { name: "Mensal", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // Um motivo desconhecido (inclusive um nome do protótipo) cai na frase geral.
  await page.goto("/upgrade?motivo=toString");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("O Pro é para a casa inteira.");
});

test("o login leva ao cadastro sem destino, a não ser que um tenha vindo na URL", async ({
  page,
}) => {
  // Com `?next=/dashboard` sempre, a conta nova criada a partir do login
  // pulava a criança e o primeiro recado.
  await page.goto("/login");
  await expect(page.getByRole("link", { name: "Criar conta" })).toHaveAttribute("href", "/signup");
  await page.goto(`/login?next=${encodeURIComponent("/upgrade?cycle=anual")}`);
  await expect(page.getByRole("link", { name: "Criar conta" })).toHaveAttribute(
    "href",
    `/signup?next=${encodeURIComponent("/upgrade?cycle=anual")}`,
  );
});

test("o cadastro grátis termina no primeiro recado da criança", async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  if (!baseURL) throw new Error("Local app required");
  const email = `agenda-signup-ui-${randomUUID()}@e2e.local`;

  await page.goto("/signup");
  await expect(page.getByText("Passo 1 de 4: Conta")).toBeVisible();
  await page.getByLabel("Seu nome").fill("Responsável fictício");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill("Signup!Synthetic2026");
  await page.getByRole("button", { name: "Mostrar" }).click();
  await expect(page.getByLabel("Senha")).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Criar conta" }).click();

  await expect(page.getByRole("heading", { name: "Confira seu e-mail" })).toBeVisible();
  await expect(page.getByText("Passo 2 de 4: Código")).toBeVisible();
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (!user) throw new Error("A conta não foi criada");
  created.push(user.id);
  const mail = await waitForEmail({ to: email, category: "auth.verify-email-otp" });
  await page.getByLabel("Código de 6 números").fill(extractOtp(mail));
  await page.getByRole("button", { name: "Confirmar" }).click();

  // Sem escolha de plano no meio: o grátis vale, e o cadastro segue na criança.
  await expect(page.getByRole("heading", { name: "Como se chama a criança?" })).toBeVisible();
  await expect(page.getByText("Passo 3 de 4: Criança")).toBeVisible();
  await page.getByLabel("Nome", { exact: true }).fill("Clara fictícia");
  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(
    page.getByRole("heading", { name: "Agora, o primeiro recado de Clara fictícia." }),
  ).toBeVisible();
  await expect(page.getByText("Passo 4 de 4: Recado")).toBeVisible();
  const [child] = await db
    .select({ id: agendaStudentProfiles.id })
    .from(agendaStudentProfiles)
    .where(eq(agendaStudentProfiles.userId, user.id));
  if (!child) throw new Error("A criança não foi guardada");
  await expect(page.getByRole("link", { name: /Tirar uma foto/ })).toHaveAttribute(
    "href",
    `/recados/novo?modo=foto&perfil=${child.id}`,
  );
  await page.getByRole("link", { name: "Ir para Hoje sem recado" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});
