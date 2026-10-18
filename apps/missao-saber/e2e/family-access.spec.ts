import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { db, eq } from "@informach/db";
import { missaoProfiles, missaoStudyDevices, sessions, users } from "@informach/db/schema";
import { expect, type Page, type Response, test } from "@playwright/test";
import {
  closeDevice,
  enterStudy,
  parentLogin,
  prepareProfile,
  startMission,
} from "./family-helpers";

async function parent(page: Page, baseURL: string | undefined) {
  if (!baseURL) throw new Error("Missing isolated URL");
  const client = createHash("sha256").update(test.info().testId).digest();
  const headers = { origin: baseURL, "x-real-ip": `198.20.${client[0]}.${client[1]}` };
  await page.setExtraHTTPHeaders({ "x-real-ip": headers["x-real-ip"] });
  const email = `family-${randomUUID()}@example.test`;
  const data = { email, password: "Missao-Teste-2026-Local!", name: "Responsável local" };
  expect((await page.request.post("/api/auth/sign-up/email", { headers, data })).ok()).toBe(true);
  const [user] = await db
    .update(users)
    .set({ emailVerified: true })
    .where(eq(users.email, email))
    .returning();
  if (!user) throw new Error("Missing owner");
  expect((await page.request.post("/api/auth/sign-in/email", { headers, data })).ok()).toBe(true);
  // Outro aparelho da mesma casa sai pelo mesmo endereço. Sem isto, todo
  // contexto extra caía no balde "unidentified" do limite de códigos de
  // conexão, compartilhado entre os testes da suíte inteira.
  const device = { baseURL, extraHTTPHeaders: { "x-real-ip": headers["x-real-ip"] } };
  return { email, userId: user.id, headers, device };
}

async function cookieExpiry(response: Response, name: string) {
  const header = (await response.headersArray()).find(
    (header) => header.name.toLowerCase() === "set-cookie" && header.value.startsWith(`${name}=`),
  );
  const expires = header?.value.match(/\bexpires=([^;]+)/i)?.[1];
  if (!expires) throw new Error(`Missing expiry for ${name}`);
  const timestamp = new Date(expires).getTime();
  if (!Number.isFinite(timestamp)) throw new Error(`Invalid expiry for ${name}`);
  return timestamp;
}

