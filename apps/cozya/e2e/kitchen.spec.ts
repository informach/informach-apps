import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import { extractOtp, waitForEmail } from "./fixtures/email";

async function signInHousehold(page: Page, baseURL: string | undefined) {
  const email = `kitchen-browser-${randomUUID()}@e2e.local`;
  const headers = { Origin: baseURL ?? "http://localhost:3102" };
  const signup = await page.request.post("/api/auth/sign-up/email", {
    headers,
    data: { name: "Cozinha de teste", email, password: "Cozya-Teste-2026!" },
  });
  expect(signup.status()).toBe(200);
  const message = await waitForEmail({ to: email, category: "auth.verify-email-otp" });
  const verify = await page.request.post("/api/auth/email-otp/verify-email", {
    headers,
    data: { email, otp: extractOtp(message) },
  });
  expect(verify.status()).toBe(200);
  const login = await page.request.post("/api/auth/sign-in/email", {
    headers,
    data: { email, password: "Cozya-Teste-2026!" },
  });
  expect(login.status()).toBe(200);
  return email;
}

// Client-side navigations can land on a route the cold dev server compiles on first use.
const COMPILE = { timeout: 60_000 };

/** A Monday far enough ahead that every day of it can still be planned, whatever day the suite runs. */
function futureWeek(weeksAhead: number): string {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const date = new Date(`${today}T12:00:00Z`);
  const weekday = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - (weekday === 0 ? 6 : weekday - 1) + weeksAhead * 7);
  return date.toISOString().slice(0, 10);
}

const STARTERS = [
  "Macarrão com tomate e grão-de-bico",
  "Arroz com lentilha e cenoura",
  "Omelete de abobrinha",
];

async function planFirstWeek(page: Page) {
  await expect(
    page.getByRole("heading", { name: "Vamos montar sua primeira semana.", exact: true }),
  ).toBeVisible();
  for (const name of STARTERS) {
    const option = page.getByRole("button", { name: new RegExp(`^${name}`) });
    await option.click();
    await expect(option).toHaveAttribute("aria-pressed", "true");
  }
  return page.getByRole("button", { name: "Colocar nos dias", exact: true });
}

