import { expect, test } from "@playwright/test";

test.setTimeout(120_000);

test("demo keeps school deadlines intact, supports keyboard and emits bounded analytics", async ({
  page,
}) => {
  const events: Record<string, unknown>[] = [];
  const errors: string[] = [];
  const providerRequests: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("request", (request) => {
    if (/\/api\/(ai|recados)/.test(new URL(request.url()).pathname))
      providerRequests.push(request.url());
  });
  await page.route("**/api/product-event", (route) => {
    events.push(route.request().postDataJSON());
    return route.fulfill({ status: 204 });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "não precisa morar na sua cabeça",
  );
  await expect.poll(() => events.filter((e) => e.event === "landing_view").length).toBe(1);
  const demo = page.locator("#demonstracao");
  await expect(demo.getByRole("checkbox")).toHaveCount(3);
  const plan = demo.getByRole("button", { name: "Planejar para a véspera" });
  await plan.focus();
  await page.keyboard.press("Enter");
  await expect(demo.getByText("17/09 · Planejado pela família")).toBeVisible();
  await expect(demo.getByText("16/09 · Informado pela escola")).toBeVisible();
  await expect(demo.getByRole("button", { name: "Planejado para 17/09" })).toBeDisabled();
  const checkbox = demo.getByRole("checkbox", { name: "Enviar autorização" });
  await checkbox.focus();
  await page.keyboard.press("Space");
  await expect(demo.getByRole("status")).toContainText("Nada é enviado à escola");
  await checkbox.uncheck();
  await checkbox.check();
  await demo.getByRole("button", { name: "Prova", exact: true }).click();
  await expect(demo.getByRole("checkbox")).toHaveCount(2);
  await expect(demo.getByText("Prazo a confirmar", { exact: true })).toBeVisible();
  await demo.getByRole("button", { name: "Material", exact: true }).click();
  await expect(demo.getByRole("checkbox")).toHaveCount(1);
  await demo.getByRole("button", { name: "Passeio", exact: true }).click();
  await expect(demo.getByRole("checkbox", { name: "Enviar autorização" })).not.toBeChecked();
  await expect(demo.getByRole("button", { name: "Planejar para a véspera" })).toBeEnabled();
  await expect.poll(() => events.filter((e) => e.action === "complete").length).toBe(1);
  expect(events.filter((e) => e.action === "plan")).toHaveLength(1);
  expect(events.filter((e) => e.event === "landing_view")).toHaveLength(1);
  expect(providerRequests).toEqual([]);
  expect(errors).toEqual([]);
});

for (const selection of ["free", "monthly", "annual"] as const) {
  test(`signup preserves selection: ${selection}`, async ({ page }) => {
    const events: Record<string, unknown>[] = [];
    await page.route("**/api/product-event", (route) => {
      events.push(route.request().postDataJSON());
      return route.fulfill({ status: 204 });
    });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "Mensal", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.locator("#planos")).toContainText("19,90");
    if (selection === "annual") {
      await page.getByRole("button", { name: /Anual/ }).click();
      await expect(page.locator("#planos")).toContainText("199,00");
      await expect(page.locator("#planos")).toContainText("Cobrado anualmente");
      await expect(page.locator("#planos")).toContainText("16,58");
      await expect(page.locator("#planos")).toContainText("39,80");
    }
    const cta =
      selection === "free"
        ? page.locator('[data-landing-placement="hero"]')
        : page.getByRole("link", { name: "Escolher o Pro" });
    await cta.click();
    await expect(page).toHaveURL(
      selection === "free"
        ? /\/signup$/
        : new RegExp(`/signup\\?plan=pro&cycle=${selection === "annual" ? "anual" : "mensal"}`),
    );
    await expect(page.locator("main")).toBeVisible();
    await expect.poll(() => events.filter((e) => e.event === "landing_cta").length).toBe(1);
    expect(events.find((e) => e.event === "landing_cta")).toMatchObject({
      firstCta: true,
      placement: selection === "free" ? "hero" : "pricing",
      selection: selection === "free" ? { plan: "free" } : { plan: "pro", cycle: selection },
    });
  });
}

test("responsive light and dark layouts, FAQ keyboard, and legal navigation", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.route("**/api/product-event", (route) => route.fulfill({ status: 204 }));
  await page.goto("/");
  // Confirm hydration through a visible interaction before taking screenshots.
  await page.getByRole("button", { name: "Material", exact: true }).click();
  await expect(page.locator("#demonstracao").getByRole("checkbox")).toHaveCount(1);
  await page.getByRole("button", { name: "Passeio", exact: true }).click();
  await expect(page.locator("#demonstracao").getByRole("checkbox")).toHaveCount(3);
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(page.getByRole("link", { name: "Entrar", exact: true })).toBeVisible();
      const dimensions = await page.evaluate(() => ({
        width: innerWidth,
        scroll: document.documentElement.scrollWidth,
      }));
      expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
      await page.screenshot({
        path: testInfo.outputPath(`home-${theme}-${width}.png`),
        fullPage: true,
        caret: "initial",
      });
    }
  }
  const question = page.locator("summary").filter({ hasText: "Ela busca mensagens sozinha" });
  await question.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByText("Não existe conexão automática com essas plataformas.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Privacidade", exact: true }).click();
  await page.waitForURL(/\/privacidade$/);
  await expect(page).toHaveURL(/\/privacidade$/);
  await page
    .getByRole("navigation", { name: "Navegação do rodapé" })
    .getByRole("link", { name: "Como funciona" })
    .click();
  await page.waitForURL(/\/#demonstracao$/);
  await expect(page).toHaveURL(/\/#demonstracao$/);
  await expect(page.locator("#demo-title")).toBeInViewport();
  expect(errors).toEqual([]);
});
