import { createHash, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { db, eq } from "@informach/db";
import {
  customers,
  missaoAttempts,
  missaoProfiles,
  subscriptions,
  users,
} from "@informach/db/schema";
import { expect, type Page, test } from "@playwright/test";

async function profile(page: Page, baseURL: string | undefined, nickname: string) {
  if (!baseURL) throw new Error("Missing isolated app URL");
  const email = `experience-${randomUUID()}@example.test`;
  const password = "Missao-Teste-2026-Local!";
  // Each independent family has its own simulated client; retain real rate limiting.
  const client = createHash("sha256").update(test.info().testId).digest();
  const headers = {
    origin: baseURL,
    "x-forwarded-for": `198.18.${client[0]}.${client[1]}`,
  };
  const signup = await page.request.post("/api/auth/sign-up/email", {
    headers,
    data: { email, password, name: "Revisão da experiência" },
  });
  expect(signup.ok(), await signup.text()).toBe(true);
  await db.update(users).set({ emailVerified: true }).where(eq(users.email, email));
  const login = await page.request.post("/api/auth/sign-in/email", {
    headers,
    data: { email, password },
  });
  expect(login.ok(), await login.text()).toBe(true);
  await page.goto("/familia");
  const form = page.locator("form", { hasText: "Uma nova jornada" });
  await form.getByLabel("Apelido do estudante").fill(nickname);
  await form.getByLabel("Ano escolar", { exact: true }).selectOption("6");
  await form.getByLabel("Primeira trilha").selectOption("olitef-n1");
  await form.getByRole("checkbox").check();
  await form.getByRole("button", { name: "Criar perfil e explorar" }).click();
  await expect(page.getByRole("heading", { name: `Olá, ${nickname}.` })).toBeVisible();
  return { email };
}

test("preserva o novo rascunho escrito enquanto a descoberta anterior é salva", async ({
  page,
  baseURL,
}) => {
  await profile(page, baseURL, "Sol");
  await page.goto("/caderno");
  const input = page.getByLabel("Hoje eu descobri que…");
  const first = "Dividi a figura em duas partes iguais.";
  const next = "Minha próxima descoberta ainda está sendo escrita.";
  await input.fill(first);
  let release = () => {};
  const delivery = new Promise<void>((resolve) => {
    release = resolve;
  });
  let accepted = () => {};
  const saved = new Promise<void>((resolve) => {
    accepted = resolve;
  });
  await page.route("**/caderno", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    // A action e o banco são reais; só a entrega da resposta é retardada.
    const response = await route.fetch();
    accepted();
    await delivery;
    await route.fulfill({ response });
  });
  try {
    await page.getByRole("button", { name: "Guardar descoberta" }).click();
    await saved;
    await input.fill(next);
  } finally {
    release();
  }
  await expect(page.getByText("Descoberta guardada.", { exact: true })).toBeVisible();
  await expect(page.locator("main").getByText(first, { exact: true })).toBeVisible();
  await expect(input).toHaveValue(next);
});