test("first week, plan with lunchboxes, shop, cook and say how it went on a phone", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(240000); // Several previously uncompiled routes on a cold Next development server.
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signInHousehold(page, baseURL);
  await page.setViewportSize({ width: 390, height: 844 });

  // The old home still works as a bookmark and lands on Hoje.
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/hoje$/);
  const response = await page.goto("/hoje");
  expect(response?.headers()["content-security-policy"]).toContain("script-src");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Pular para o conteúdo" })).toBeFocused();

  // First week: three recipes, three days, and the 14 free days start on their own.
  const putOnDays = await planFirstWeek(page);
  const contrast = await putOnDays.evaluate((button) => {
    const style = getComputedStyle(button);
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable");
    const luminance = (color: string) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const pixel = ctx.getImageData(0, 0, 1, 1).data;
      const channels = [pixel[0] ?? 0, pixel[1] ?? 0, pixel[2] ?? 0].map((value) => {
        const s = value / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return (
        (channels[0] ?? 0) * 0.2126 + (channels[1] ?? 0) * 0.7152 + (channels[2] ?? 0) * 0.0722
      );
    };
    const a = luminance(style.color),
      b = luminance(style.backgroundColor);
    return {
      foreground: style.color,
      background: style.backgroundColor,
      ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
      height: button.getBoundingClientRect().height,
    };
  });
  expect(contrast.ratio).toBeGreaterThanOrEqual(4.5);
  expect(contrast.height).toBeGreaterThanOrEqual(44);
  await mkdir("test-results", { recursive: true });
  await writeFile(
    "test-results/ui-measurements.json",
    JSON.stringify({ measuredAt: new Date().toISOString(), primaryButton: contrast }, null, 2),
  );
  await putOnDays.click();
  // Step 2 of 3: the dinners are on the days; step 3: the shopping list of that same week.
  await expect(page).toHaveURL(/\/semana\?week=[\d-]+&primeira=1$/, COMPILE);
  await expect(page.getByText(/^Passo 2 de 3\./)).toBeVisible();
  await expect(page.getByText(/^Teste: 1[34] dias$/)).toBeVisible();
  await page.getByRole("button", { name: /^Montar a lista do mercado \d+ ite/ }).click();
  await expect(page).toHaveURL(/\/compras\?week=[\d-]+&primeira=1$/, COMPILE);
  await expect(page.getByText(/^Passo 3 de 3\./)).toBeVisible();
  await page.goto("/hoje");
  // The three dinners fit one list: from today, or from Monday when today is Saturday or Sunday.
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
  }).format(new Date());
  if (weekday === "Sat" || weekday === "Sun")
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Hoje ainda não tem nada planejado.",
      COMPILE,
    );
  else {
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      new RegExp(`^(${STARTERS.join("|")})$`),
      COMPILE,
    );
    await expect(page.getByRole("link", { name: /^Começar a cozinhar/ })).toBeVisible();
  }

  // A recipe of the house, written by hand, then edited.
  await page.goto("/receitas");
  await expect(page.getByRole("heading", { name: "Suas receitas", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Trazer uma receita", exact: true }).click();
  await page.getByRole("button", { name: /^Escrever do meu jeito/ }).click();
  const dialog = page.locator('[role="dialog"][data-state="open"]');
  await dialog.getByLabel("Nome", { exact: true }).fill("Omelete E2E");
  await dialog.getByLabel("Ingredientes", { exact: true }).fill("2 ovos\n100 g de queijo");
  await dialog.getByLabel("Quanto rende (porções)", { exact: true }).fill("2");
  await dialog
    .getByLabel("Modo de preparo", { exact: true })
    .fill("Bata os ovos.\nMisture o queijo e cozinhe por 5 minutos até firmar.");
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("link", { name: /^Omelete E2E/ }).click();
  await expect(page.getByRole("heading", { name: "Omelete E2E", level: 1 })).toBeVisible(COMPILE);
  const recipePath = new URL(page.url()).pathname;
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await dialog.getByLabel("Nome", { exact: true }).fill("Omelete atualizada E2E");
  await dialog.getByLabel("Ingredientes", { exact: true }).fill("3 ovos\n100 g de queijo");
  await dialog.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Omelete atualizada E2E", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("3 ovos", { exact: true })).toBeVisible();
  const whatsapp = await page
    .getByRole("link", { name: "Compartilhar no WhatsApp" })
    .getAttribute("href");
  if (!whatsapp) throw new Error("Expected sharing URL");
  expect(new URL(whatsapp).searchParams.get("text")).toContain("3 ovos");
  expect(new URL(whatsapp).searchParams.get("text")).not.toContain("2 ovos");
  await page.getByRole("button", { name: "Mais uma porção", exact: true }).click();
  await page.getByRole("button", { name: "Mais uma porção", exact: true }).click();
  await expect(page.getByText("6 ovos", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Começar a cozinhar/ })).toHaveAttribute(
    "href",
    `${recipePath}/cozinhar?porcoes=4`,
  );

  // A week ahead: three dinners for two plus two lunchboxes, and one night without a recipe.
  const week = futureWeek(8);
  await page.goto(`/semana?week=${week}`);
  for (let meal = 0; meal < 3; meal++) {
    // On a phone an empty day is one "Planejar segunda" button.
    await page
      .getByRole("button", { name: /^Planejar / })
      .first()
      .click();
    await expect(dialog.getByRole("heading", { name: "O que vai ter?" })).toBeVisible();
    await dialog.getByRole("button", { name: /^Omelete atualizada E2E/ }).click();
    await expect(dialog.locator('p[role="status"]')).toContainText("2 + 0 = 2 porções");
    await dialog.getByRole("button", { name: "Mais em marmitas", exact: true }).click();
    await dialog.getByRole("button", { name: "Mais em marmitas", exact: true }).click();
    await expect(dialog.locator('p[role="status"]')).toContainText(
      "2 + 2 = 4 porções. A receita rende 2; o Cozya ajusta as quantidades para 4.",
    );
    await dialog.getByRole("button", { name: /^Colocar n[ao] / }).click();
    await expect(dialog).toHaveCount(0);
  }
  await page
    .getByRole("button", { name: /^Planejar / })
    .first()
    .click();
  await dialog.getByRole("button", { name: "Sem receita", exact: true }).click();
  await dialog.getByRole("button", { name: "Pedir comida", exact: true }).click();
  await dialog.getByRole("button", { name: /^Colocar n[ao] / }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /^Jantar de .*: Omelete atualizada E2E/ }),
  ).toHaveCount(3);
  await expect(page.getByRole("button", { name: /^Jantar de .*: Pedir comida/ })).toHaveCount(1);
  // Each dinner's lunchboxes show up at the next day's lunch.
  await expect(page.getByRole("img", { name: "Marmita", exact: true })).toHaveCount(3);

  await page.getByRole("button", { name: /^Montar a lista do mercado/ }).click();
  await expect(page).toHaveURL(new RegExp(`/compras\\?week=${week}`), COMPILE);
  await expect(page.getByRole("heading", { name: "Lista do mercado", level: 1 })).toBeVisible();
  const eggs = page.getByRole("button", { name: /^Ovos/ });
  const cheese = page.getByRole("button", { name: /^Queijo/ });
  await expect(eggs).toContainText("18");
  await expect(cheese).toContainText("600 g");
  // Before leaving: what is already at home.
  await eggs.click();
  await expect(eggs).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(eggs).toHaveAttribute("aria-pressed", "true");
  await expect(eggs).toContainText("EM CASA");
  // At the market: what is home is out of the way, the rest goes into the cart.
  await page.getByRole("button", { name: "No mercado", exact: true }).click();
  await expect(eggs).toHaveCount(0);
  await cheese.click();
  await expect(cheese).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByRole("button", { name: "No mercado", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(cheese).toHaveAttribute("aria-pressed", "true");
  // Back home, something already in the cart reads as done and can still be undone.
  await page.getByRole("button", { name: "Antes de sair", exact: true }).click();
  await expect(cheese).toHaveAttribute("aria-pressed", "true");
  await cheese.click();
  await expect(cheese).toHaveAttribute("aria-pressed", "false");
  const message = await page
    .getByRole("link", { name: "Mandar a lista pelo WhatsApp", exact: true })
    .getAttribute("href");
  if (!message) throw new Error("Expected list sharing URL");
  const text = new URL(message).searchParams.get("text") ?? "";
  expect(text).toContain("Queijo: 600 g");
  expect(text).not.toContain("Ovos");
  await page.getByRole("button", { name: "+ Algo mais para a casa", exact: true }).click();
  await page.getByLabel("Item", { exact: true }).fill("Café extra E2E");
  await page.getByLabel("Quantidade", { exact: true }).fill("1 pacote");
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Café extra E2E/ })).toBeVisible();
  await page.getByRole("button", { name: "Remover Café extra E2E", exact: true }).click();
  await expect(page.getByText("Café extra E2E", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("Café extra E2E", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/kitchen-shopping-mobile.png",
    fullPage: true,
    caret: "initial",
  });

  // A change in the week makes the list stale until it is rebuilt.
  await page.goto(`/semana?week=${week}`);
  await page
    .getByRole("button", { name: /^Jantar de .*: Omelete atualizada E2E/ })
    .first()
    .click();
  await dialog.getByRole("button", { name: "Menos em marmitas", exact: true }).click();
  await dialog.getByRole("button", { name: "Menos em marmitas", exact: true }).click();
  await expect(dialog.locator('p[role="status"]')).toContainText("2 + 0 = 2 porções");
  await dialog.getByRole("button", { name: /^Colocar n[ao] / }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: /^Atualizar a lista do mercado/ }).click();
  await expect(page).toHaveURL(new RegExp(`/compras\\?week=${week}`), COMPILE);
  await expect(eggs).toContainText("15");
  await expect(page.getByText("A semana mudou desde que a lista foi montada.")).toHaveCount(0);

  // Cooking mode: one step per screen, the timer where the step asks for it, saved across reloads.
  await page.goto(`${recipePath}/cozinhar?porcoes=4&marmitas=2`);
  await expect(page.getByText("2 na mesa + 2 marmitas", { exact: true })).toBeVisible();
  await expect(page.getByText("Passo 1 de 2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Ver os 2 ingredientes", exact: true }).click();
  await page.getByRole("checkbox", { name: "6 ovos", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "6 ovos", exact: true })).toBeChecked();
  await page.getByRole("button", { name: "Próximo passo", exact: true }).click();
  await expect(page.getByText("Passo 2 de 2", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Marcar 5 minutos", exact: true }).click();
  await expect(page.getByRole("timer", { name: "Tempo restante" })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Passo 2 de 2", { exact: true })).toBeVisible();
  await expect(page.getByRole("timer", { name: "Tempo restante" })).toBeVisible();
  await page.getByRole("button", { name: "Ver os 2 ingredientes", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "6 ovos", exact: true })).toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: "test-results/kitchen-cooking-mobile.png",
    fullPage: true,
    caret: "initial",
  });
  await page.getByRole("button", { name: "Pronto, cozinhei", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Bom apetite!", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Com ajustes", exact: true }).click();
  await page.getByLabel("Uma nota para a próxima vez").fill("Menos queijo na próxima.");
  await page.getByRole("button", { name: "Salvar e voltar para Hoje", exact: true }).click();
  await expect(page).toHaveURL(/\/hoje$/, COMPILE);
  await page.goto(recipePath);
  await expect(page.getByText("“Menos queijo na próxima.”", { exact: true })).toBeVisible();
  await expect(page.getByText(/ · feita hoje$/)).toBeVisible();

  await page.goto("/hoje");
  await page.getByRole("button", { name: "Alternar tema", exact: true }).click();
  await page.getByRole("menuitem", { name: "Escuro", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByRole("menuitem", { name: "Escuro", exact: true })).toHaveCount(0);
  await page.screenshot({
    path: "test-results/kitchen-today-dark-mobile.png",
    fullPage: true,
    caret: "initial",
  });
  await page.getByRole("button", { name: "Alternar tema", exact: true }).click();
  await page.getByRole("menuitem", { name: "Claro", exact: true }).click();

  let adaptations = 0;
  await page.route("**/api/ai/recipes/refine", async (route) => {
    adaptations++;
    await route.fulfill({
      json:
        adaptations === 1
          ? {
              isValidRecipe: true,
              recipe: {
                name: "Omelete adaptada",
                ingredients: "3 ovos\n100 g de abobrinha",
                preparation: "Misture e cozinhe até firmar.",
                finishing: "",
                servings: 2,
                totalMinutes: 10,
                sourceName: null,
                sourceUrl: null,
              },
            }
          : { isValidRecipe: false, reason: "Não consegui aplicar esta mudança." },
    });
  });
  await page.goto(recipePath);
  await page.getByRole("button", { name: "Adaptar com IA · 1 crédito", exact: true }).click();
  await page.getByLabel("O que quer mudar?").fill("Trocar queijo por abobrinha");
  await page.getByRole("button", { name: "Ver adaptação · 1 crédito", exact: true }).click();
  await expect(page.getByRole("button", { name: "Revisar e salvar uma cópia" })).toBeVisible();
  await page.getByLabel("O que quer mudar?").fill("Uma mudança impossível");
  await expect(page.getByRole("button", { name: "Revisar e salvar uma cópia" })).toHaveCount(0);
  await page.getByRole("button", { name: "Ver adaptação · 1 crédito", exact: true }).click();
  await expect(page.getByText("Não consegui aplicar esta mudança.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Revisar e salvar uma cópia" })).toHaveCount(0);
  expect(adaptations).toBe(2);

  // The week that worked repeats on the free days of the next one.
  const nextWeek = futureWeek(9);
  await page.goto(`/semana?week=${nextWeek}`);
  await page.getByRole("button", { name: "Repetir nos dias livres", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /^Jantar de .*: Omelete atualizada E2E/ }),
  ).toHaveCount(3);
  await expect(page.getByRole("button", { name: /^Jantar de .*: Pedir comida/ })).toHaveCount(1);

  const exported = await page.request.get("/api/account/export");
  expect(exported.status()).toBe(200);
  const data = (await exported.json()) as {
    recipes: { name: string; ingredients: string }[];
    meals: unknown[];
  };
  expect(data.recipes.find((recipe) => recipe.name === "Omelete atualizada E2E")?.ingredients).toBe(
    "3 ovos\n100 g de queijo",
  );
  // Three from the first week, four planned ahead and the four repeated.
  expect(data.meals).toHaveLength(11);
  await page.goto("/settings/account");
  await page.getByLabel("Digite APAGAR para confirmar").fill("APAGAR");
  await page.getByRole("button", { name: "Apagar meus dados do Cozya", exact: true }).click();
  await expect(page.getByText("Dados do Cozya apagados", { exact: true })).toBeVisible();
  const empty = await page.request.get("/api/account/export");
  expect((await empty.json()).recipes).toHaveLength(0);
  expect(errors).toEqual([]);
});

