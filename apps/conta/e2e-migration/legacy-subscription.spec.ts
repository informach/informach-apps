import { randomBytes, randomUUID } from "node:crypto";
import { openCompassoAccount } from "@informach/billing/collection-accounts";
import { getAppUrl } from "@informach/config/domains";
import { db, eq } from "@informach/db";
import {
  checkoutIntents,
  customers,
  familyMigrationSources,
  legacyContractAcceptancePeriods,
  legacyContractAcceptances,
  legacyContractObservations,
  legacyFutureIntents,
  subscriptionPaymentPeriods,
  subscriptions,
  users,
} from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { expect, test } from "@playwright/test";

test("explains why an existing paid period blocks a new subscription", async ({ page }, info) => {
  const email = `${randomUUID()}@example.test`,
    password = randomBytes(18).toString("hex");
  await page.context().setExtraHTTPHeaders({
    "X-Real-IP": info.project.name === "desktop" ? "198.51.100.81" : "198.51.100.82",
  });
  const signup = await page.request.post("/api/auth/sign-up/email", {
    headers: { Origin: getAppUrl("conta", "development") },
    data: { email, password, name: "Pessoa de teste" },
  });
  expect(signup.ok(), await signup.text()).toBe(true);
  const [actor] = await db
    .update(users)
    .set({ emailVerified: true })
    .where(eq(users.email, email))
    .returning({ id: users.id });
  if (!actor) throw new Error("Missing account fixture");
  const group = await createFamilyService({ db }).createGroup(actor.id, "Minha família");
  await db
    .insert(familyMigrationSources)
    .values({ app: "cozya", sourceOwnerId: actor.id, groupId: group.id });
  const [customer] = await db
    .insert(customers)
    .values({
      app: "cozya",
      provider: "stripe",
      providerCustomerId: `cus_${randomUUID()}`,
      subjectType: "user",
      subjectId: actor.id,
      email,
    })
    .returning();
  if (!customer) throw new Error("Missing old customer fixture");
  const [oldSubscription] = await db
    .insert(subscriptions)
    .values({
      customerId: customer.id,
      provider: "stripe",
      providerSubscriptionId: `sub_${randomUUID()}`,
      productId: "cozya_pro_monthly",
      providerPriceId: "price_legacy_fixture",
      status: "canceled",
      currentPeriodStart: new Date(Date.now() - 86_400_000),
      currentPeriodEnd: new Date(Date.now() + 86_400_000),
    })
    .returning();
  if (!oldSubscription) throw new Error("Missing old subscription");
  await page.goto("/entrar");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/$/);
  await page.goto(`/?familia=${group.id}#compasso`);
  const legacy = page.getByRole("region", { name: "Seus contratos anteriores" });
  await expect(legacy).toContainText("Cozya");
  await expect(legacy.getByRole("button", { name: "Conferir contrato" })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByText("Assinar o Compasso", { exact: true }).click();
  await page
    .getByLabel(
      "Quero iniciar a assinatura agora, com renovação automática. Posso cancelar a próxima renovação pela minha conta.",
    )
    .check();
  await page.getByRole("button", { name: "Continuar para pagamento" }).click();
  await expect(page.locator(".subscribe-choice").getByRole("status")).toContainText(
    "período já pago",
  );
  expect(
    await db.select().from(checkoutIntents).where(eq(checkoutIntents.userId, actor.id)),
  ).toHaveLength(0);
  await expect(page).toHaveURL(new RegExp(`familia=${group.id}`));
  const [period] = await db
    .insert(subscriptionPaymentPeriods)
    .values({
      subscriptionId: oldSubscription.id,
      provider: "stripe",
      providerInvoiceId: `in_${randomUUID()}`,
      providerLineId: "il_fixture",
      providerPriceId: oldSubscription.providerPriceId,
      periodStart: oldSubscription.currentPeriodStart,
      periodEnd: oldSubscription.currentPeriodEnd,
      paidAt: oldSubscription.currentPeriodStart,
    })
    .returning();
  const [acceptance] = await db
    .insert(legacyContractAcceptances)
    .values({
      groupId: group.id,
      payerUserId: actor.id,
      subscriptionId: oldSubscription.id,
      policyVersion: "compasso-legacy-2026-11-10-v1",
      cancellationConfirmedAt: new Date(),
    })
    .returning();
  if (!period || !acceptance) throw new Error("Missing accepted period");
  await db
    .insert(legacyContractAcceptancePeriods)
    .values({ acceptanceId: acceptance.id, paymentPeriodId: period.id });
  await db.insert(legacyContractObservations).values({
    subscriptionId: oldSubscription.id,
    status: "canceled",
    providerPriceId: oldSubscription.providerPriceId,
    periodStart: oldSubscription.currentPeriodStart,
    periodEnd: oldSubscription.currentPeriodEnd,
    cancelAtPeriodEnd: false,
    observedAt: new Date(),
  });
  const account = await openCompassoAccount(db, actor.id, group.id);
  await page.reload();
  const future = page.getByRole("region", { name: "Continuidade do Compasso" });
  await expect(future.getByRole("button", { name: "Conferir continuidade" })).toBeEnabled();
  const startsAt = new Date(Math.ceil(oldSubscription.currentPeriodEnd.getTime() / 1000) * 1000);
  await db.insert(legacyFutureIntents).values({
    accountId: account.id,
    payerUserId: actor.id,
    requestKey: randomUUID(),
    productId: "compasso_monthly",
    providerPriceId: "price_fixture",
    amountCents: 4990,
    interval: "month",
    paidThrough: oldSubscription.currentPeriodEnd,
    startsAt,
    termsRevision: "a".repeat(64),
    setupExpiresAt: new Date(Date.now() + 3600_000),
    state: "scheduled",
    setupSessionId: `cs_${randomUUID()}`,
    paymentMethodId: `pm_${randomUUID()}`,
    scheduleId: `sched_${randomUUID()}`,
  });
  await page.reload();
  await expect(future).toContainText("programada para");
  await expect(future.getByRole("button", { name: "Cancelar programação" })).toBeEnabled();
  await future.screenshot({ path: info.outputPath("continuidade.png") });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
