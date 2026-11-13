import { randomBytes, randomUUID } from "node:crypto";
import { getAppUrl } from "@informach/config/domains";
import { and, db, eq } from "@informach/db";
import { boraProfiles, familyAppProfiles, users } from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { expect, test } from "@playwright/test";

test("Bora activates central people and keeps family contexts separate", async ({
  page,
}, testInfo) => {
  test.skip(process.env.COMPASSO_TEST_APP !== "bora-treinar", "Bora domain journey");
  const central = getAppUrl("conta", "development");
  const origin = getAppUrl("bora-treinar", "development");
  const email = `${randomUUID()}@example.test`;
  const password = randomBytes(24).toString("hex");
  await page.context().setExtraHTTPHeaders({
    "X-Real-IP": `198.51.100.${testInfo.project.name === "desktop" ? 80 : 81}`,
  });
  expect(
    (
      await page.request.post(`${central}/api/auth/sign-up/email`, {
        headers: { Origin: central },
        data: { email, password, name: "Adulto dos perfis" },
      })
    ).ok(),
  ).toBe(true);
  const [user] = await db
    .update(users)
    .set({ emailVerified: true })
    .where(eq(users.email, email))
    .returning({ id: users.id });
  if (!user) throw new Error("Missing synthetic account");
  const family = createFamilyService({ db });
  const first = await family.createGroup(user.id, "Família da semana");
  const second = await family.createGroup(user.id, "Família do fim de semana");
  const person = await family.createPerson(user.id, {
    groupId: first.id,
    kind: "dependent",
    displayName: "Ana compartilhada",
  });
  await family.createPerson(user.id, {
    groupId: second.id,
    kind: "dependent",
    displayName: "Outro contexto",
  });
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
  await expect(page).toHaveURL(`${origin}/contexto`, { timeout: 90000 });
  await page.getByRole("combobox", { name: "Família", exact: true }).selectOption(first.id);
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await page.getByRole("combobox", { name: "Pessoa", exact: true }).selectOption(person.id);
  await page.getByRole("button", { name: "Ativar no Bora Treinar", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Oi, Ana compartilhada!" })).toBeVisible();
  const [native] = await db
    .select({ id: boraProfiles.id, familyProfileId: boraProfiles.familyProfileId })
    .from(boraProfiles)
    .innerJoin(familyAppProfiles, eq(familyAppProfiles.id, boraProfiles.familyProfileId))
    .where(and(eq(familyAppProfiles.groupId, first.id), eq(familyAppProfiles.personId, person.id)));
  expect(native?.familyProfileId).toBeTruthy();
  if (!native) throw new Error("Missing activation");
  await family.updatePerson(user.id, {
    groupId: first.id,
    personId: person.id,
    expectedVersion: 1,
    displayName: "Ana Maria",
    color: "#123456",
    avatar: "person",
  });
  await page.goto("/perfis");
  await expect(page.getByRole("button", { name: /Ana Maria/ })).toBeVisible();
  await page.getByRole("button", { name: /Mais perfis no Compasso/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver Compasso na Minha conta" })).toHaveAttribute(
    "href",
    `${central}/?familia=${first.id}#compasso`,
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(`${origin}/perfis`);
  await page.getByRole("link", { name: /trocar família/ }).click();
  await page.getByRole("combobox", { name: "Família", exact: true }).selectOption(second.id);
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.getByRole("option", { name: "Outro contexto", exact: true })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /Ana Maria/ })).toHaveCount(0);
  expect((await page.context().cookies()).some((cookie) => cookie.name === "bt-perfil")).toBe(
    false,
  );
  expect(
    await db
      .select({ id: boraProfiles.id })
      .from(boraProfiles)
      .where(eq(boraProfiles.id, native.id)),
  ).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("bora-context.png"), fullPage: true });
});
