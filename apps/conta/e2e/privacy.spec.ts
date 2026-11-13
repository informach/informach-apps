import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { getAppUrl } from "@informach/config/domains";
import { and, db, eq, inArray } from "@informach/db";
import { creditLedger, events, sessions, users } from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { expect, test } from "@playwright/test";

test("downloads authorized account data with fresh login and bounded requests", async ({
  page,
}, testInfo) => {
  if (process.env.COMPASSO_ISOLATED_DATABASE !== "1")
    throw new Error("Disposable database required");
  const origin = getAppUrl("conta", "development");
  const endpoint = "/api/account/export";
  const anonymous = await page.request.get(endpoint, { maxRedirects: 0 });
  expect(anonymous.status()).toBe(303);
  expect(anonymous.headers().location).toBe(`${origin}/?privacidade=recente#privacidade`);
  const email = `${randomUUID()}@example.test`;
  const password = randomBytes(24).toString("hex");
  await page.context().setExtraHTTPHeaders({
    "X-Real-IP": testInfo.project.name === "desktop" ? "198.51.100.81" : "198.51.100.82",
  });
  const signup = await page.request.post("/api/auth/sign-up/email", {
    headers: { Origin: origin },
    data: { email, password, name: "Conta de exportação" },
  });
  expect(signup.ok()).toBeTruthy();
  const [actor] = await db
    .update(users)
    .set({ emailVerified: true })
    .where(eq(users.email, email))
    .returning({ id: users.id });
  if (!actor) throw new Error("Missing synthetic account");
  const family = createFamilyService({ db });
  const group = await family.createGroup(actor.id, "Família da exportação");
  await db.insert(creditLedger).values(
    Array.from({ length: 205 }, () => ({
      ownerType: "family" as const,
      ownerId: group.id,
      app: "compasso",
      entryType: "promo_grant" as const,
      amount: 1,
      metadata: { note: "PRIVATE_INTERNAL_PAYLOAD" },
    })),
  );
  await page.goto("/entrar");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(origin);

  const foreign = await page.request.get(endpoint, {
    headers: { Origin: "https://foreign.example", "Sec-Fetch-Site": "cross-site" },
    maxRedirects: 0,
  });
  expect(foreign.status()).toBe(403);
  expect(await foreign.text()).not.toContain(email);
  // A refreshed application session must not make a stale credential entry fresh.
  await db
    .update(sessions)
    .set({ createdAt: new Date(Date.now() - 16 * 60_000) })
    .where(and(eq(sessions.userId, actor.id), eq(sessions.originApp, "conta")));
  await page.getByRole("link", { name: "Baixar dados da conta" }).click();
  await page.waitForURL("**/?privacidade=recente#privacidade");
  const privacy = page.locator("#privacidade");
  await expect(privacy.getByRole("status")).toContainText("Entre novamente");
  await privacy.getByRole("link", { name: "Confirmar minha entrada" }).click();
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(`${origin}/#privacidade`);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Baixar dados da conta" }).click();
  const download = await downloadPromise;
  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toBe("minha-conta.json");
  const path = await download.path();
  if (!path) throw new Error("Missing downloaded fixture");
  const text = await readFile(path, "utf8");
  const data = JSON.parse(text);
  expect(data.scope).toBe("shared-account-and-compasso");
  expect(data.completedAt).toEqual(expect.any(String));
  expect(text).toContain(email);
  expect(text.match(/"type":"promo_grant"/g)).toHaveLength(205);
  for (const hidden of ["PRIVATE_INTERNAL_PAYLOAD", password, "tokenHash", "passwordHash"])
    expect(text).not.toContain(hidden);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await privacy.screenshot({ path: testInfo.outputPath("privacy.png") });
  for (let index = 0; index < 3; index++) {
    const response = await page.request.get(endpoint);
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toBe("private, no-store");
    expect((await response.json()).completedAt).toEqual(expect.any(String));
  }
  const limited = await page.request.get(endpoint, { maxRedirects: 0 });
  expect(limited.status()).toBe(303);
  expect(limited.headers().location).toBe(`${origin}/?privacidade=limite#privacidade`);
  const audit = await db
    .select({ type: events.eventType, payload: events.payload })
    .from(events)
    .where(
      and(
        eq(events.actorId, actor.id),
        inArray(events.eventType, ["user.data_export_started", "user.data_export_completed"]),
      ),
    );
  expect(audit.filter((event) => event.type === "user.data_export_started")).toHaveLength(4);
  expect(audit.filter((event) => event.type === "user.data_export_completed")).toHaveLength(4);
  expect(
    audit.every((event) => JSON.stringify(event.payload) === '{"scope":"compasso-account"}'),
  ).toBe(true);
  await db.delete(sessions).where(eq(sessions.userId, actor.id));
  const revoked = await page.request.get(endpoint, { maxRedirects: 0 });
  expect(revoked.status()).toBe(303);
  expect(revoked.headers().location).toBe(`${origin}/?privacidade=recente#privacidade`);
});
