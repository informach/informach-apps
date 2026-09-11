import { expect, test } from "@playwright/test";

test("public demo carries portions into shopping, preserves unchanged checks and resets", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  const writes: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/") && request.method() !== "GET")
      writes.push(request.url());
  });
  await page.goto("/");
  await page.getByRole("link", { name: "Explorar uma semana de exemplo", exact: true }).click();
  const demo = page.locator("#como-funciona");
  await demo.getByRole("button", { name: "Aumentar porções da omelete" }).click();
  await expect(demo.getByText("4 porções: 2 para o jantar + 2 para levar amanhã.")).toBeVisible();
  await demo.getByRole("button", { name: "Gerar lista de compras", exact: true }).click();
  await expect(demo.getByRole("tab", { name: /Suas compras/ })).toBeFocused();
  const eggs = demo.getByRole("checkbox", { name: /^ovos/ });
  const tomato = demo.getByRole("checkbox", { name: /^tomate picado/ });
  await expect(eggs).toHaveAccessibleName(/8 un/);
  await eggs.check();
  await tomato.check();
  await demo.getByRole("tab", { name: /Sua semana/ }).click();
  await demo.getByRole("button", { name: "Diminuir porções da omelete" }).click();
  await demo.getByRole("tab", { name: /Suas compras/ }).click();
  await expect(
    demo.getByText("As porções mudaram. Atualize a lista para levar as novas quantidades."),
  ).toBeVisible();
  await expect(eggs).toHaveAccessibleName(/8 un/);
  await expect(eggs).toBeChecked();
  await demo.getByRole("button", { name: "Atualizar lista de compras", exact: true }).click();
  await expect(eggs).toHaveAccessibleName(/4 un/);
  await expect(eggs).not.toBeChecked();
  await expect(tomato).toBeChecked();
  await demo.getByRole("button", { name: "Ver o preparo", exact: true }).click();
  await expect(demo.getByText("4 un ovos", { exact: true })).toBeVisible();
  const cookingSteps = demo.getByRole("checkbox");
  await expect(cookingSteps).toHaveCount(4);
  for (const checkbox of await cookingSteps.all()) await checkbox.check();
  await expect(demo.getByText("4 de 4 etapas concluídas")).toBeVisible();
  await demo.getByRole("button", { name: "Recomeçar exemplo", exact: true }).click();
  await expect(demo.getByRole("tab", { name: /Sua semana/ })).toBeFocused();
  await expect(demo.getByRole("button", { name: "Diminuir porções da omelete" })).toBeDisabled();
  await demo.getByRole("tab", { name: /Suas compras/ }).click();
  await expect(demo.getByRole("checkbox")).toHaveCount(0);
  await demo.getByRole("tab", { name: /Na cozinha/ }).click();
  await expect(demo.getByText("0 de 4 etapas concluídas")).toBeVisible();
  await page.getByRole("button", { name: "Repetir semana anterior", exact: true }).click();
  await expect(
    page.getByText("2 refeições copiadas. A quarta-feira que você já planejou foi preservada."),
  ).toBeVisible();
  await expect(page.getByText("Já planejado", { exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Recomeçar", exact: true }).click();
  await expect(page.getByText("Espaço para uma escolha sua")).toHaveCount(2);
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
});

test("landing works on small screens, with keyboard, reduced motion and a saved dark theme", async ({
  page,
}, testInfo) => {
  test.setTimeout(90000);
  await page.addInitScript(() => localStorage.setItem("theme", "dark"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Pular para o conteúdo", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
  const demo = page.locator("#como-funciona");
  await expect(demo.getByRole("tab", { name: /Sua semana/ })).toBeEnabled();
  await demo.getByRole("tab", { name: /Sua semana/ }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(demo.getByRole("tab", { name: /Suas compras/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await demo.getByRole("button", { name: "Recomeçar exemplo", exact: true }).click();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
    const cta = page.locator("#primeiro-convite a");
    const measurements = await cta.evaluate((link) => ({
      height: link.getBoundingClientRect().height,
      transition: getComputedStyle(link).transitionDuration,
      foreground: getComputedStyle(link).color,
      background: getComputedStyle(link).backgroundColor,
    }));
    expect(measurements.height).toBeGreaterThanOrEqual(44);
    expect(measurements.transition).toBe("0s");
    expect(measurements.foreground).toBe("rgb(23, 50, 71)");
    expect(measurements.background).toBe("rgb(255, 122, 61)");
    await page.evaluate(async () => {
      await document.fonts.ready;
      window.scrollTo(0, 0);
    });
    await expect
      .poll(() =>
        page.locator(".hero-photo img").evaluate((img) => (img as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    if (width === 390 || width === 1440)
      await page.screenshot({ path: testInfo.outputPath(`home-${width}.png`), fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Planos", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/\/#planos$/);
  await expect(page.locator("#planos")).toBeInViewport();
  await page.goto("/privacidade");
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Como funciona", exact: true }).click();
  await expect(page).toHaveURL(/\/#como-funciona$/);
  await expect(demo).toBeInViewport();
});

test("public copy, offer, FAQ and signup links work without JavaScript", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
  test.setTimeout(90000);
  try {
    const page = await context.newPage();
    await page.goto("/");
    await expect(page).toHaveTitle("Cozya — planeje refeições, marmitas e compras");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Seu jantar resolvido antes de a fome chegar.",
    );
    await expect(page.locator("#primeiro-convite")).toContainText(
      "Sem cartão. Sem renovação automática.",
    );
    await expect(page.locator(".landing-plan").first().locator(".plan-price")).toHaveText(
      /R\$\s*14,90\/mês/,
    );
    await expect(page.locator(".landing-plan-annual .plan-price")).toHaveText(/R\$\s*149,00\/ano/);
    await expect(page.getByRole("link", { name: "Assinar mensal", exact: true })).toHaveAttribute(
      "href",
      "/signup?plan=pro&cycle=mensal",
    );
    await expect(page.getByRole("link", { name: "Assinar anual", exact: true })).toHaveAttribute(
      "href",
      "/signup?plan=pro&cycle=anual",
    );
    const faq = page
      .locator("#perguntas details")
      .filter({ hasText: "Preciso de cartão para experimentar?" });
    await faq.locator("summary").click();
    await expect(faq.locator("p")).toBeVisible();
    await expect(faq.locator("p")).toContainText("3 créditos de IA para todo o período");
    const image = await page.locator('meta[property="og:image"]').getAttribute("content");
    expect(image).toBe(`${baseURL}/marketing/cozya-social.png`);
    const response = await page.request.get(image ?? "");
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/png");
    // The development server may compile the signup route for the first time here.
    await page.locator("#primeiro-convite a").click({ timeout: 60000 });
    await expect(page).toHaveURL(/\/signup$/);
  } finally {
    await context.close();
  }
});
