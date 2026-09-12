import { randomUUID } from "node:crypto";
import { db, eq, inArray } from "@informach/db";
import {
  agendaProductEvents,
  agendaStudentProfiles,
  customers,
  emailDeliveries,
  subscriptions,
  users,
} from "@informach/db/schema";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { extractFirstUrl, extractOtp, waitForEmail } from "./fixtures/email";

const password = "Synthetic-Agenda!2026";
// This full family journey also runs under the default CI Playwright config.
test.setTimeout(180_000);
const ids: string[] = [];
const deletedUserEventIds: string[] = [];
let customerId: string | null = null;
let subscriptionId: string | null = null;
async function register(context: BrowserContext, baseURL: string, label: string) {
  const email = `routine-browser-${randomUUID()}@e2e.local`;
  const response = await context.request.post(`${baseURL}/api/auth/sign-up/email`, {
    headers: { Origin: baseURL },
    data: { email, password, name: label },
  });
  expect(response.ok()).toBe(true);
  const userId = (await response.json()).user.id as string;
  ids.push(userId);
  const mail = await waitForEmail({ to: email, category: "auth.verify-email-otp" });
  const verified = await context.request.post(`${baseURL}/api/auth/email-otp/verify-email`, {
    headers: { Origin: baseURL },
    data: { email, otp: extractOtp(mail) },
  });
  expect(verified.ok()).toBe(true);
  return { email, userId };
}
async function selectFree(page: Page) {
  await page.goto("/choose-plan");
  await page.getByRole("button", { name: "Começar grátis", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
}
test.afterEach(async () => {
  if (deletedUserEventIds.length)
    await db
      .delete(agendaProductEvents)
      .where(inArray(agendaProductEvents.id, deletedUserEventIds));
  if (ids.length) {
    await db.delete(agendaProductEvents).where(inArray(agendaProductEvents.userId, ids));
    await db.delete(emailDeliveries).where(inArray(emailDeliveries.userId, ids));
    await db.delete(users).where(inArray(users.id, ids));
  }
  if (customerId) {
    await db.delete(subscriptions).where(eq(subscriptions.customerId, customerId));
    await db.delete(customers).where(eq(customers.id, customerId));
  }
});
test("two adults, private child access, completion, revocation and confirmed deletion", async ({
  browser,
  context,
  page,
  baseURL,
}) => {
  if (!baseURL) throw new Error("Missing local URL");
  const runtimeErrors: string[] = [];
  page.on("pageerror", (e) => runtimeErrors.push(e.message));
  const cspErrors: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to execute|violates.*directive/i.test(m.text()))
      cspErrors.push(m.text());
    if (/controlled input|hydration|hydrated/i.test(m.text())) runtimeErrors.push(m.text());
  });
  const owner = await register(context, baseURL, "Responsável A fictício");
  await selectFree(page);
  const [customer] = await db
    .insert(customers)
    .values({
      app: "agenda-da-turma",
      provider: "stripe",
      providerCustomerId: `test-${owner.userId}`,
      subjectType: "user",
      subjectId: owner.userId,
      email: owner.email,
    })
    .returning();
  if (!customer) throw new Error("Missing synthetic subscription owner");
  customerId = customer.id;
  const [subscription] = await db
    .insert(subscriptions)
    .values({
      customerId,
      provider: "stripe",
      providerSubscriptionId: `test-${owner.userId}`,
      providerPriceId: "price_synthetic",
      productId: "agenda_da_turma_pro_monthly",
      status: "active",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86400_000),
    })
    .returning();
  if (!subscription) throw new Error("Missing synthetic subscription");
  subscriptionId = subscription.id;
  await page.goto("/recados/novo");
  await page.getByLabel("Nome", { exact: true }).fill("Criança A fictícia");
  await page.getByRole("button", { name: "Criar perfil", exact: true }).click();
  await expect(page.getByRole("button", { name: "Cadastrar manualmente" })).toBeEnabled();
  await page.getByRole("button", { name: "Cadastrar manualmente" }).click();
  await page.getByLabel("Providência", { exact: true }).fill("Preparar mochila fictícia");
  await page.getByRole("combobox", { name: "Tipo", exact: true }).selectOption("material");
  await page.getByRole("button", { name: "Salvar 1 providência", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);
  await expect(
    page.getByRole("link", { name: "Preparar mochila fictícia", exact: true }),
  ).toBeVisible();
  const [child] = await db
    .select()
    .from(agendaStudentProfiles)
    .where(eq(agendaStudentProfiles.userId, owner.userId));
  if (!child) throw new Error("Missing child created through UI");
  await db
    .insert(agendaStudentProfiles)
    .values({ userId: owner.userId, name: "Criança B restrita" });
  const guestContext = await browser.newContext({
    baseURL,
    ignoreHTTPSErrors: true,
    viewport: { width: 390, height: 844 },
  });
  try {
    const guest = await register(guestContext, baseURL, "Responsável B fictício");
    const guestPage = await guestContext.newPage();
    await selectFree(guestPage);
    await guestContext.request.post(`${baseURL}/api/auth/sign-out`, {
      headers: { Origin: baseURL },
      data: {},
    });
    await page.goto("/familia");
    await page.getByLabel("E-mail do responsável").fill(guest.email);
    await page.getByLabel("Criança B restrita", { exact: true }).uncheck();
    await page.getByRole("button", { name: "Criar convite", exact: true }).click();
    const invitation = await page.getByLabel("Link do convite").inputValue();
    await guestPage.goto(invitation);
    await expect(guestPage).toHaveURL(/login\?next=/);
    await guestPage.getByLabel(/^E-?mail$/i).fill(guest.email);
    await guestPage.getByLabel("Senha", { exact: true }).fill(password);
    await guestPage.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(
      guestPage.getByRole("button", { name: "Aceitar convite", exact: true }),
    ).toBeVisible();
    await guestPage.getByRole("button", { name: "Aceitar convite", exact: true }).click();
    await expect(guestPage).toHaveURL(/dashboard/);
    await expect(
      guestPage.getByRole("link", { name: "Preparar mochila fictícia", exact: true }),
    ).toBeVisible();
    await expect(guestPage.getByText("Criança B restrita", { exact: true })).toHaveCount(0);
    await guestPage
      .getByRole("button", {
        name: "Marcar como feito em casa: Preparar mochila fictícia",
        exact: true,
      })
      .click();
    await expect(
      guestPage.getByRole("link", { name: "Preparar mochila fictícia", exact: true }),
    ).toHaveCount(0);
    await page.goto("/recados?historico=1");
    await expect(
      page.getByRole("button", { name: "Reabrir: Preparar mochila fictícia", exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: "tmp/evaluation/family-mobile.png", fullPage: true });
    await page.goto("/familia");
    await page
      .getByRole("button", { name: "Remover acesso deste responsável", exact: true })
      .click();
    await expect(page.getByText("Acesso atualizado.", { exact: true })).toBeVisible();
    await guestPage.goto("/recados?historico=1");
    await expect(
      guestPage.getByRole("link", { name: "Preparar mochila fictícia", exact: true }),
    ).toHaveCount(0);
    await guestPage.goto("/settings/account");
    await guestPage.getByLabel("Digite EXCLUIR para solicitar o link").fill("EXCLUIR");
    await guestPage
      .getByLabel("Entendo que a exclusão afeta todos os apps Informach.", { exact: true })
      .check();
    await guestPage
      .getByRole("button", { name: "Enviar confirmação de exclusão", exact: true })
      .click();
    await expect(
      guestPage.getByRole("status").filter({ hasText: "Enviamos um link" }),
    ).toBeVisible();
    const deletionEmail = await waitForEmail({
      to: guest.email,
      category: "auth.account-deletion",
    });
    expect(
      await db.select({ id: users.id }).from(users).where(eq(users.id, guest.userId)),
    ).toHaveLength(1);
    deletedUserEventIds.push(
      ...(
        await db
          .select({ id: agendaProductEvents.id })
          .from(agendaProductEvents)
          .where(eq(agendaProductEvents.userId, guest.userId))
      ).map((row) => row.id),
    );
    await guestPage.goto(extractFirstUrl(deletionEmail, "delete-user"));
    await expect
      .poll(
        async () =>
          (await db.select({ id: users.id }).from(users).where(eq(users.id, guest.userId))).length,
      )
      .toBe(0);
    const exportResponse = await context.request.get(`${baseURL}/api/data/export`);
    expect(exportResponse.status()).toBe(200);
    expect((await exportResponse.json()).profiles).toHaveLength(2);
    await db
      .update(subscriptions)
      .set({ status: "canceled", canceledAt: new Date() })
      .where(eq(subscriptions.id, subscriptionId));
    await page.goto("/recados?historico=1");
    await expect(
      page.getByRole("button", { name: "Reabrir: Preparar mochila fictícia", exact: true }),
    ).toBeVisible();
    expect(runtimeErrors).toEqual([]);
    expect(cspErrors).toEqual([]);
  } finally {
    await guestContext.close();
  }
});
