import { randomBytes, randomUUID } from "node:crypto";
import { startCompassoTrial } from "@informach/billing/compasso";
import { getAppUrl } from "@informach/config/domains";
import { db, eq } from "@informach/db";
import { users } from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { expect, test } from "@playwright/test";

test("Bora player pairs a separate phone and central sign-out revokes its credential", async ({
  page,
  browser,
}, testInfo) => {
  test.skip(process.env.COMPASSO_TEST_APP !== "bora-treinar", "Bora pairing journey");
  const central = getAppUrl("conta", "development");
  const origin = getAppUrl("bora-treinar", "development");
  const email = `${randomUUID()}@example.test`;
  const password = randomBytes(24).toString("hex");
  await page.context().setExtraHTTPHeaders({
    "X-Real-IP": `198.51.100.${testInfo.project.name === "desktop" ? 86 : 87}`,
  });
  expect(
    (
      await page.request.post(`${central}/api/auth/sign-up/email`, {
        headers: { Origin: central },
        data: { email, password, name: "Adulto do pareamento" },
      })
    ).ok(),
  ).toBe(true);
  const [actor] = await db
    .update(users)
    .set({ emailVerified: true })
    .where(eq(users.email, email))
    .returning({ id: users.id });
  if (!actor) throw new Error("Missing synthetic actor");
  const family = createFamilyService({ db });
  const group = await family.createGroup(actor.id, "Família do treino");
  const person = await family.createPerson(actor.id, {
    groupId: group.id,
    kind: "dependent",
    displayName: "Perfil do treino",
  });
  await startCompassoTrial(
    { db, trialHashSecret: process.env.COMPASSO_TRIAL_HASH_SECRET ?? "" },
    actor.id,
    group.id,
  );
  expect(
    (
      await page.request.post(`${central}/api/auth/sign-in/email`, {
        headers: { Origin: central },
        data: { email, password },
      })
    ).ok(),
  ).toBe(true);
  await page.goto("/entrar?next=%2Fperfis");
  await page.getByRole("button", { name: "Continuar com minha conta", exact: true }).click();
  await expect(page).toHaveURL(`${origin}/perfis`);
  await test.step("Do not accept a selection before the form has hydrated", async () => {
    let release = () => {};
    const scripts = new Promise<void>((resolve) => {
      release = resolve;
    });
    const routePattern = "**/_next/static/**/*.js";
    await page.route(routePattern, async (route) => {
      await scripts;
      await route.continue();
    });
    try {
      await page.reload({ waitUntil: "commit" });
      await expect(page.getByRole("combobox", { name: "Pessoa", exact: true })).toBeDisabled();
      await expect(
        page.getByRole("button", { name: "Ativar no Bora Treinar", exact: true }),
      ).toBeDisabled();
    } finally {
      release();
    }
    await expect(page.getByRole("combobox", { name: "Pessoa", exact: true })).toBeEnabled();
    await page.unroute(routePattern);
  });
  await page.getByRole("combobox", { name: "Pessoa", exact: true }).selectOption(person.id);
  await page.getByRole("button", { name: "Ativar no Bora Treinar", exact: true }).click();
  await page.getByRole("button", { name: "Começar", exact: true }).click();
  await expect(page).toHaveURL(`${origin}/inicio`);
  const allocation = page.waitForResponse(
    (response) =>
      response.url() === `${origin}/api/pareamento/criar` && response.request().method() === "POST",
  );
  await page.goto("/treinar?ref=catalogo%3Aprimeiro-treino&modo=pareado");
  const response = await allocation;
  expect(response.status()).toBe(200);
  const channel = (await response.json()) as { codigo: string; canalId: string };
  await expect(page.getByLabel("Código QR do pareamento")).toBeVisible();
  expect(
    (
      await page.request.post(`${origin}/api/pareamento/criar`, {
        headers: { Origin: "https://untrusted.example.test" },
        data: {},
      })
    ).status(),
  ).toBe(403);
  const phone = await browser.newContext();
  try {
    expect(
      (
        await phone.request.post(`${origin}/api/pareamento/entrar`, {
          headers: { Origin: origin },
          data: { codigo: channel.codigo },
        })
      ).status(),
    ).toBe(200);
    const credential = (await phone.cookies()).find((cookie) => cookie.name === "bt-par");
    expect(credential).toMatchObject({ httpOnly: true, path: "/api/pareamento" });
    expect(
      (
        await phone.request.post(`${origin}/api/pareamento/eventos`, {
          headers: { Origin: origin },
          data: { tipo: "ola" },
        })
      ).status(),
    ).toBe(200);
    await expect(page.getByText("Celular conectado. Pode treinar!", { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("bora-pairing.png"), fullPage: true });
    expect(
      (
        await page.request.post(`${central}/api/auth/sign-out`, {
          headers: { Origin: central },
          data: {},
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await phone.request.post(`${origin}/api/pareamento/eventos`, {
          headers: { Origin: origin },
          data: { tipo: "ola" },
        })
      ).status(),
    ).toBe(401);
  } finally {
    await phone.close();
  }
});
