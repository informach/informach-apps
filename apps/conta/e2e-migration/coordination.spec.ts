import { randomBytes, randomUUID } from "node:crypto";
import { openCompassoAccount } from "@informach/billing/collection-accounts";
import { getAppUrl } from "@informach/config/domains";
import { db, eq } from "@informach/db";
import {
  customers,
  legacyBillingCoordinations,
  subscriptionPaymentPeriods,
  subscriptions,
  users,
} from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { type APIRequestContext, expect, type Page, test } from "@playwright/test";
import { MIGRATION_PRICES } from "./prices";

async function adult(request: APIRequestContext, ip: string) {
  const email = `${randomUUID()}@example.test`,
    password = randomBytes(18).toString("hex");
  const signup = await request.post("/api/auth/sign-up/email", {
    headers: { Origin: getAppUrl("conta", "development"), "X-Real-IP": ip },
    data: { email, password, name: "Pessoa de teste" },
  });
  expect(signup.ok(), await signup.text()).toBe(true);
  const [row] = await db
    .update(users)
    .set({ emailVerified: true })
    .where(eq(users.email, email))
    .returning({ id: users.id });
  if (!row) throw new Error("Missing account fixture");
  return { id: row.id, email, password };
}
async function signIn(page: Page, person: { email: string; password: string }) {
  await page.goto("/entrar");
  await page.getByLabel("E-mail", { exact: true }).fill(person.email);
  await page.getByLabel("Senha", { exact: true }).fill(person.password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/$/);
}

test("only the payer sees and answers the request to defer their own charge", async ({
  browser,
}, info) => {
  const suffix = info.project.name === "desktop" ? "91" : "92";
  const payerContext = await browser.newContext({
    ...info.project.use,
    extraHTTPHeaders: { "X-Real-IP": `198.51.100.${suffix}` },
  });
  const otherContext = await browser.newContext({
    ...info.project.use,
    extraHTTPHeaders: { "X-Real-IP": `198.51.100.1${suffix}` },
  });
  try {
    const payerPage = await payerContext.newPage();
    const otherPage = await otherContext.newPage();
    const payer = await adult(payerPage.request, `198.51.100.${suffix}`);
    const other = await adult(otherPage.request, `198.51.100.1${suffix}`);
    const family = createFamilyService({ db });
    const group = await family.createGroup(payer.id, "Família com dois pagantes");
    await family.acceptInvitation(
      other.id,
      (await family.createInvitation(payer.id, group.id, other.email)).token,
    );
    const account = await openCompassoAccount(db, payer.id, group.id);
    const [customer] = await db
      .insert(customers)
      .values({
        app: "compasso",
        provider: "stripe",
        providerCustomerId: `cus_${randomUUID()}`,
        subjectType: "billing_account",
        subjectId: account.id,
        email: payer.email,
      })
      .returning();
    if (!customer) throw new Error("Missing payer customer");
    const start = new Date(Date.now() - 86_400_000);
    const end = new Date(Math.floor((Date.now() + 10 * 86_400_000) / 1000) * 1000);
    const [subscription] = await db
      .insert(subscriptions)
      .values({
        customerId: customer.id,
        provider: "stripe",
        providerSubscriptionId: `sub_${randomUUID()}`,
        productId: "compasso_monthly",
        providerPriceId: MIGRATION_PRICES.COMPASSO_MONTHLY_PRICE,
        status: "active",
        currentPeriodStart: start,
        currentPeriodEnd: end,
      })
      .returning();
    if (!subscription) throw new Error("Missing payer subscription");
    await db.insert(subscriptionPaymentPeriods).values({
      subscriptionId: subscription.id,
      provider: "stripe",
      providerInvoiceId: `in_${randomUUID()}`,
      providerLineId: `il_${randomUUID()}`,
      providerPriceId: subscription.providerPriceId,
      periodStart: start,
      periodEnd: end,
      paidAt: start,
    });
    const [coordination] = await db
      .insert(legacyBillingCoordinations)
      .values({
        accountId: account.id,
        groupId: group.id,
        payerUserId: payer.id,
        contributorUserId: other.id,
        policyVersion: "compasso-coordination-2026-11-11-v1",
      })
      .returning();
    if (!coordination) throw new Error("Missing coordination");

    await signIn(payerPage, payer);
    await payerPage.goto(`/?familia=${group.id}#compasso`);
    const request = payerPage.getByRole("region", {
      name: "Pedido de adiamento da sua cobrança",
    });
    await expect(request).toContainText("trouxe um período já pago");
    await expect(request).toContainText("Só você decide");
    await expect(request.getByRole("button", { name: "Conferir datas" })).toBeEnabled();
    expect(await payerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await request.screenshot({ path: info.outputPath("pedido.png") });

    // The other adult never sees the payer's charge or the request.
    await signIn(otherPage, other);
    await otherPage.goto(`/?familia=${group.id}#compasso`);
    await expect(
      otherPage.getByRole("region", { name: "Pedido de adiamento da sua cobrança" }),
    ).toHaveCount(0);
    await expect(otherPage.getByRole("region", { name: "Adiamento da sua cobrança" })).toHaveCount(
      0,
    );
    await expect(otherPage.locator("body")).not.toContainText("R$ 49,90");

    const deferUntil = new Date(end.getTime() + 30 * 86_400_000);
    await db
      .update(legacyBillingCoordinations)
      .set({
        state: "applied",
        kind: "subscription_trial",
        subscriptionId: subscription.id,
        providerPriceId: subscription.providerPriceId,
        amountCents: 4990,
        interval: "month",
        fromChargeAt: end,
        contributedPaidThrough: deferUntil,
        deferUntil,
        offerRevision: "b".repeat(64),
        effectAttemptedAt: new Date(),
        effectConfirmedAt: new Date(),
      })
      .where(eq(legacyBillingCoordinations.id, coordination.id));
    await db
      .update(subscriptions)
      .set({ status: "trialing", trialEnd: deferUntil })
      .where(eq(subscriptions.id, subscription.id));
    await payerPage.reload();
    const applied = payerPage.getByRole("region", { name: "Adiamento da sua cobrança" });
    await expect(applied).toContainText("Próxima cobrança adiada para");
    await expect(applied).toContainText("nada foi reembolsado");
    await expect(payerPage.locator("body")).toContainText("Ativa · próxima cobrança adiada");
    await expect(payerPage.locator("body")).not.toContainText("Em teste");
    await applied.screenshot({ path: info.outputPath("adiada.png") });
    expect(await payerPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  } finally {
    await payerContext.close();
    await otherContext.close();
  }
});
