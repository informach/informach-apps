import { createHash, randomUUID } from "node:crypto";
import { startCompassoTrial } from "@informach/billing/compasso";
import { getAppUrl } from "@informach/config/domains";
import { db, eq } from "@informach/db";
import { users } from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { expect, type Page, test } from "@playwright/test";

async function criarConta(page: Page) {
  const central = getAppUrl("conta", "development");
  const email = `${randomUUID()}@example.test`;
  const password = randomUUID();
  const ip = createHash("sha256")
    .update(`${test.info().testId}-${test.info().project.name}`)
    .digest();
  await page.context().setExtraHTTPHeaders({ "x-real-ip": `198.51.${ip[0]}.${ip[1]}` });
  const signup = await page.request.post(`${central}/api/auth/sign-up/email`, {
    headers: { origin: central },
    data: { email, password, name: "Adulto do treino" },
  });
  expect(signup.ok(), await signup.text()).toBe(true);
  const [user] = await db
    .update(users)
    .set({ emailVerified: true })
    .where(eq(users.email, email))
    .returning({ id: users.id });
  if (!user) throw new Error("Missing synthetic adult");
  const family = createFamilyService({ db });
  const group = await family.createGroup(user.id, "Família do treino");
  const person = await family.createPerson(user.id, {
    groupId: group.id,
    kind: "dependent",
    displayName: "Helena",
  });
  await startCompassoTrial(
    { db, trialHashSecret: "isolated-bora-journey-trial".repeat(3) },
    user.id,
    group.id,
  );
  const signin = await page.request.post(`${central}/api/auth/sign-in/email`, {
    headers: { origin: central },
    data: { email, password },
  });
  expect(signin.ok(), await signin.text()).toBe(true);
  await page.goto("/entrar?next=%2Fperfis");
  await page.getByRole("button", { name: "Continuar com minha conta", exact: true }).click();
  await expect(page).toHaveURL(/\/perfis$/);
  return person.id;
}

test("da conta nova ao primeiro treino salvo, contando à mão", async ({ page }) => {
  const personId = await criarConta(page);

  await expect(page.getByRole("heading", { name: "Quem vai treinar?" })).toBeVisible();
  await page.getByRole("combobox", { name: "Pessoa", exact: true }).selectOption(personId);
  await page.getByRole("button", { name: "Ativar no Bora Treinar", exact: true }).click();

  // primeiro acesso: ritmo, tempo e dias por semana
  await expect(page.getByRole("heading", { name: "Oi, Helena!" })).toBeVisible();
  await page.getByText("Já treino às vezes").click();
  await page.getByText("10 min", { exact: true }).click();
  await page.getByRole("button", { name: "Começar", exact: true }).click();
  await expect(page).toHaveURL(/\/inicio$/);
  await expect(page.getByText("Hoje é dia de · Helena")).toBeVisible();
  await expect(page.getByText("de 3 dias")).toBeVisible();

  // O teste central de 14 dias libera os treinos desta família.
  await page.goto(`/treino?ref=${encodeURIComponent("catalogo:hiit-12")}`);
  await expect(page.getByRole("heading", { name: "HIIT 12" })).toBeVisible();
  await expect(page.getByText("Treinando como Helena")).toBeVisible();

  await page.goto(`/treino?ref=${encodeURIComponent("catalogo:primeiro-treino")}`);
  await expect(page.getByRole("heading", { name: "Primeiro treino" })).toBeVisible();
  await page.getByRole("button", { name: /Contar manualmente/ }).click();
  await page.getByRole("button", { name: "Começar treino" }).click();

  // portão: cuidados do primeiro treino, depois começar à mão
  await expect(page).toHaveURL(/\/treinar\?/);
  await page.getByRole("button", { name: "Entendi" }).click();
  await page.getByRole("button", { name: "Começar", exact: true }).click();
  await expect(page.getByRole("button", { name: "+1" })).toBeEnabled({ timeout: 8000 });
  for (let i = 0; i < 6; i++) await page.getByRole("button", { name: "+1" }).click();
  await page.getByRole("button", { name: "Parar o treino" }).click();
  await page.getByRole("button", { name: "Parar e salvar" }).click();

  // como foi? e o resumo no perfil certo
  await page.getByRole("button", { name: /Na medida/ }).click();
  await expect(page.getByRole("heading", { name: "Treino salvo" })).toBeVisible();
  await expect(page.getByText("Salvo no perfil de Helena")).toBeVisible();
  await page.getByRole("link", { name: "Voltar ao início" }).click();
  await page.getByRole("link", { name: "Progresso" }).first().click();
  await expect(page.getByText("Primeiro treino").first()).toBeVisible();
});
