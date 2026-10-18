import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { db, eq } from "@informach/db";
import {
  customers,
  missaoLabExecutions,
  missaoProfiles,
  subscriptions,
  users,
} from "@informach/db/schema";
import { expect, type Page, test } from "@playwright/test";
import { enterStudy, parentLogin, prepareProfile, startMission } from "./family-helpers";

async function setup(page: Page, baseURL?: string) {
  if (!baseURL) throw new Error("Missing isolated origin");
  const email = `lab-${randomUUID()}@example.test`;
  const password = "Laboratorio-Local-2026!";
  const client = createHash("sha256").update(test.info().testId).digest();
  const headers = { origin: baseURL, "x-real-ip": `198.19.${client[0]}.${client[1]}` };
  await page.setExtraHTTPHeaders({ "x-real-ip": headers["x-real-ip"] });
  const signup = await page.request.post("/api/auth/sign-up/email", {
    headers,
    data: { email, password, name: "Laboratório local" },
  });
  expect(signup.ok(), await signup.text()).toBe(true);
  await db.update(users).set({ emailVerified: true }).where(eq(users.email, email));
  const login = await page.request.post("/api/auth/sign-in/email", {
    headers,
    data: { email, password },
  });
  expect(login.ok(), await login.text()).toBe(true);
  await prepareProfile(page, "Lua", "6", "canguru-e");
  await enterStudy(page, "Lua");
  return { email };
}
const lab = (page: Page) => page.getByRole("region", { name: "Experiência do laboratório" });
async function saved(page: Page) {
  await lab(page).getByRole("button", { name: "Salvar agora", exact: true }).click();
  await expect(lab(page).getByText("Salvo na conta.", { exact: true })).toBeVisible();
}
async function paidFamily(email: string) {
  const [owner] = await db.select().from(users).where(eq(users.email, email));
  if (!owner) throw new Error("Missing owner");
  const [customer] = await db
    .insert(customers)
    .values({
      provider: "stripe",
      providerCustomerId: `cus_lab_${randomUUID()}`,
      subjectType: "user",
      subjectId: owner.id,
      app: "missao-saber",
      email,
    })
    .returning();
  if (!customer) throw new Error("Missing customer");
  await db.insert(subscriptions).values({
    customerId: customer.id,
    productId: "missao_family_monthly",
    provider: "stripe",
    providerSubscriptionId: `sub_lab_${randomUUID()}`,
    providerPriceId: "price_local",
    status: "active",
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 86_400_000),
  });
  return owner.id;
}