test("acomoda o maior apelido permitido e a devolutiva numa tela de 320 pixels", async ({
  page,
  baseURL,
}) => {
  const nickname = "ABCDEFGHIJKLMNOPQRSTUVWX";
  await page.setViewportSize({ width: 320, height: 568 });
  await profile(page, baseURL, nickname);
  const overflow = async () => {
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    return page.evaluate(() => ({
      width: window.innerWidth,
      content: document.documentElement.scrollWidth,
      elements: [...document.querySelectorAll("main *, header *")]
        .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
        .slice(0, 8)
        .map((el) => ({ tag: el.tagName, text: el.textContent?.slice(0, 80) })),
    }));
  };
  const home = await overflow();
  expect.soft(home.content, JSON.stringify(home)).toBeLessThanOrEqual(home.width + 1);
  for (const route of ["/familia", "/caderno", "/meu-espaco"]) {
    await page.goto(route);
    const bounds = await overflow();
    expect
      .soft(bounds.content, `${route}: ${JSON.stringify(bounds)}`)
      .toBeLessThanOrEqual(bounds.width + 1);
  }
  await page.goto("/hoje");
  await page.getByRole("button", { name: "Começar descoberta" }).click();
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Conferir minha ideia" }).click();
  const feedback = page.getByRole("status").filter({ hasText: "Esta tentativa foi registrada" });
  await expect(feedback).toBeVisible();
  const bounds = await feedback.boundingBox();
  expect.soft(bounds?.y).toBeGreaterThanOrEqual(0);
  const mission = await overflow();
  expect.soft(mission.content, JSON.stringify(mission)).toBeLessThanOrEqual(mission.width + 1);
  mkdirSync("tmp/review16", { recursive: true });
  await page.screenshot({ path: `tmp/review16/feedback-${test.info().project.name}.png` });
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page.locator("p[id^='enunciado-']")).toBeFocused();
  // A missão de frações pertence às duas trilhas e deve permanecer aberta.
  // O diagnóstico pertence apenas à OLITEF e é interrompido pela troca.
  await page.goto("/hoje");
  await page.getByRole("button", { name: "Explorar meu ponto de partida" }).click();
  const initialPrompt = await page.locator("p[id^='enunciado-']").getAttribute("id");
  await page.getByRole("button", { name: "Ainda não sei", exact: true }).click();
  await expect(page.locator("p[id^='enunciado-']")).not.toHaveAttribute("id", initialPrompt ?? "");
  const sessionUrl = page.url();
  await page.goto("/jornada");
  await page.getByLabel("Sua trilha", { exact: true }).selectOption("obmep-n1");
  await expect(page.getByLabel("Sua trilha", { exact: true })).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await page.goto(sessionUrl);
  await expect(
    page.getByRole("heading", { name: "Esta sessão foi encerrada com segurança." }),
  ).toBeVisible();
  await page.locator("details").first().locator("summary").click();
  await expect(page.locator("details").first()).toContainText("Sua resposta: Ainda não sei");
});

test("recuperação de senha informa o limite em vez de prometer um código", async ({
  page,
  baseURL,
}) => {
  if (!baseURL) throw new Error("Missing isolated app URL");
  const headers = {
    origin: baseURL,
    "x-forwarded-for": test.info().project.name === "mobile" ? "192.0.2.34" : "192.0.2.33",
  };
  await page.context().setExtraHTTPHeaders(headers);
  const email = `limit-${randomUUID()}@example.test`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await page.request.post("/api/auth/email-otp/request-password-reset", {
      headers,
      data: { email },
    });
    expect(response.ok(), await response.text()).toBe(true);
  }
  await page.goto("/entrar");
  await page.getByLabel("E-mail do responsável", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Esqueci minha senha" }).click();
  const rejected = page.waitForResponse((response) =>
    response.url().endsWith("/email-otp/request-password-reset"),
  );
  await page.getByRole("button", { name: "Enviar código de recuperação" }).click();
  expect((await rejected).status()).toBe(429);
  await expect(page.getByRole("status")).toContainText("Muitas tentativas");
  await expect(page.getByLabel("Código de seis dígitos")).toHaveCount(0);
});

test("caderno guarda contexto, permite editar, buscar, arquivar e restaurar", async ({
  page,
  baseURL,
}) => {
  await profile(page, baseURL, "Nina");
  await page.getByRole("button", { name: "Começar descoberta" }).click();
  const prompt = await page.locator("p[id^='enunciado-']").innerText();
  await page.getByRole("link", { name: "Anotar uma descoberta sobre esta questão" }).click();
  await expect(page.getByRole("checkbox", { name: /Vincular à missão/ })).toBeChecked();
  await page.getByLabel("Hoje eu descobri que…").fill("Reconheci o inteiro antes de dividir.");
  await page.getByRole("button", { name: "Guardar descoberta" }).click();
  const note = page.locator("[data-note-id]").first();
  await expect(note).toContainText("Reconheci o inteiro");
  await note.locator("summary").click();
  await expect(note).toContainText(prompt);
  await note.getByRole("button", { name: "Editar", exact: true }).click();
  await note.getByLabel("Editar descoberta").fill("Usei 50%_ como exemplo literal.");
  await note.getByRole("button", { name: "Salvar alteração" }).click();
  await expect(note).toContainText("Usei 50%_");
  await note.getByRole("button", { name: "Arquivar", exact: true }).click();
  await expect(page.locator("[data-note-id]")).toHaveCount(0);
  await page.getByLabel("Buscar no caderno").fill("%_");
  await page.getByLabel("Mostrar", { exact: true }).selectOption("1");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(note).toContainText("Usei 50%_");
  await note.getByRole("button", { name: "Restaurar", exact: true }).click();
  await expect(page.locator("[data-note-id]")).toHaveCount(0);
  await page.getByLabel("Mostrar", { exact: true }).selectOption("0");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(note).toContainText("Usei 50%_");
});

