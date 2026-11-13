import { randomBytes, randomUUID } from "node:crypto";
import {
  cancelDepartureReview,
  processDepartureAssessments,
} from "@informach/account/departure-reviews";
import { getCollectionApps } from "@informach/config/collections";
import { getAppUrl } from "@informach/config/domains";
import { and, db, eq } from "@informach/db";
import {
  accountDepartureReviews,
  customers,
  ediDevices,
  events,
  sessions,
  subscriptions,
  users,
} from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { expect, test } from "@playwright/test";

test("reviews obligations with fresh login without closing identity, family or payments", async ({
  page,
}, testInfo) => {
  if (process.env.COMPASSO_ISOLATED_DATABASE !== "1")
    throw new Error("Disposable database required");
  const origin = getAppUrl("conta", "development");
  const path = "/privacidade/encerramento";
  const maintenancePath = "/api/jobs/account-maintenance";
  expect((await page.request.post(maintenancePath)).status()).toBe(401);
  expect(
    (
      await page.request.post(maintenancePath, {
        headers: { Authorization: "Bearer incorrect" },
      })
    ).status(),
  ).toBe(401);
  const maintenance = await page.request.post(maintenancePath, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  expect(maintenance.ok()).toBe(true);
  // A preceding browser project can leave its deliberately expired review.
  // The job is global; the second call verifies completion and idempotence.
  expect(await maintenance.json()).toMatchObject({ removed: expect.any(Number), failed: 0 });
  const repeatedMaintenance = await page.request.post(maintenancePath, {
    headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
  });
  expect(repeatedMaintenance.ok()).toBe(true);
  expect(await repeatedMaintenance.json()).toMatchObject({ removed: 0, failed: 0 });
  expect((await page.request.get(maintenancePath)).status()).toBe(405);
  await page.goto(path);
  await expect(page).toHaveURL(`${origin}/entrar?next=%2Fprivacidade%2Fencerramento`);
  const email = `${randomUUID()}@example.test`;
  const password = randomBytes(24).toString("hex");
  await page.context().setExtraHTTPHeaders({
    "X-Real-IP": testInfo.project.name === "desktop" ? "198.51.100.91" : "198.51.100.92",
  });
  const signup = await page.request.post("/api/auth/sign-up/email", {
    headers: { Origin: origin },
    data: { email, password, name: "Conta de encerramento" },
  });
  expect(signup.ok()).toBeTruthy();
  const [actor] = await db
    .update(users)
    .set({ emailVerified: true })
    .where(eq(users.email, email))
    .returning({ id: users.id });
  if (!actor) throw new Error("Missing synthetic account");
  const deviceId = randomUUID();
  await db.insert(ediDevices).values({
    id: deviceId,
    userId: actor.id,
    name: "PRIVATE_DEVICE_NAME",
    publicKeySpki: "PRIVATE_DEVICE_KEY",
    keyThumbprint: deviceId.replaceAll("-", "").repeat(2),
  });
  const family = createFamilyService({ db });
  const group = await family.createGroup(actor.id, "Família da conferência");
  await family.createPerson(actor.id, {
    groupId: group.id,
    kind: "dependent",
    displayName: "Pessoa sob responsabilidade",
  });
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
  if (!customer) throw new Error("Missing synthetic customer");
  await db.insert(customers).values({
    app: "edi",
    provider: "stripe",
    providerCustomerId: `cus_${randomUUID()}`,
    subjectType: "user",
    subjectId: actor.id,
    email,
    metadata: { note: "PRIVATE_PROVIDER_PAYLOAD" },
  });
  const [contract] = await db
    .insert(subscriptions)
    .values({
      customerId: customer.id,
      productId: "cozya_pro_monthly",
      provider: "stripe",
      providerSubscriptionId: `sub_${randomUUID()}`,
      providerPriceId: "price_fixture",
      status: "active",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
    })
    .returning();
  if (!contract) throw new Error("Missing synthetic contract");
  await page.goto("/entrar");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(origin);
  await db
    .update(sessions)
    .set({ createdAt: new Date(Date.now() - 16 * 60_000) })
    .where(and(eq(sessions.userId, actor.id), eq(sessions.originApp, "conta")));
  await page.getByRole("link", { name: "Preparar encerramento" }).click();
  await expect(page).toHaveURL(`${origin}/entrar?next=%2Fprivacidade%2Fencerramento`);
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(`${origin}${path}`);
  await expect(page.getByRole("heading", { name: "Uma saída bem cuidada." })).toBeVisible();
  await expect(page.getByText("Família da conferência", { exact: true })).toBeVisible();
  await expect(page.getByText("Pessoa sob responsabilidade", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Você é o único responsável disponível", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("Há registros de cobrança em:", { exact: false })).toContainText(
    "Edi",
  );
  await expect(
    page.getByText("Há registros de dispositivos, licenças ou operações", { exact: false }),
  ).toBeVisible();
  await expect(
    page
      .locator(".departure-counts > div")
      .filter({ hasText: "Contratos a resolver" })
      .locator("dd"),
  ).toHaveText("1");
  expect(await page.locator("main").innerText()).not.toContain("PRIVATE_PROVIDER_PAYLOAD");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("departure.png"), fullPage: true });
  expect(await family.listGroups(actor.id)).toHaveLength(1);
  expect(
    (
      await db
        .select({ status: subscriptions.status })
        .from(subscriptions)
        .where(eq(subscriptions.id, contract.id))
    )[0]?.status,
  ).toBe("active");
  expect(
    (
      await db
        .select({ payload: events.payload })
        .from(events)
        .where(and(eq(events.actorId, actor.id), eq(events.eventType, "user.closure_reviewed")))
    ).map((row) => row.payload),
  ).toEqual([{ scope: "compasso-web" }]);

  await page.getByRole("button", { name: "Consultar meus aplicativos", exact: true }).click();
  await expect(page).toHaveURL(/\/privacidade\/encerramento\?avaliacao=[0-9a-f-]+$/);
  const reviewId = new URL(page.url()).searchParams.get("avaliacao");
  if (!reviewId) throw new Error("Missing assessment request");
  const panel = page.getByRole("region", { name: "O que precisa de atenção em cada app." });
  await expect(panel.getByText("Resposta pendente.", { exact: true })).toHaveCount(5);

  // App adapters and their authenticated routes have PostgreSQL integration
  // coverage in each app. Here their DTOs are boundary fixtures; the durable
  // queue, authentication, receipt, central action and browser are real.
  const apps = getCollectionApps("compasso");
  const report = async (app: string) => {
    const result = await processDepartureAssessments({
      db,
      app,
      limit: 1,
      assess: async (id) => {
        expect(id).toBe(actor.id);
        return {
          version: 1,
          hasPersonalData: app === "cozya",
          hasSharedData: false,
          managedProfiles: 0,
          sharedProfiles: 0,
          activeCredentials: 0,
          pendingOperations: app === "cozya" ? 1 : 0,
        };
      },
    });
    expect(result).toEqual({ completed: 1, failed: 0, discarded: 0 });
  };
  for (const app of apps.slice(0, -1)) await report(app.slug);
  await panel.getByRole("link", { name: "Atualizar andamento" }).click();
  await expect(panel.getByText("Resposta pendente.", { exact: true })).toHaveCount(1);
  await expect(panel.getByText("Aguardando respostas", { exact: false })).toBeVisible();
  await panel.screenshot({ path: testInfo.outputPath("departure-assessment-pending.png") });
  const finalApp = apps.at(-1);
  if (!finalApp) throw new Error("Missing catalog app");
  await report(finalApp.slug);
  await panel.getByRole("link", { name: "Atualizar andamento" }).click();
  await expect(
    panel.getByText("Todos os aplicativos responderam.", { exact: false }),
  ).toBeVisible();
  await expect(panel.getByText("Resposta pendente.", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await panel.screenshot({ path: testInfo.outputPath("departure-assessment-complete.png") });
  await db
    .update(accountDepartureReviews)
    .set({ createdAt: new Date(0), expiresAt: new Date(60000) })
    .where(eq(accountDepartureReviews.id, reviewId));
  await page.reload();
  await expect(panel.getByText("Esta consulta venceu", { exact: false })).toBeVisible();
  await expect(panel.locator(".departure-app-result")).toHaveCount(0);
  await panel.getByRole("button", { name: "Refazer consulta dos aplicativos" }).click();
  await expect(page).not.toHaveURL(`${origin}${path}?avaliacao=${reviewId}`);
  const nextId = new URL(page.url()).searchParams.get("avaliacao");
  if (!nextId) throw new Error("Missing replacement assessment");
  expect(nextId).not.toBe(reviewId);
  await expect(panel.getByText("Resposta pendente.", { exact: true })).toHaveCount(5);
  await cancelDepartureReview(db, actor.id, nextId);
});
