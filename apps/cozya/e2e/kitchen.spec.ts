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

test("edit, plan, shop, cook and resume on a phone", async ({ page, baseURL }) => {
  test.setTimeout(180000); // Several previously uncompiled routes on a cold Next development server.
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await signInHousehold(page, baseURL);
  const response = await page.goto("/dashboard");
  expect(response?.headers()["content-security-policy"]).toContain("script-src");
  await expect(page.getByRole("heading", { name: "Minhas receitas", exact: true })).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Pular para o conteúdo" })).toBeFocused();
  const primary = page.getByRole("button", { name: "Nova receita", exact: true });
  const contrast = await primary.evaluate((button) => {
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
  await page.getByRole("button", { name: "Experimentar grátis", exact: true }).click();
  await expect(page.getByRole("link", { name: "Planejar minha semana" })).toBeVisible();

  await page.getByRole("button", { name: "Nova receita", exact: true }).click();
  await page.getByRole("button", { name: "Manual", exact: true }).click();
  let dialog = page.locator('[role="dialog"][data-state="open"]');
  await dialog.getByLabel("Nome", { exact: true }).fill("Omelete E2E");
  await dialog.getByLabel("Ingredientes", { exact: true }).fill("2 ovos\n100 g de queijo");
  await dialog.getByLabel("Rendimento (porções)", { exact: true }).fill("2");
  await dialog
    .getByLabel("Modo de preparo", { exact: true })
    .fill("Bata os ovos.\nMisture o queijo e cozinhe até firmar.");
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Ver detalhes de Omelete E2E", exact: true }),
  ).toBeVisible();
  // Populate the former stale-detail cache before editing.
  await page.getByRole("button", { name: "Ver detalhes de Omelete E2E", exact: true }).click();
  await expect(dialog.getByText("2 ovos", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.getByRole("button", { name: "Editar receita", exact: true }).click();
  await dialog.getByLabel("Nome", { exact: true }).fill("Omelete atualizada E2E");
  await dialog.getByLabel("Ingredientes", { exact: true }).fill("3 ovos\n100 g de queijo");
  await dialog.getByRole("button", { name: "Salvar alterações", exact: true }).click();
  await page
    .getByRole("button", { name: "Ver detalhes de Omelete atualizada E2E", exact: true })
    .click();
  await expect(dialog.getByText("3 ovos", { exact: true })).toBeVisible();
  const whatsapp = await dialog
    .getByRole("link", { name: "Compartilhar no WhatsApp" })
    .getAttribute("href");
  if (!whatsapp) throw new Error("Expected sharing URL");
  expect(new URL(whatsapp).searchParams.get("text")).toContain("3 ovos");
  expect(new URL(whatsapp).searchParams.get("text")).not.toContain("2 ovos");
  const recipePath = await dialog
    .getByRole("link", { name: "Começar a cozinhar" })
    .getAttribute("href");
  await dialog.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.getByRole("button", { name: "Editar receita", exact: true }).click();
  await expect(dialog.getByLabel("Ingredientes", { exact: true })).toHaveValue(
    "3 ovos\n100 g de queijo",
  );
  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/semana?week=2027-03-01");
  for (let meal = 0; meal < 3; meal++) {
    await page.getByRole("button", { name: "+ Planejar jantar", exact: true }).first().click();
    dialog = page.locator('[role="dialog"][data-state="open"]');
    await dialog.getByRole("combobox", { name: "Receita", exact: true }).click();
    await page
      .getByRole("option", { name: "Omelete atualizada E2E · rende 2", exact: true })
      .click();
    await dialog.getByLabel("Porções para preparar").fill("4");
    await dialog.getByRole("button", { name: "Salvar refeição", exact: true }).click();
    await expect(dialog).toHaveCount(0);
  }
  await expect(page.getByText("Omelete atualizada E2E", { exact: true })).toHaveCount(3);
  await page.getByRole("button", { name: "Gerar lista de compras", exact: true }).click();
  await expect(page).toHaveURL(/\/compras\?week=2027-03-01/);
  const eggs = page.getByRole("listitem").filter({ has: page.getByText("ovos", { exact: true }) });
  await expect(eggs.getByText("18 un", { exact: true })).toBeVisible();
  await eggs.getByRole("button", { name: "Já tenho", exact: true }).click();
  await expect(eggs.getByRole("button", { name: "Já tenho", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.reload();
  await expect(eggs.getByRole("button", { name: "Já tenho", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByLabel("Item", { exact: true }).fill("Café extra E2E");
  await page.getByLabel("Quantidade", { exact: true }).fill("1 pacote");
  await page.getByRole("button", { name: "Adicionar", exact: true }).click();
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

  await page.goto(`${recipePath}?porcoes=4`);
  await page.getByRole("checkbox", { name: "6 un ovos", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "6 un ovos", exact: true })).toBeChecked();
  await page.getByRole("checkbox", { name: /Passo 1 Bata os ovos/ }).click();
  await expect(page.getByRole("checkbox", { name: /Passo 1 Bata os ovos/ })).toBeChecked();
  await page.getByLabel("Minutos", { exact: true }).fill("5");
  await page.getByRole("button", { name: "Iniciar", exact: true }).click();
  await expect(page.getByRole("timer", { name: "Tempo restante" })).toBeVisible();
  await page.getByLabel("Porções de hoje").fill("6");
  await page.getByRole("button", { name: "Aplicar porções", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${recipePath}$`));
  await expect(page.getByRole("checkbox", { name: "9 un ovos", exact: true })).not.toBeChecked();
  await page.reload();
  await expect(page.getByLabel("Porções de hoje")).toHaveValue("6");
  await expect(page.getByRole("checkbox", { name: /Passo 1 Bata os ovos/ })).toBeChecked();
  await expect(page.getByRole("timer", { name: "Tempo restante" })).toBeVisible();
  await page.getByLabel("Porções de hoje").fill("4");
  await page.getByRole("button", { name: "Aplicar porções", exact: true }).click();
  await page.getByRole("checkbox", { name: "6 un ovos", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "6 un ovos", exact: true })).toBeChecked();
  await page.reload();
  await expect(page.getByRole("checkbox", { name: "6 un ovos", exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: /Passo 1 Bata os ovos/ })).toBeChecked();
  await expect(page.getByRole("timer", { name: "Tempo restante" })).toBeVisible();
  await page.getByRole("button", { name: "Cozinhei esta receita", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Você já preparou esta receita ✓", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("Receita preparada! Ela fica pronta para repetir na próxima semana.", {
      exact: true,
    }),
  ).toBeHidden({ timeout: 10000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: "test-results/kitchen-cooking-mobile.png",
    fullPage: true,
    caret: "initial",
  });
  await page.getByRole("button", { name: "Alternar tema", exact: true }).click();
  await page.getByRole("menuitem", { name: "Escuro", exact: true }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.getByRole("menuitem", { name: "Escuro", exact: true })).toHaveCount(0);
  await page.screenshot({
    path: "test-results/kitchen-cooking-dark-mobile.png",
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

  await page.goto("/semana?week=2027-03-08");
  await page.getByRole("button", { name: "Repetir semana anterior", exact: true }).click();
  await expect(page.getByText("Omelete atualizada E2E", { exact: true })).toHaveCount(3);
  const exported = await page.request.get("/api/account/export");
  expect(exported.status()).toBe(200);
  const data = await exported.json();
  expect(data.recipes[0].ingredients).toBe("3 ovos\n100 g de queijo");
  expect(data.meals).toHaveLength(6);
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
  test.setTimeout(90000);
  await signInHousehold(page, baseURL);
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Experimentar grátis", exact: true }).click();
  await expect(page.getByRole("link", { name: "Planejar minha semana" })).toBeVisible();
  // The local search controls are visible once there is a saved recipe to search.
  await page
    .getByRole("button", { name: /^Revisar / })
    .first()
    .click();
  await page.getByRole("dialog").getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("navigation", { name: "Navegação principal" })
    .getByRole("link", { name: "Semana", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "O que vamos cozinhar?", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Navegação principal" })
    .getByRole("link", { name: "Receitas", exact: true })
    .click();
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
  await expect(
    page.getByRole("heading", { name: "O que vamos cozinhar?", exact: true }),
  ).toBeVisible();
  await expect.poll(async () => (await micState()).stopped).toBe(true);
  expect(requests).toEqual([]);
});