test("caderno aguarda os controles estarem prontos antes de restaurar após navegação", async ({
  page,
  baseURL,
}) => {
  await profile(page, baseURL, "Lua");
  await page.goto("/caderno");
  await page.getByLabel("Hoje eu descobri que…").fill("Comparei duas representações da metade.");
  await page.getByRole("button", { name: "Guardar descoberta" }).click();
  const note = page.locator("[data-note-id]");
  await expect(note).toHaveCount(1);
  await note.getByRole("button", { name: "Arquivar", exact: true }).click();
  await expect(note).toHaveCount(0);

  let release = () => {};
  const scripts = new Promise<void>((resolve) => {
    release = resolve;
  });
  // A navegação e o HTML são reais. Somente os scripts externos chegam depois,
  // reproduzindo uma conexão móvel em que o HTML aparece antes da hidratação.
  await page.route("**/_next/static/**/*.js", async (route) => {
    await scripts;
    await route.continue();
  });
  const restore = note.getByRole("button", { name: "Restaurar", exact: true });
  try {
    await page.goto("/caderno?archived=1", { waitUntil: "commit" });
    await expect(restore).toBeVisible();
    await expect(restore).toBeDisabled();
  } finally {
    release();
  }
  await expect(restore).toBeEnabled();
  const restored = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      Boolean(response.request().headers()["next-action"]) &&
      new URL(response.url()).pathname === "/caderno",
  );
  await restore.click();
  expect((await restored).ok()).toBe(true);
  await expect(note).toHaveCount(0);
  await page.reload();
  await expect(note).toHaveCount(0);
  await page.getByLabel("Mostrar", { exact: true }).selectOption("0");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(note).toContainText("Comparei duas representações da metade.");
});

test("recuperação oferece três estratégias e libera o segundo encontro em outro dia", async ({
  page,
  baseURL,
}) => {
  await profile(page, baseURL, "Iara");
  await page.getByRole("button", { name: "Começar descoberta" }).click();
  await page.getByRole("button", { name: "Ainda não sei", exact: true }).click();
  await expect(page.getByRole("button", { name: "Continuar", exact: true })).toBeVisible();
  await page.goto("/jornada");
  const recovery = page
    .locator("details")
    .filter({ has: page.getByText("Novas situações para esta habilidade", { exact: true }) })
    .first();
  await recovery.locator("summary").click();
  await expect(recovery.getByRole("button", { name: "Abrir novo encontro" }).nth(1)).toBeDisabled();
  await recovery.getByRole("button", { name: "Abrir novo encontro" }).first().click();
  await expect(page).toHaveURL(/\/missao\/[0-9a-f-]{36}$/);
  const sessionId = new URL(page.url()).pathname.split("/").at(-1);
  if (!sessionId) throw new Error("Missing session");
  for (const [index, value] of ["12", "0,7", "21"].entries()) {
    await page.getByLabel("Seu valor", { exact: true }).fill(value);
    await page.getByRole("button", { name: "Conferir minha ideia" }).click();
    await page
      .getByRole("button", {
        name: index === 2 ? "Ver minhas descobertas" : "Continuar",
        exact: true,
      })
      .click();
  }
  await page.goto("/jornada");
  await recovery.locator("summary").click();
  await expect(recovery).toContainText("3 estratégias e 1 dia");
  await expect(recovery.getByRole("button", { name: "Abrir novo encontro" })).toBeDisabled();
  await db
    .update(missaoAttempts)
    .set({ createdAt: new Date(Date.now() - 86_400_000) })
    .where(eq(missaoAttempts.sessionId, sessionId));
  await page.reload();
  await recovery.locator("summary").click();
  await recovery.getByRole("button", { name: "Abrir novo encontro" }).click();
  await expect(page.locator("p[id^='enunciado-']")).toContainText("64 sementes");
});

