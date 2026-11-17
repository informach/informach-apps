import { randomBytes, randomUUID } from "node:crypto";
import { openCompassoAccount } from "@informach/billing/collection-accounts";
import { enqueueCompassoBillingEvent } from "@informach/billing/collection-jobs";
import { persistCompassoSubscriptionSnapshot } from "@informach/billing/compasso-commerce";
import { createCompassoWallet } from "@informach/billing/credits";
import { PRODUCTS } from "@informach/config";
import { getAppUrl } from "@informach/config/domains";
import { db, eq, sql } from "@informach/db";
import {
  collectionPlanChanges,
  creditLedger,
  creditPurchaseIntents,
  customers,
  users,
} from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { expect, test } from "@playwright/test";

test("payer contract, pending purchase and private wallet history", async ({ page }, testInfo) => {
  if (process.env.COMPASSO_ISOLATED_DATABASE !== "1")
    throw new Error("Disposable database required");
  const email = `${randomUUID()}@example.test`;
  const password = randomBytes(18).toString("hex");
  const origin = getAppUrl("conta", "development");
  await page.context().setExtraHTTPHeaders({
    "X-Real-IP": testInfo.project.name === "desktop" ? "198.51.100.51" : "198.51.100.52",
  });
  const signup = await page.request.post("/api/auth/sign-up/email", {
    headers: { Origin: origin },
    data: { email, password, name: "Marina Oliveira" },
  });
  expect(signup.ok(), await signup.text()).toBeTruthy();
  const [actor] = await db
    .update(users)
    .set({ emailVerified: true })
    .where(eq(users.email, email))
    .returning({ id: users.id });
  if (!actor) throw new Error("Missing account fixture");
  const family = createFamilyService({ db });
  const group = await family.createGroup(actor.id, "Família Oliveira");
  const account = await openCompassoAccount(db, actor.id, group.id);
  const [customer] = await db
    .insert(customers)
    .values({
      provider: "stripe",
      app: "compasso",
      providerCustomerId: `cus_${randomUUID()}`,
      subjectType: "billing_account",
      subjectId: account.id,
      email,
    })
    .returning();
  const original = PRODUCTS.find((p) => p.id === "compasso_monthly");
  if (!customer || !original) throw new Error("Missing commercial fixture");
  const product = { ...original, stripePriceId: { dev: "price_browser_compasso", prod: "" } };
  const start = new Date(Date.now() - 60_000);
  const end = new Date(Date.now() + 28 * 86_400_000);
  // Read-model fixtures only. Provider collection/refunds are exercised in the billing integration suite.
  const subscriptionId = await persistCompassoSubscriptionSnapshot(db, customer.id, product, {
    customerId: customer.providerCustomerId,
    subscriptionId: `sub_${randomUUID()}`,
    priceId: product.stripePriceId.dev,
    status: "active",
    start,
    end,
    trialEnd: null,
    canceledAt: null,
    cancelAtPeriodEnd: false,
    observedAt: new Date(),
    periods: [
      {
        invoiceId: `in_${randomUUID()}`,
        lineId: "il_browser",
        priceId: product.stripePriceId.dev,
        start,
        end,
        paidAt: start,
        fullyRefunded: false,
        disputed: false,
      },
    ],
  });
  await createCompassoWallet({ db, products: [product] }).getBalance({
    actorId: actor.id,
    groupId: group.id,
  });
  await db
    .update(creditLedger)
    .set({
      metadata: sql`${creditLedger.metadata} || '{"privateDetail":"fixture-must-not-reach-browser"}'::jsonb`,
    })
    .where(eq(creditLedger.ownerId, group.id));
  await db.insert(creditPurchaseIntents).values({
    customerId: customer.id,
    userId: actor.id,
    requestKey: randomUUID(),
    productId: "compasso_credits_100",
    priceId: "price_browser_credits",
    amountCents: 1490,
    currency: "BRL",
    credits: 100,
    request: {
      successUrl: `${origin}/`,
      cancelUrl: `${origin}/`,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
    },
  });
  await page.goto("/entrar");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByText("Assinatura ativa", { exact: true })).toBeVisible();
  await expect(page.locator(".wallet-balance")).toContainText("200");
  const contract = page.getByRole("region", { name: "Seu contrato Compasso" });
  await expect(contract).toContainText("Família Oliveira");
  await contract.getByText("Trocar periodicidade", { exact: true }).click();
  await expect(contract).toContainText("R$ 499 por ano");
  await expect(contract.getByRole("button", { name: "Agendar troca" })).toBeDisabled();
  await expect(contract.locator('input[name="expectedEnd"]')).toHaveValue(end.toISOString());
  await contract.getByText("Trocar periodicidade", { exact: true }).click();
  await contract.getByText("Cancelar renovação", { exact: true }).click();
  await expect(
    contract.getByText(
      "Quero encerrar a renovação. O acesso ao período pago e os créditos comprados serão preservados.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "Compra em andamento" })).toContainText(
    "100 créditos",
  );
  await page.getByText("Extrato de créditos da família", { exact: true }).click();
  await expect(page.locator(".wallet-history")).toContainText("Franquia mensal");
  await expect(page.locator(".wallet-history")).toContainText("+200");
  expect(await page.content()).not.toContain("fixture-must-not-reach-browser");
  // Test mode never opens a live checkout; the configured rollout state disables payment controls.
  await expect(page.getByRole("button", { name: "Pagamento e comprovantes" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Comprar créditos", exact: true })).toHaveCount(3);
  for (const button of await page
    .getByRole("button", { name: "Comprar créditos", exact: true })
    .all())
    await expect(button).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.locator("#compasso").screenshot({ path: testInfo.outputPath("billing.png") });
  await db.insert(collectionPlanChanges).values({
    subscriptionId,
    actorId: actor.id,
    requestKey: randomUUID(),
    fromPriceId: product.stripePriceId.dev,
    toPriceId: "price_browser_annual",
    toProductId: "compasso_annual",
    effectiveAt: end,
    status: "scheduled",
    requestStartedAt: new Date(),
    providerScheduleId: `sub_sched_${randomUUID()}`,
  });
  await page.reload();
  await expect(contract).toContainText("Troca para Compasso anual");
  await expect(contract.getByRole("button", { name: "Desfazer troca" })).toBeDisabled();
  await expect(contract.getByText("Trocar periodicidade", { exact: true })).toHaveCount(0);
  await enqueueCompassoBillingEvent(db, {
    customerId: customer.providerCustomerId,
    eventId: `evt_${randomUUID()}`,
    eventType: "charge.dispute.created",
    paymentId: "pi_unknown_fixture",
  });
  await page.reload();
  await expect(page.getByText("Cobrança em conferência", { exact: true })).toBeVisible();
  await expect(page.locator(".wallet-balance")).toContainText("200");
  await expect(page.locator(".wallet-balance")).toContainText("créditos registrados");
  await page.goto(`/?pagamento=${randomUUID()}`);
  await expect(
    page.getByRole("heading", { name: "Não conseguimos abrir esta página." }),
  ).toBeVisible();
});
