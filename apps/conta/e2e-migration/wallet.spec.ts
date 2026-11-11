import { randomBytes, randomUUID } from "node:crypto";
import { getAppUrl } from "@informach/config/domains";
import { db, eq } from "@informach/db";
import { creditLedger, creditWalletMigrations, users } from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { expect, test } from "@playwright/test";

test("explicit family destination, stale preview, expiry, receipt and scoped statement", async ({
  page,
}, testInfo) => {
  const origin = getAppUrl("conta", "development");
  const email = `${randomUUID()}@example.test`;
  const password = randomBytes(18).toString("hex");
  await page.context().setExtraHTTPHeaders({
    "X-Real-IP": testInfo.project.name === "desktop" ? "198.51.100.71" : "198.51.100.72",
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
  if (!actor) throw new Error("Missing fixture actor");
  const family = createFamilyService({ db });
  const group = await family.createGroup(actor.id, "Família Oliveira");
  const otherGroup = await family.createGroup(actor.id, "Família anterior");
  await db.insert(creditLedger).values([
    {
      ownerType: "user",
      ownerId: actor.id,
      app: "cozya",
      entryType: "promo_grant",
      amount: 2,
      expiresAt: new Date("2099-01-01T12:00:00Z"),
      metadata: { privateNote: "must-not-reach-migration-browser" },
    },
    {
      ownerType: "user",
      ownerId: actor.id,
      app: "cozya",
      entryType: "promo_grant",
      amount: 3,
      createdAt: new Date("2020-01-01T00:00:00Z"),
      expiresAt: new Date("2021-01-01T00:00:00Z"),
    },
  ]);
  await page.goto("/entrar");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(/\/$/);
  await page.goto(`/?familia=${group.id}#compasso`);
  const section = page.getByRole("region", { name: "Seus créditos anteriores" });
  await section.getByRole("button", { name: "Conferir créditos do Cozya" }).click();
  await expect(section.locator(".migration-equivalence")).toContainText("30");
  await expect(section.locator(".migration-equivalence")).toContainText("Família Oliveira");
  await section.getByText("Ver valores e validade de cada lote", { exact: true }).click();
  await expect(section).toContainText("2099");
  expect(await page.content()).not.toContain("must-not-reach-migration-browser");
  expect(
    await db
      .select()
      .from(creditWalletMigrations)
      .where(eq(creditWalletMigrations.sourceUserId, actor.id)),
  ).toEqual([]);
  await section.screenshot({
    path: testInfo.outputPath("credit-migration-preview.png"),
  });

  // A real concurrent grant invalidates the displayed revision; it is never
  // silently included in the previously accepted transfer.
  await db.insert(creditLedger).values({
    ownerType: "user",
    ownerId: actor.id,
    app: "cozya",
    entryType: "promo_grant",
    amount: 1,
  });
  await section.getByRole("checkbox").check();
  await section.getByRole("button", { name: "Transferir para esta família" }).click();
  await expect(section.getByRole("status")).toContainText("O saldo mudou");
  await expect(section.locator(".migration-equivalence")).toContainText("45");
  await expect(section.getByRole("checkbox")).not.toBeChecked();
  expect(
    await db
      .select()
      .from(creditWalletMigrations)
      .where(eq(creditWalletMigrations.sourceUserId, actor.id)),
  ).toEqual([]);
  await section.getByRole("checkbox").check();
  await section.getByRole("button", { name: "Transferir para esta família" }).click();
  await expect(section).toContainText("Transferida em");
  await expect(page.locator(".wallet-balance")).toContainText("45");
  const receipts = await db
    .select()
    .from(creditWalletMigrations)
    .where(eq(creditWalletMigrations.sourceUserId, actor.id));
  expect(receipts).toHaveLength(1);
  expect(receipts[0]?.groupId).toBe(group.id);
  await page.getByText("Extrato de créditos da família", { exact: true }).click();
  await expect(page.locator(".wallet-history")).toContainText("Transferência de créditos · Cozya");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await section.screenshot({
    path: testInfo.outputPath("credit-migration-receipt.png"),
  });
  await page.goto(`/?familia=${otherGroup.id}#compasso`);
  await expect(page.locator(".wallet-balance")).toContainText("0");
  await expect(page.getByRole("region", { name: "Seus créditos anteriores" })).toContainText(
    "Família Oliveira",
  );
  await expect(page.getByRole("button", { name: "Transferir para esta família" })).toHaveCount(0);
});