test("endereços antigos do caderno oferecem recuperação sem quebrar a página", async ({
  page,
  baseURL,
}) => {
  await profile(page, baseURL, "Rosa");
  for (const query of [`after=${randomUUID()}`, `session=${randomUUID()}`]) {
    await page.goto(`/caderno?${query}`);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("caderno");
    await page.getByRole("link", { name: "Voltar ao início do caderno" }).click();
    await expect(page.getByLabel("Hoje eu descobri que…")).toBeVisible();
  }
});

test("mostra gráficos e planificações com alternativas acessíveis no celular e desktop", async ({
  page,
  baseURL,
}) => {
  const { email } = await profile(page, baseURL, "Luz");
  const [owner] = await db.select().from(users).where(eq(users.email, email));
  if (!owner) throw new Error("Missing owner");
  await db
    .update(missaoProfiles)
    .set({ grade: 11, courseId: "canguru-j" })
    .where(eq(missaoProfiles.userId, owner.id));
  const [customer] = await db
    .insert(customers)
    .values({
      provider: "stripe",
      providerCustomerId: `cus_local_${randomUUID()}`,
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
    providerSubscriptionId: `sub_local_${randomUUID()}`,
    providerPriceId: "price_local",
    status: "active",
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 86_400_000),
  });
  await page.goto("/jornada");
  await page
    .getByRole("heading", { name: "Ler o gráfico", exact: true })
    .locator("..")
    .getByRole("button", { name: "Explorar", exact: true })
    .click();
  await expect(page.locator("figure svg[role='img']")).toHaveCount(1);
  await page.getByText("Ler descrição e tabela do gráfico", { exact: true }).click();
  await expect(page.locator("figure table")).toHaveCount(2);
  await expect(page.locator("figure table").first()).toBeVisible();
  await page.emulateMedia({ colorScheme: "dark" });
  const contrast = await page.locator("figure").evaluate((figure) => {
    // Canvas resolves CSS colors (including OKLCH tokens) to sRGB pixels.
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Missing canvas context");
    const luminance = (color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const rgb = Array.from(ctx.getImageData(0, 0, 1, 1).data)
        .slice(0, 3)
        .map((v) => {
          const n = v / 255;
          return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
        });
      return (rgb[0] ?? 0) * 0.2126 + (rgb[1] ?? 0) * 0.7152 + (rgb[2] ?? 0) * 0.0722;
    };
    const style = getComputedStyle(figure);
    const a = luminance(style.color);
    const b = luminance(style.backgroundColor);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  await page.emulateMedia({ colorScheme: "light" });
  const bounds = await page.evaluate(() => ({
    width: innerWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(bounds.content).toBeLessThanOrEqual(bounds.width + 1);
  mkdirSync("tmp/improvements", { recursive: true });
  await page.screenshot({ path: `tmp/improvements/graph-${test.info().project.name}.png` });
  await db
    .update(missaoProfiles)
    .set({ grade: 12, courseId: "canguru-s" })
    .where(eq(missaoProfiles.userId, owner.id));
  await page.goto("/jornada");
  await page
    .getByRole("heading", { name: "Planificações e áreas", exact: true })
    .locator("..")
    .getByRole("button", { name: "Explorar", exact: true })
    .click();
  for (let i = 0; i < 5; i++) {
    await page.getByRole("button", { name: "Ainda não sei", exact: true }).click();
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
  }
  await expect(page.locator("figure svg[role='img']")).toHaveCount(3);
  await page.getByText("Ler os arranjos em texto", { exact: true }).click();
  await expect(page.locator("figure")).toContainText("(coluna, linha)");
  await page.getByRole("radio", { name: "A", exact: true }).check();
  await page.getByRole("button", { name: "Conferir minha ideia" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Esta tentativa foi registrada" }),
  ).toContainText("seis quadrados");
  await page.screenshot({ path: `tmp/improvements/nets-${test.info().project.name}.png` });
});