test("leaving microphone permission or recording stops capture without a paid request", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(120000);
  await signInHousehold(page, baseURL);
  await page.goto("/hoje");
  // The first week saves three recipes and opens the trial that the voice search needs.
  await (await planFirstWeek(page)).click();
  await expect(page.getByText(/^Teste: 1[34] dias$/)).toBeVisible(COMPILE);
  await page
    .getByRole("navigation", { name: "Navegação principal" })
    .first()
    .getByRole("link", { name: "Semana", exact: true })
    .click();
  await expect(page.getByRole("navigation", { name: "Navegar entre semanas" })).toBeVisible(
    COMPILE,
  );
  await page
    .getByRole("navigation", { name: "Navegação principal" })
    .first()
    .getByRole("link", { name: "Receitas", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Suas receitas", exact: true })).toBeVisible(
    COMPILE,
  );
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/ai/")) requests.push(request.url());
  });
  await page.evaluate(() => {
    const state = { requested: 0, streams: [] as MediaStream[], resolve: () => {} };
    Object.assign(window, { cozyaMicTest: state });
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      configurable: true,
      value: () =>
        new Promise<MediaStream>((resolve) => {
          state.requested++;
          state.resolve = () => {
            const context = new AudioContext();
            const source = context.createOscillator();
            const destination = context.createMediaStreamDestination();
            source.connect(destination);
            source.start();
            state.streams.push(destination.stream);
            resolve(destination.stream);
          };
        }),
    });
  });
  const openVoice = async () => {
    await page.getByRole("button", { name: "Ditar busca · 1 crédito", exact: true }).click();
    await expect(page.getByText(/A transcrição custa 1 crédito quando concluída/)).toBeVisible();
    await page.getByRole("button", { name: "Gravar termo de busca", exact: true }).click();
  };
  const micState = () =>
    page.evaluate(() => {
      const state = (
        window as unknown as { cozyaMicTest: { requested: number; streams: MediaStream[] } }
      ).cozyaMicTest;
      return {
        requested: state.requested,
        stopped: state.streams.every((stream) =>
          stream.getTracks().every((track) => track.readyState === "ended"),
        ),
      };
    });
  const resolvePermission = () =>
    page.evaluate(() =>
      (window as unknown as { cozyaMicTest: { resolve: () => void } }).cozyaMicTest.resolve(),
    );
  await openVoice();
  await expect.poll(async () => (await micState()).requested).toBe(1);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await resolvePermission();
  await expect.poll(async () => (await micState()).stopped).toBe(true);
  expect(requests).toEqual([]);
  await openVoice();
  await expect.poll(async () => (await micState()).requested).toBe(2);
  await resolvePermission();
  await expect(
    page.getByRole("button", { name: "Gravar termo de busca", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  // A route transition unmounts the recorder even if its dialog prevents accidental close.
  await page.goBack();
  await expect(page.getByRole("navigation", { name: "Navegar entre semanas" })).toBeVisible();
  await expect.poll(async () => (await micState()).stopped).toBe(true);
  expect(requests).toEqual([]);
});
