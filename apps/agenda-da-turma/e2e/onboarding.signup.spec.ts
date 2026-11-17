import { getAppUrl } from "@informach/config/domains";
import { expect, test } from "@playwright/test";
import { browserFamily, enterAgenda, family } from "./fixtures/compasso";

test("a child already registered centrally is activated without duplicating the person", async ({
  page,
}) => {
  const f = await browserFamily();
  const person = await family.createPerson(f.id, {
    groupId: f.groupId,
    kind: "dependent",
    displayName: "Clara fictícia",
  });
  await enterAgenda(page, f);
  await page.goto("/familia");
  await page.getByRole("button", { name: /Adicionar criança/ }).click();
  const dialog = page.getByRole("dialog", { name: "Adicionar criança à Agenda" });
  await expect(page.getByRole("dialog").getByRole("combobox")).toBeEnabled();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox", { name: "Criança", exact: true }).selectOption(person.id);
  await dialog.getByLabel("Data de nascimento (opcional)").fill("2017-03-15");
  await dialog.getByRole("button", { name: "Adicionar à Agenda", exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("article", { name: "Clara fictícia" })).toBeVisible();
  expect(
    (await family.listPeople(f.id, f.groupId)).filter((p) => p.kind === "dependent"),
  ).toHaveLength(1);
  expect(
    await family.findPersonProfile(f.id, {
      groupId: f.groupId,
      personId: person.id,
      app: "agenda-da-turma",
    }),
  ).not.toBeNull();
  await page.reload();
  await expect(page.getByRole("article", { name: "Clara fictícia" })).toHaveCount(1);
});

for (const next of [
  "/dashboard",
  "/atividades",
  "https://example.invalid/steal",
  "//example.invalid/steal",
]) {
  test(`old signup forwards only a local destination: ${next}`, async ({ page }) => {
    await page.goto(`/signup?next=${encodeURIComponent(next)}`);
    const expected = next.startsWith("/dashboard") || next === "/atividades" ? next : "/dashboard";
    await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(expected)}$`));
    await expect(page.getByLabel("Senha", { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Continuar com minha conta", exact: true }),
    ).toBeVisible();
  });
}

for (const [cycle, product] of [
  ["mensal", "compasso_monthly"],
  ["anual", "compasso_annual"],
] as const) {
  test(`old plan links keep ${cycle} through Agenda and central login`, async ({ page }) => {
    const f = await browserFamily();
    await enterAgenda(page, f);
    await page.goto(`/signup?plan=pro&cycle=${cycle}`);
    const central = getAppUrl("conta", "development");
    await expect(page).toHaveURL(`${central}/?familia=${f.groupId}&plano=${cycle}#compasso`);
    await expect(page.getByRole("combobox", { name: "Periodicidade", exact: true })).toHaveValue(
      product,
    );
    await expect(page.getByRole("button", { name: "Continuar para pagamento" })).toBeDisabled();
    await page.context().clearCookies();
    await page.goto(`${central}/?familia=${f.groupId}&plano=${cycle}`);
    await expect(page).toHaveURL(/\/entrar\?next=/);
    await page.getByLabel("E-mail", { exact: true }).fill(f.email);
    await page.getByLabel("Senha", { exact: true }).fill(f.password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page).toHaveURL(`${central}/?familia=${f.groupId}&plano=${cycle}`);
    await expect(page.getByRole("combobox", { name: "Periodicidade", exact: true })).toHaveValue(
      product,
    );
  });
}

test("billing opens the selected family's central account", async ({ page }) => {
  const f = await browserFamily();
  await enterAgenda(page, f);
  await page.goto("/settings/billing");
  await expect(page).toHaveURL(`${getAppUrl("conta", "development")}/?familia=${f.groupId}`);
  await expect(page.getByRole("heading", { name: "Compasso", exact: true })).toBeVisible();
});