test("first access, explicit handoff, adult revocation and sibling isolation", async ({
  page,
  browser,
  baseURL,
}) => {
  const owner = await parent(page, baseURL);
  await page.goto("/familia");
  await expect(
    page.getByRole("heading", { name: "Vamos preparar o primeiro estudo." }),
  ).toBeVisible();
  await expect(page.getByText("Seu plano, com clareza")).toHaveCount(0);
  await prepareProfile(page, "Lua");
  const adultCookies = await page.context().cookies();
  const [sibling] = await db
    .insert(missaoProfiles)
    .values({ userId: owner.userId, nickname: "Sol", grade: 6, courseId: "olitef-n1" })
    .returning();
  if (!sibling) throw new Error("Missing sibling");
  await enterStudy(page, "Lua");
  const temporaryCookies = await page.context().cookies();
  expect(temporaryCookies.find((cookie) => cookie.name === "ms-study")?.expires).toBe(-1);
  expect(temporaryCookies.find((cookie) => cookie.name === "ms-profile")?.expires).toBe(-1);
  await expect(page.getByRole("button", { name: /Trocar de estudante/ })).toHaveCount(0);
  await expect(page.getByText("Pode tentar. Pode pedir uma pista.")).toBeVisible();
  await expect(page.getByText(/Seu combinado: 10 minutos/)).toBeVisible();
  await expect(page.getByText("dias com descobertas nesta semana")).toHaveCount(0);
  const stale = await browser.newContext(owner.device);
  try {
    await stale.addCookies(adultCookies);
    expect((await stale.request.get("/api/familia/exportar")).status()).toBe(401);
  } finally {
    await closeDevice(stale);
  }
  expect((await page.request.get("/api/familia/exportar")).status()).toBe(401);
  for (const route of [
    "/familia",
    "/familia/conta",
    "/familia/estudantes",
    "/familia/acompanhamento",
    "/manutencao",
  ]) {
    await page.goto(route);
    await expect(page).toHaveURL(/\/entrar\?/);
  }
  // Cancelling adult unlock leaves the study identity usable.
  await page.getByRole("link", { name: /Sou estudante/ }).click();
  await expect(page.getByRole("heading", { name: "Olá, Lua." })).toBeVisible();
  await page
    .context()
    .addCookies([
      { name: "ms-profile", value: sibling.id, url: baseURL, httpOnly: true, sameSite: "Lax" },
    ]);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Olá, Lua." })).toBeVisible();
  // Even a real start action cannot write to an ungranted sibling.
  const request = page.waitForRequest(
    (request) => request.method() === "POST" && !!request.headers()["next-action"],
  );
  await startMission(page).click();
  const action = await request;
  await expect(page).toHaveURL(/\/missao\//);
  const [learner] = await db
    .select()
    .from(missaoProfiles)
    .where(eq(missaoProfiles.userId, owner.userId));
  if (!learner) throw new Error("Missing learner");
  const forbidden = await page.request.post("/hoje", {
    headers: {
      origin: baseURL ?? "",
      "next-action": action.headers()["next-action"] ?? "",
      "content-type": action.headers()["content-type"] ?? "text/plain",
    },
    data: (action.postData() ?? "").replaceAll(learner.id, sibling.id),
  });
  expect(await forbidden.text()).toContain("PROFILE_CHANGED");
  await parentLogin(page, owner.email, undefined, "/familia/acompanhamento");
  await expect(
    page.getByText(
      "Sugestão inicial da trilha: esta orientação ainda não é baseada em tentativas do estudante.",
    ),
  ).toBeVisible();
  await expect(page.locator('[data-audience="parent"]')).toBeVisible();
});

test("one-use device code, invalid origins, revocation of live actions and safe reconnection", async ({
  page,
  browser,
  baseURL,
}) => {
  const owner = await parent(page, baseURL);
  await prepareProfile(page, "Lua");
  await page.goto("/familia/conta");
  await page.getByLabel("Nome do aparelho").fill("Tablet de casa");
  await page.getByRole("button", { name: "Gerar código de conexão" }).click();
  const issued = page.getByRole("status").filter({ hasText: "Código de conexão" });
  await expect(issued).toBeVisible();
  const code = (await issued.innerText()).match(
    /[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}/,
  )?.[0];
  if (!code) throw new Error("Missing connection code");
  const context = await browser.newContext(owner.device);
  try {
    const learner = await context.newPage();
    const badOrigin = await context.request.post("/api/estudo/conectar", {
      headers: { origin: "https://invalid.example" },
      data: { code },
    });
    expect(badOrigin.status()).toBe(403);
    await learner.goto("/estudar/conectar");
    await learner.getByLabel("Código de conexão").fill("AAAAA-AAAAA");
    await learner.getByRole("button", { name: "Entrar para estudar" }).click();
    await expect(learner.locator("main").getByRole("alert")).toContainText("Confira o código");
    await learner.getByLabel("Código de conexão").fill(code);
    await learner.getByRole("button", { name: "Entrar para estudar" }).click();
    await expect(learner.getByRole("heading", { name: "Olá, Lua." })).toBeVisible();
    const replay = await context.request.post("/api/estudo/conectar", {
      headers: { origin: baseURL ?? "" },
      data: { code },
    });
    expect(replay.status()).toBe(400);
    expect((await context.request.get("/api/familia/exportar")).status()).toBe(401);
    await startMission(learner).click();
    const missionUrl = learner.url();
    const request = learner.waitForRequest(
      (request) => request.method() === "POST" && !!request.headers()["next-action"],
    );
    await learner.getByRole("button", { name: /Quero uma pista/ }).click();
    const hint = await request;
    await expect(learner.getByText(/Pista 1\./)).toBeVisible();
    await page.getByRole("button", { name: "Encerrar conexão de Tablet de casa" }).click();
    await expect(page.getByText("Conexão encerrada", { exact: true })).toBeVisible();
    const blocked = await context.request.post(missionUrl, {
      headers: {
        origin: baseURL ?? "",
        "next-action": hint.headers()["next-action"] ?? "",
        "content-type": hint.headers()["content-type"] ?? "text/plain",
      },
      data: hint.postData() ?? "",
    });
    expect(await blocked.text()).toContain("STUDY_AUTH");
    await learner.reload();
    await expect(learner).toHaveURL(/\/estudar\?next=/);
    const rows = await db
      .select()
      .from(missaoStudyDevices)
      .where(eq(missaoStudyDevices.userId, owner.userId));
    expect(rows.every((row) => row.revokedAt !== null)).toBe(true);
  } finally {
    await closeDevice(context);
  }
});

for (const band of [
  { grade: "3", course: "canguru-p", name: "initial" },
  { grade: "6", course: "olitef-n1", name: "middle" },
  { grade: "10", course: "obmep-n3", name: "secondary" },
]) {
  test(`school band ${band.name}: guided setup, keyboard and mobile layout`, async ({
    page,
    baseURL,
  }) => {
    const owner = await parent(page, baseURL);
    await page.setViewportSize({ width: 390, height: 844 });
    await prepareProfile(page, "Lua", band.grade, band.course);
    await enterStudy(page, "Lua");
    await expect(page.locator(`[data-school-band="${band.name}"]`)).toBeVisible();
    mkdirSync("tmp/family-experience", { recursive: true });
    await page.screenshot({
      path: `tmp/family-experience/study-${band.name}-${test.info().project.name}.png`,
      fullPage: true,
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
    await page.goto("/jornada");
    for (const name of ["Revisar", "Simulados", "Minha atividade", "Minhas preferências"])
      await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Revisar", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/revisao$/);
    await parentLogin(page, owner.email);
    mkdirSync("tmp/family-experience", { recursive: true });
    await page.screenshot({
      path: `tmp/family-experience/parent-${band.name}-${test.info().project.name}.png`,
      fullPage: true,
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    );
  });
}

test("recent adult confirmation returns to account and preserves setup choices", async ({
  page,
  baseURL,
}) => {
  const owner = await parent(page, baseURL);
  await page.goto("/familia/preparar");
  await page.getByLabel("Apelido do estudante").fill("Lua");
  await page.getByLabel("Ano escolar", { exact: true }).selectOption("6");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Continuar para a trilha" }).click();
  await page.locator('input[value="olitef-n1"]').check();
  await page.getByRole("button", { name: "Voltar", exact: true }).click();
  await expect(page.getByLabel("Apelido do estudante")).toHaveValue("Lua");
  await page.getByRole("button", { name: "Continuar para a trilha" }).click();
  await db
    .update(sessions)
    .set({ createdAt: new Date(Date.now() - 11 * 60_000) })
    .where(eq(sessions.userId, owner.userId));
  await page.getByRole("button", { name: "Criar perfil", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Confirmar acesso e continuar o cadastro" }),
  ).toBeVisible();
  await parentLogin(page, owner.email, undefined, "/familia/preparar");
  await expect(page.locator('input[value="olitef-n1"]')).toBeChecked();
  await page.getByRole("button", { name: "Criar perfil", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tudo pronto para Lua." })).toBeVisible();
  await db
    .update(sessions)
    .set({ createdAt: new Date(Date.now() - 11 * 60_000) })
    .where(eq(sessions.userId, owner.userId));
  await page.goto("/familia/conta");
  await expect(page.getByRole("heading", { name: "Conta e escolhas da família." })).toBeVisible();
  await expect(page.getByText("Confirme o acesso do responsável.").first()).toBeVisible();
  expect((await page.request.get("/api/familia/exportar")).status()).toBe(403);
  await parentLogin(page, owner.email, undefined, "/familia/conta");
  expect((await page.request.get("/api/familia/exportar")).status()).toBe(200);
});

test("notebook drafts stay with their student across explicit switching and reload", async ({
  page,
  baseURL,
}) => {
  const owner = await parent(page, baseURL);
  await prepareProfile(page, "Lua");
  await db
    .insert(missaoProfiles)
    .values({ userId: owner.userId, nickname: "Sol", grade: 6, courseId: "olitef-n1" });
  await page.reload();
  await enterStudy(page, "Lua", true);
  await page.goto("/caderno");
  await page.getByLabel("Hoje eu descobri que…").fill("Ideia que Lua ainda está escrevendo.");
  await page.reload();
  await expect(page.getByLabel("Hoje eu descobri que…")).toHaveValue(
    "Ideia que Lua ainda está escrevendo.",
  );
  await page.getByRole("button", { name: /Trocar de estudante/ }).click();
  await page.getByRole("button", { name: /^Sol/ }).click();
  await expect(page.getByRole("heading", { name: "Olá, Sol." })).toBeVisible();
  await page.goto("/caderno");
  await expect(page.getByLabel("Hoje eu descobri que…")).toHaveValue("");
  await page.getByRole("button", { name: /Trocar de estudante/ }).click();
  await page.getByRole("button", { name: /^Lua/ }).click();
  await expect(page.getByRole("heading", { name: "Olá, Lua." })).toBeVisible();
  await page.goto("/caderno");
  await expect(page.getByLabel("Hoje eu descobri que…")).toHaveValue(
    "Ideia que Lua ainda está escrevendo.",
  );
  await page.getByRole("button", { name: "Guardar descoberta", exact: true }).click();
  await expect(page.getByText("Descoberta guardada.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Hoje eu descobri que…")).toHaveValue("");
  await page.getByLabel("Hoje eu descobri que…").fill("Rascunho a limpar na saída.");
  await page.getByRole("button", { name: "Sair da conta", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(
    await page.evaluate(() =>
      Object.keys(sessionStorage).filter((key) => key.startsWith("missao-note:")),
    ),
  ).toEqual([]);
});

test("notebook editing restores its draft after reload and cancels it explicitly", async ({
  page,
  baseURL,
}) => {
  await parent(page, baseURL);
  await prepareProfile(page, "Lua");
  await enterStudy(page, "Lua");
  await page.goto("/caderno");
  await page.getByLabel("Hoje eu descobri que…").fill("Minha descoberta original.");
  await page.getByRole("button", { name: "Guardar descoberta", exact: true }).click();
  await expect(page.getByText("Descoberta guardada.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.getByLabel("Editar descoberta").fill("Minha explicação ainda está sendo escrita.");
  await page.reload();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await expect(page.getByLabel("Editar descoberta")).toHaveValue(
    "Minha explicação ainda está sendo escrita.",
  );
  await page.getByRole("button", { name: "Cancelar edição", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await expect(page.getByLabel("Editar descoberta")).toHaveValue("Minha descoberta original.");
  await page.getByLabel("Editar descoberta").fill("Minha descoberta revisada e confirmada.");
  await page.getByRole("button", { name: "Salvar alteração", exact: true }).click();
  await expect(page.getByText("Alteração guardada.", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await expect(page.getByLabel("Editar descoberta")).toHaveValue(
    "Minha descoberta revisada e confirmada.",
  );
});

test("family overview recognizes laboratory activity before the first scored mission", async ({
  page,
  baseURL,
}) => {
  const owner = await parent(page, baseURL);
  await prepareProfile(page, "Lua", "6", "canguru-e");
  await enterStudy(page, "Lua");
  await page.goto("/laboratorio");
  await page.getByRole("button", { name: "Começar investigação", exact: true }).click();
  const lab = page.getByRole("region", { name: "Experiência do laboratório" });
  await expect(lab).toBeVisible();
  await lab.getByRole("button", { name: "Salvar agora", exact: true }).click();
  await expect(lab.getByText("Salvo na conta.", { exact: true })).toBeVisible();
  await parentLogin(page, owner.email);
  await expect(page.getByText(/Última atividade: Laboratório:/)).toBeVisible();
  await expect(page.getByText("Começou a explorar.", { exact: true })).toBeVisible();
  await expect(page.getByText(/Tudo pronto para começar/)).toHaveCount(0);
  await page.getByRole("link", { name: "Acompanhar Lua", exact: true }).click();
  await expect(
    page.getByText(
      "Sugestão inicial da trilha: esta orientação ainda não é baseada em tentativas do estudante.",
    ),
  ).toBeVisible();
});

for (const selection of ["handoff", "switch"] as const) {
  test(`remembered study keeps the selected sibling after browser restart: ${selection}`, async ({
    page,
    browser,
    baseURL,
  }) => {
    const owner = await parent(page, baseURL);
    await prepareProfile(page, "Lua");
    await db
      .insert(missaoProfiles)
      .values({ userId: owner.userId, nickname: "Sol", grade: 6, courseId: "olitef-n1" });
    await page.reload();
    await page.getByLabel(/Manter o acesso de estudo por até 30 dias/).check();
    const handoff = page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/api/estudo/entrar",
    );
    await enterStudy(page, selection === "handoff" ? "Sol" : "Lua", true);
    const connection = await handoff;
    let selected = connection;
    if (selection === "switch") {
      await page.getByRole("button", { name: /Trocar de estudante/ }).click();
      const switched = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" && !!response.request().headers()["next-action"],
      );
      await page.getByRole("button", { name: /^Sol/ }).click();
      await expect(page.getByRole("heading", { name: "Olá, Sol." })).toBeVisible();
      selected = await switched;
    }
    // A new browser session restores persistent cookies, but not session cookies.
    const persistent = (await page.context().cookies()).filter((cookie) => cookie.expires > 0);
    const restarted = await browser.newContext(owner.device);
    try {
      await restarted.addCookies(persistent);
      const restored = await restarted.newPage();
      await restored.goto("/hoje");
      await expect(restored.getByRole("heading", { name: "Olá, Sol." })).toBeVisible();
      // Chromium adjusts cookie timestamps for response clock skew. Compare the
      // original HTTP expiry to verify that switching cannot renew the device.
      expect(await cookieExpiry(selected, "ms-profile")).toBe(
        await cookieExpiry(connection, "ms-study"),
      );
    } finally {
      await closeDevice(restarted);
    }
  });
}
