import { randomBytes, randomUUID } from "node:crypto";
import { getCollectionApps } from "@informach/config/collections";
import { getAppUrl } from "@informach/config/domains";
import { db, eq } from "@informach/db";
import { sessions, users } from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { expect, type Page, test } from "@playwright/test";

const runtimeEvents = new WeakMap<Page, { type: string; reason?: string }[]>();
test.beforeEach(async ({ page }) => {
  const events: { type: string; reason?: string }[] = [];
  runtimeEvents.set(page, events);
  page.on("websocket", (socket) => {
    if (new URL(socket.url()).pathname !== "/_next/hmr") return;
    socket.on("framereceived", ({ payload }) => {
      if (typeof payload !== "string" || !payload.startsWith("{") || events.length >= 100) return;
      const message = JSON.parse(payload);
      if (typeof message.type === "string")
        events.push({
          type: message.type,
          reason:
            message.type === "reloadPage" && typeof message.data === "string"
              ? message.data.slice(0, 2000)
              : undefined,
        });
    });
  });
});
test.afterEach(async ({ page }, testInfo) => {
  await testInfo.attach("runtime-events", {
    body: JSON.stringify(runtimeEvents.get(page)),
    contentType: "application/json",
  });
});

const app = getCollectionApps("compasso").find(
  (candidate) => candidate.slug === process.env.COMPASSO_TEST_APP,
);
if (!app) throw new Error("Missing app under test");
const slug = app.slug;
const central = getAppUrl("conta", "development");
const origin = getAppUrl(slug, "development");
const entry = ["cozya", "agenda-da-turma"].includes(slug) ? "/login" : "/entrar";
const destination = slug === "missao-saber" ? "/familia/conta" : "/privacidade";
const childCookies =
  slug === "missao-saber"
    ? ["ms-study", "ms-profile"]
    : slug === "dia-de-estrela"
      ? ["dde-aparelho", "dde-crianca", "dde-pais"]
      : [];

test(`${slug}: central entry, adult handoff, reauthentication and browser sign-out`, async ({
  page,
}, testInfo) => {
  const email = `${randomUUID()}@example.test`;
  const password = randomBytes(24).toString("hex");
  await page.context().setExtraHTTPHeaders({
    "X-Real-IP": `198.51.100.${10 + getCollectionApps("compasso").findIndex((entry) => entry.slug === slug) * 2 + (testInfo.project.name === "desktop" ? 0 : 1)}`,
  });
  async function enterCentralCredentials() {
    await page.getByLabel("E-mail", { exact: true }).fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(password);
    const response = page.waitForResponse(
      (result) =>
        result.url() === `${central}/api/auth/sign-in/email` &&
        result.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    expect((await response).ok(), "Central credential endpoint must succeed").toBe(true);
  }
  const signup = await page.request.post(`${central}/api/auth/sign-up/email`, {
    headers: { Origin: central },
    data: { email, password, name: "Conta sintética" },
  });
  expect(signup.ok()).toBe(true);
  const [user] = await db
    .update(users)
    .set({ emailVerified: true })
    .where(eq(users.email, email))
    .returning({ id: users.id });
  if (!user) throw new Error("Missing synthetic identity");
  if (slug === "missao-saber")
    await createFamilyService({ db }).createGroup(user.id, "Família SSO");
  await page.context().addCookies(
    childCookies.map((name) => ({
      name,
      value: randomUUID(),
      url: origin,
      httpOnly: true,
      sameSite: "Lax",
    })),
  );

  await page.goto(`${entry}?next=${encodeURIComponent(destination)}`);
  await expect(page.getByLabel("Senha", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Continuar com minha conta", exact: true }),
  ).toBeEnabled();
  await page.screenshot({ caret: "initial", path: testInfo.outputPath(`${slug}-login.png`) });
  await page.getByRole("button", { name: "Continuar com minha conta", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`^${central}/entrar\\?`));
  await enterCentralCredentials();
  await expect(page).toHaveURL(`${origin}${destination}`, { timeout: 90_000 });
  const session = await (await page.request.get("/api/auth/get-session")).json();
  expect(session.user.id).toBe(user.id);
  const [lineage] = await db.select().from(sessions).where(eq(sessions.id, session.session.id));
  expect(lineage?.originApp).toBe(slug);
  expect(lineage?.parentSessionId).toBeTruthy();
  expect(
    (await page.context().cookies()).filter((cookie) => childCookies.includes(cookie.name)),
  ).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ caret: "initial", path: testInfo.outputPath(`${slug}-entry.png`) });

  // A recent callback cannot renew an hour-old authentication. Reconfirmation
  // really opens central credentials and binds a newly authenticated root.
  if (!lineage?.parentSessionId) throw new Error("Missing central session lineage");
  await db
    .update(sessions)
    .set({ createdAt: new Date(Date.now() - 3_600_000) })
    .where(eq(sessions.id, lineage.parentSessionId));
  await page.goto(`${entry}?reautenticar=1&next=${encodeURIComponent(destination)}`);
  await page.getByRole("button", { name: "Confirmar minha identidade", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`^${central}/entrar\\?`));
  await enterCentralCredentials();
  await expect(page).toHaveURL(`${origin}${destination}`);
  const nextSession = await (await page.request.get("/api/auth/get-session")).json();
  const [nextLineage] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.id, nextSession.session.id));
  expect(nextLineage?.parentSessionId).not.toBe(lineage.parentSessionId);
  expect(
    await db.select().from(sessions).where(eq(sessions.id, lineage.parentSessionId)),
  ).toHaveLength(0);
  expect(await db.select().from(sessions).where(eq(sessions.id, lineage.id))).toHaveLength(0);

  for (const path of ["sign-up/email", "sign-in/email", "delete-user", "update-user"]) {
    const result = await page.request.post(`/api/auth/${path}`, {
      headers: { Origin: origin },
      data: { email, password, name: "Identidade bloqueada" },
    });
    expect(result.status()).toBe(403);
  }
  const signout = await page.request.post("/api/auth/sign-out", {
    headers: { Origin: origin },
    data: {},
  });
  expect(signout.ok()).toBe(true);
  expect(await (await page.request.get(`${central}/api/auth/get-session`)).json()).toBeNull();
  expect(await (await page.request.get("/api/auth/get-session")).json()).toBeNull();
  await page.goto(`${entry}?next=${encodeURIComponent(destination)}`);
  await page.getByRole("button", { name: "Continuar com minha conta", exact: true }).click();
  await expect(page.getByLabel("Senha", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`^${central}/entrar\\?`));
});