test("fractions support keyboard, equivalent answers, persistence and immutable notebook round trip", async ({
  page,
  baseURL,
}) => {
  await setup(page, baseURL);
  await page.goto("/laboratorio");
  await page.getByRole("button", { name: "Começar investigação", exact: true }).click();
  await lab(page).locator("textarea").first().fill("Vou cobrir metade do inteiro.");
  await lab(page).getByRole("button", { name: "Experimentar", exact: true }).click();
  const piece = lab(page).getByRole("button", { name: /^Faixa A, parte 4:/ });
  await piece.focus();
  await page.keyboard.press("Space");
  await expect(piece).toHaveAttribute("aria-pressed", "true");
  const answer = lab(page).getByLabel("Parte pintada do inteiro A", { exact: true });
  await answer.fill("12");
  await answer.evaluate((field: HTMLInputElement) => field.setSelectionRange(1, 1));
  await lab(page).getByRole("button", { name: "Inserir barra de fração", exact: true }).click();
  await expect(answer).toHaveValue("1/2");
  await expect(answer).toBeFocused();
  await lab(page).getByRole("button", { name: "Conferir a investigação", exact: true }).click();
  await expect(lab(page).getByText(/Sua ideia confere/)).toBeVisible();
  await answer.fill("0,5");
  await lab(page).getByRole("button", { name: "Conferir a investigação", exact: true }).click();
  await expect(lab(page).getByText(/Sua ideia confere/)).toBeVisible();
  await saved(page);
  const url = page.url();
  const executionId = new URL(url).searchParams.get("exec");
  if (!executionId) throw new Error("Missing execution ID");
  await db
    .update(missaoLabExecutions)
    .set({ updatedAt: new Date("2000-01-01T12:00:00Z") })
    .where(eq(missaoLabExecutions.id, executionId));
  await page.reload();
  await expect(lab(page).getByLabel("Parte pintada do inteiro A", { exact: true })).toHaveValue(
    "0,5",
  );
  await expect(lab(page).getByRole("button", { name: /^Faixa A, parte 4:/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await lab(page).getByRole("button", { name: "Guardar no caderno", exact: true }).click();
  await expect(lab(page).getByText("Cópia desta investigação guardada no caderno.")).toBeVisible();
  await lab(page)
    .getByRole("button", { name: /^Faixa A, parte 4:/ })
    .click();
  await saved(page);
  await lab(page).getByRole("button", { name: "Voltar à biblioteca", exact: true }).click();
  await expect(page.getByText("Salva em 01/01/2000", { exact: true })).toHaveCount(0);
  const [savedRun] = await db
    .select({ updatedAt: missaoLabExecutions.updatedAt })
    .from(missaoLabExecutions)
    .where(eq(missaoLabExecutions.id, executionId));
  if (!savedRun) throw new Error("Missing saved execution");
  await expect(
    page.getByText(
      `Salva em ${savedRun.updatedAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`,
      { exact: true },
    ),
  ).toBeVisible();
  await page.goto("/caderno");
  await page.getByText("Investigação: O tamanho de uma parte", { exact: true }).click();
  await page.getByRole("link", { name: "Reabrir a montagem guardada", exact: true }).click();
  await page.getByRole("button", { name: "Abrir uma cópia desta montagem", exact: true }).click();
  await expect(page).not.toHaveURL(url);
  await expect(lab(page).getByRole("button", { name: /^Faixa A, parte 4:/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  expect(overflow).toBe(false);
  const screenshotDir = resolve("tmp/laboratory");
  mkdirSync(screenshotDir, { recursive: true });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({
    path: resolve(screenshotDir, `fractions-${test.info().project.name}.png`),
    fullPage: true,
  });
});

test("mission answer survives exploration and repeated opening uses the latest saved state", async ({
  page,
  baseURL,
}) => {
  await setup(page, baseURL);
  await startMission(page).click();
  const choice = page.getByRole("radio").first();
  await choice.check();
  await page
    .getByRole("button", { name: "Explorar: Frações e inteiro de referência", exact: true })
    .click();
  await lab(page).locator("textarea").first().fill("Minha hipótese fica guardada.");
  const predictionId = await lab(page).locator("textarea").first().getAttribute("id");
  if (!predictionId) throw new Error("Missing persistent execution identity");
  await lab(page).getByRole("button", { name: "Voltar à questão", exact: true }).click();
  await expect(choice).toBeChecked();
  await page
    .getByRole("button", { name: "Explorar: Frações e inteiro de referência", exact: true })
    .click();
  await expect(lab(page).locator("textarea").first()).toHaveValue("Minha hipótese fica guardada.");
  await lab(page).getByRole("button", { name: "Guardar no caderno", exact: true }).click();
  await lab(page).getByRole("link", { name: "Abrir meu caderno", exact: true }).click();
  await page.getByText("Da missão: O tamanho de uma parte", { exact: true }).click();
  await page.getByRole("link", { name: "Revisitar missão", exact: true }).click();
  await expect(page.getByRole("radio").first()).toBeChecked();
  await page
    .getByRole("button", { name: "Explorar: Frações e inteiro de referência", exact: true })
    .click();
  await expect(lab(page).locator("textarea").first()).toHaveValue("Minha hipótese fica guardada.");
  await expect(lab(page).locator("textarea").first()).toHaveAttribute("id", predictionId);
  await lab(page).getByRole("button", { name: "Voltar à questão", exact: true }).click();
  await page.getByRole("button", { name: "Conferir minha ideia", exact: true }).click();
  await expect(
    page.getByText("Esta tentativa foi registrada com apoio de pistas.", { exact: true }),
  ).toBeVisible();
});

test("two tabs expose conflicts and preserve the second investigation as a copy", async ({
  page,
  context,
  baseURL,
}) => {
  await setup(page, baseURL);
  await page.goto("/laboratorio");
  await page.getByRole("button", { name: "Começar investigação", exact: true }).click();
  await expect(lab(page)).toBeVisible();
  await expect(page).toHaveURL(/\/laboratorio\?exec=[a-f0-9-]+$/);
  const second = await context.newPage();
  await second.goto(page.url());
  await expect(lab(second)).toBeVisible();
  await lab(page).locator("textarea").first().fill("Versão da primeira aba");
  await saved(page);
  await lab(second).locator("textarea").first().fill("Minha hipótese da segunda aba");
  await lab(second).getByRole("button", { name: "Salvar agora", exact: true }).click();
  await expect(lab(second).getByText(/Outra aba ou aparelho salvou uma versão nova/)).toBeVisible();
  await lab(second).getByRole("button", { name: "Guardar em uma cópia", exact: true }).click();
  await expect(lab(second).locator("textarea").first()).toHaveValue(
    "Minha hipótese da segunda aba",
  );
  await expect(second).not.toHaveURL(page.url());
  await page.reload();
  await expect(lab(page).locator("textarea").first()).toHaveValue("Versão da primeira aba");
  await second.close();
});

test("recovers an unsent local draft after reload and retries the real save", async ({
  page,
  baseURL,
}) => {
  await setup(page, baseURL);
  await page.goto("/laboratorio");
  await page.getByRole("button", { name: "Começar investigação", exact: true }).click();
  await expect(lab(page)).toBeVisible();
  await expect(page).toHaveURL(/\/laboratorio\?exec=/);
  await page.route("**/laboratorio?exec=*", (route) =>
    route.request().method() === "POST" ? route.abort("internetdisconnected") : route.continue(),
  );
  await lab(page).locator("textarea").first().fill("Minha previsão escrita sem conexão.");
  await lab(page).getByRole("button", { name: "Salvar agora", exact: true }).click();
  await expect(lab(page).getByText(/Sem conexão para salvar na conta/)).toBeVisible();
  await page.reload();
  await expect(
    lab(page).getByRole("button", { name: "Recuperar rascunho", exact: true }),
  ).toBeVisible();
  await lab(page).getByRole("button", { name: "Recuperar rascunho", exact: true }).click();
  await expect(lab(page).locator("textarea").first()).toHaveValue(
    "Minha previsão escrita sem conexão.",
  );
  await page.unroute("**/laboratorio?exec=*");
  await saved(page);
  await page.reload();
  await expect(lab(page).locator("textarea").first()).toHaveValue(
    "Minha previsão escrita sem conexão.",
  );
});

test("profile changes save pending work and keep each school band isolated", async ({
  page,
  baseURL,
}) => {
  const { email } = await setup(page, baseURL);
  await paidFamily(email);
  await parentLogin(page, email, "Laboratorio-Local-2026!");
  await prepareProfile(page, "Sol", "3", "canguru-p");
  await enterStudy(page, "Sol", true);
  await page.goto("/laboratorio");
  await page.getByRole("button", { name: "Começar investigação", exact: true }).click();
  await expect(lab(page)).toBeVisible();
  await expect(page).toHaveURL(/\/laboratorio\?exec=/);
  const url = page.url();
  await lab(page).locator("textarea").first().fill("Previsão do perfil Sol.");
  await page.getByRole("button", { name: /Trocar de estudante/ }).click();
  await page.getByRole("button", { name: /^Lua/ }).click();
  await expect(page.getByRole("heading", { name: "Olá, Lua." })).toBeVisible();
  await page.goto(url);
  await expect(
    page.getByText("Experiência não encontrada neste perfil.", { exact: false }),
  ).toBeVisible();
  await expect(lab(page)).toHaveCount(0);
  await page.getByRole("button", { name: /Trocar de estudante/ }).click();
  await page.getByRole("button", { name: /^Sol/ }).click();
  await expect(page.getByRole("heading", { name: "Olá, Sol." })).toBeVisible();
  await page.goto(url);
  await expect(lab(page).locator("textarea").first()).toHaveValue("Previsão do perfil Sol.");
  await lab(page).locator("textarea").first().fill("Vou contar antes de agrupar.");
  // Navigation through the app saves before leaving the editor.
  await page.locator('a[href="/jornada"]:visible').first().click();
  await expect(page).toHaveURL(/\/jornada$/);
  await page.goto(url);
  await expect(lab(page).locator("textarea").first()).toHaveValue("Vou contar antes de agrupar.");
});

test("a committed notebook save with a lost response cannot swallow a later edited snapshot", async ({
  page,
  baseURL,
}) => {
  await setup(page, baseURL);
  await page.goto("/laboratorio");
  await page.getByRole("button", { name: "Começar investigação", exact: true }).click();
  await lab(page).locator("textarea").first().fill("Primeira previsão preservada.");
  let dropResponse = true;
  await page.route("**/laboratorio?exec=*", async (route) => {
    if (
      dropResponse &&
      route.request().method() === "POST" &&
      route.request().postData()?.includes('"noteId"')
    ) {
      dropResponse = false;
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      await route.abort("connectionreset");
    } else await route.continue();
  });
  await lab(page).getByRole("button", { name: "Guardar no caderno", exact: true }).click();
  await expect(lab(page).getByText(/Não foi possível concluir/)).toBeVisible();
  expect(dropResponse).toBe(false);
  await lab(page).locator("textarea").first().fill("Segunda previsão preservada.");
  await lab(page).getByRole("button", { name: "Guardar no caderno", exact: true }).click();
  await expect(lab(page).getByText("Cópia desta investigação guardada no caderno.")).toBeVisible();
  await page.unroute("**/laboratorio?exec=*");
  await lab(page).getByRole("link", { name: "Abrir meu caderno", exact: true }).click();
  await expect(page.locator("[data-note-id]")).toHaveCount(2);
  for (const summary of await page.locator("[data-note-id] summary").all()) await summary.click();
  await expect(
    page.getByText("Previsão: Primeira previsão preservada.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Previsão: Segunda previsão preservada.", { exact: true }),
  ).toBeVisible();
});

test("transfer starts with reduced support and remembers an explicit request for help", async ({
  page,
  baseURL,
}) => {
  await setup(page, baseURL);
  await page.goto("/laboratorio");
  await page.getByRole("button", { name: "Começar investigação", exact: true }).click();
  await lab(page).getByRole("button", { name: "Tentar um novo caso", exact: true }).click();
  await expect(lab(page).getByText(/Os resultados calculados ficam guardados/)).toBeVisible();
  await expect(lab(page).getByRole("button", { name: /^Faixa A, parte 1:/ })).toBeVisible();
  await lab(page).getByRole("button", { name: "Mostrar apoio neste caso", exact: true }).click();
  await expect(lab(page).getByText(/Você abriu o apoio deste caso/)).toBeVisible();
  await saved(page);
  await page.reload();
  await expect(lab(page).getByText(/Você abriu o apoio deste caso/)).toBeVisible();
  await expect(
    lab(page).getByRole("button", { name: "Mostrar apoio neste caso", exact: true }),
  ).toHaveCount(0);
});

test("editing and reverting a saved notebook snapshot can create another frozen revision", async ({
  page,
  baseURL,
}) => {
  await setup(page, baseURL);
  await page.goto("/laboratorio");
  await page.getByRole("button", { name: "Começar investigação", exact: true }).click();
  const prediction = lab(page).locator("textarea").first();
  await prediction.fill("Previsão que vou comparar.");
  await lab(page).getByRole("button", { name: "Guardar no caderno", exact: true }).click();
  await expect(lab(page).getByText("Cópia desta investigação guardada no caderno.")).toBeVisible();
  await prediction.fill("Previsão intermediária.");
  await saved(page);
  await prediction.fill("Previsão que vou comparar.");
  await saved(page);
  await lab(page).getByRole("button", { name: "Guardar no caderno", exact: true }).click();
  await expect(lab(page).getByText("Cópia desta investigação guardada no caderno.")).toBeVisible();
  await lab(page).getByRole("link", { name: "Abrir meu caderno", exact: true }).click();
  await expect(page.locator("[data-note-id]")).toHaveCount(2);
  for (const summary of await page.locator("[data-note-id] summary").all()) await summary.click();
  await expect(page.getByText("Previsão: Previsão que vou comparar.", { exact: true })).toHaveCount(
    2,
  );
});

test("a rejected save does not trap the account and discarding drafts requires an explicit choice", async ({
  page,
  baseURL,
}) => {
  const { email } = await setup(page, baseURL);
  await page.goto("/laboratorio");
  await page.getByRole("button", { name: "Começar investigação", exact: true }).click();
  await expect(lab(page)).toBeVisible();
  const [owner] = await db.select().from(users).where(eq(users.email, email));
  if (!owner) throw new Error("Missing local test owner");
  const peer = await page.context().newPage();
  await peer.goto(page.url());
  await expect(lab(peer)).toBeVisible();
  // Simulate access changing on another device while this editor remains open.
  await db
    .update(missaoProfiles)
    .set({ grade: 3, courseId: "canguru-p" })
    .where(eq(missaoProfiles.userId, owner.id));
  await lab(page).locator("textarea").first().fill("Rascunho ainda não enviado.");
  await lab(peer).locator("textarea").first().fill("Rascunho da outra aba.");
  await lab(page).getByRole("button", { name: "Salvar agora", exact: true }).click();
  await expect(lab(page).getByText(/não está disponível na faixa escolar/)).toBeVisible();
  await page.getByRole("button", { name: "Sair da conta", exact: true }).click();
  await expect(page.getByText(/Sua investigação ainda não foi salva/)).toBeVisible();
  await expect(lab(page).locator("textarea").first()).toHaveValue("Rascunho ainda não enviado.");
  await page
    .getByRole("button", { name: "Sair e apagar rascunhos deste aparelho", exact: true })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(peer).toHaveURL(/\/$/);
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter(
        (key) => key.startsWith("missao-lab:") || key.startsWith("missao-answer:"),
      ),
    ),
  ).toEqual([]);
  const session = await page.request.get("/api/auth/get-session");
  expect(await session.json()).toBeNull();
});

for (const track of [
  { grade: 2, courseId: "mirim-1" },
  { grade: 6, courseId: "canguru-e" },
  { grade: 10, courseId: "canguru-j" },
  { grade: 11, courseId: "olitef-n3" },
]) {
  test(`published tools open and transfer without overflow in ${track.courseId}`, async ({
    page,
    baseURL,
  }) => {
    const { email } = await setup(page, baseURL);
    const owner = await paidFamily(email);
    await db.update(missaoProfiles).set(track).where(eq(missaoProfiles.userId, owner));
    await page.goto("/laboratorio");
    const picker = page.getByRole("combobox", { name: "Ferramenta", exact: true });
    const families = await picker
      .locator("option")
      .evaluateAll((options) =>
        options.map((option) => (option as HTMLOptionElement).value).filter(Boolean),
      );
    expect(families.length).toBeGreaterThan(0);
    for (const family of families) {
      await picker.selectOption(family);
      await page.getByRole("button", { name: "Explorar", exact: true }).first().click();
      await lab(page).getByRole("button", { name: "Experimentar", exact: true }).click();
      await expect(lab(page).getByText("Preparando a ferramenta…", { exact: true })).toHaveCount(0);
      await expect(lab(page).getByText(/Não foi possível abrir a ferramenta/)).toHaveCount(0);
      await expect(
        lab(page).locator("svg, input[type=range], input[type=number], table").first(),
      ).toBeVisible();
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
        family,
      ).toBe(false);
      await lab(page).getByRole("button", { name: "Tentar um novo caso", exact: true }).click();
      await expect(
        lab(page).getByRole("button", { name: "Mostrar apoio neste caso", exact: true }),
      ).toBeVisible();
      await lab(page)
        .getByRole("button", { name: "Mostrar apoio neste caso", exact: true })
        .click();
      await expect(lab(page).getByText(/Não foi possível abrir a ferramenta/)).toHaveCount(0);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
        `${family} transfer`,
      ).toBe(false);
      await lab(page).getByRole("button", { name: "Voltar à biblioteca", exact: true }).click();
    }
  });
}

test("advanced algebra and probability tools edit with the keyboard and persist", async ({
  page,
  baseURL,
}) => {
  const { email } = await setup(page, baseURL);
  const owner = await paidFamily(email);
  await db
    .update(missaoProfiles)
    .set({ grade: 11, courseId: "obmep-n3" })
    .where(eq(missaoProfiles.userId, owner));
  for (const family of ["L11", "L13"]) {
    await page.goto("/laboratorio");
    await page.getByRole("combobox", { name: "Ferramenta", exact: true }).selectOption(family);
    await page.getByRole("button", { name: "Explorar", exact: true }).first().click();
    await lab(page).getByRole("button", { name: "Experimentar", exact: true }).click();
    const control = lab(page).locator('input[type="range"], input[type="number"]').first();
    const original = await control.inputValue();
    await control.focus();
    await page.keyboard.press("ArrowUp");
    await expect(control).not.toHaveValue(original);
    const changed = await control.inputValue();
    await saved(page);
    await page.reload();
    await expect(
      lab(page).locator('input[type="range"], input[type="number"]').first(),
    ).toHaveValue(changed);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(
      false,
    );
    const dir = resolve("tmp/laboratory");
    mkdirSync(dir, { recursive: true });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.screenshot({
      path: resolve(dir, `${family}-${test.info().project.name}.png`),
      fullPage: true,
    });
  }
});
