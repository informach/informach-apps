import { expect, test } from "@playwright/test";

test("public demo carries lunchboxes into shopping, preserves unchanged checks and resets", async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  const writes: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    const write =
      request.method() !== "GET" &&
      (new URL(request.url()).pathname.startsWith("/api/") || !!request.headers()["next-action"]);
    if (write) writes.push(request.url());
  });
  await page.goto("/");
  await page.getByRole("link", { name: "Ver uma semana de exemplo", exact: true }).click();
  const demo = page.locator("#como-funciona");
  await expect(
    demo.getByText("2 pessoas na mesa, sem marmita. Vai levar almoço amanhã? Some uma marmita."),
  ).toBeVisible();
  await demo.getByRole("button", { name: "Mais uma marmita", exact: true }).click();
  await demo.getByRole("button", { name: "Mais uma marmita", exact: true }).click();
  await expect(
    demo.getByText(
      "2 na mesa + 2 marmitas = 4 porções. A receita rende 2; as quantidades se ajustam.",
    ),
  ).toBeVisible();
  await demo.getByRole("button", { name: "Montar a lista do mercado", exact: true }).click();
  await expect(demo.getByRole("tab", { name: /No mercado/ })).toBeFocused();
  const eggs = demo.getByRole("checkbox", { name: /^Ovos/ });
  const tomato = demo.getByRole("checkbox", { name: /^Tomate/ });
  await expect(eggs).toHaveAccessibleName(/8$/);
  await eggs.check();
  await tomato.check();
  await demo.getByRole("tab", { name: /Sua semana/ }).click();
  await demo.getByRole("button", { name: "Menos uma marmita", exact: true }).click();
  await demo.getByRole("tab", { name: /No mercado/ }).click();
  await expect(demo.getByText("A semana mudou: a omelete agora é para 3.")).toBeVisible();
  await expect(eggs).toHaveAccessibleName(/8$/);
  await expect(eggs).toBeChecked();
  await demo.getByRole("button", { name: "Atualizar a lista", exact: true }).click();
  await expect(eggs).toHaveAccessibleName(/6$/);
  await expect(eggs).not.toBeChecked();
  await expect(tomato).toBeChecked();
  await demo.getByRole("button", { name: "Ver o preparo da omelete", exact: true }).click();
  await expect(demo.getByText("6 ovos", { exact: true })).toBeVisible();
  await expect(demo.getByText("2 na mesa", { exact: true })).toBeVisible();
  const cookingSteps = demo.getByRole("checkbox");
  await expect(cookingSteps).toHaveCount(4);
  for (const checkbox of await cookingSteps.all()) await checkbox.check();
  await expect(demo.getByText("4 de 4 passos feitos")).toBeVisible();
  await expect(demo.getByText(/No app, aqui entra o “Como foi\?”/)).toBeVisible();
  await demo.getByRole("button", { name: "Recomeçar exemplo", exact: true }).click();
  await expect(demo.getByRole("tab", { name: /Sua semana/ })).toBeFocused();
  await expect(demo.getByRole("button", { name: "Menos uma marmita", exact: true })).toBeDisabled();
  await demo.getByRole("tab", { name: /No mercado/ }).click();
  await expect(demo.getByRole("checkbox")).toHaveCount(0);
  await demo.getByRole("tab", { name: /Na cozinha/ }).click();
  await expect(demo.getByText("0 de 4 passos feitos")).toBeVisible();
  await page.getByRole("button", { name: "Repetir a semana passada", exact: true }).click();
  await expect(
    page.getByText(
      "2 jantares copiados para os dias livres. A quarta que você já tinha planejado ficou como estava.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Já planejado", { exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Recomeçar", exact: true }).click();
  await expect(page.getByText("Dia livre", { exact: true })).toHaveCount(2);
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
  await expect
    .poll(() => page.locator("h1").evaluate((heading) => getComputedStyle(heading).fontFamily))
    .toContain("Plus Jakarta Sans");
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
  await expect(demo.getByRole("tab", { name: /No mercado/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await demo.getByRole("button", { name: "Recomeçar exemplo", exact: true }).click();
  for (const width of [320, 390, 768, 1100, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth), {
        message: `Home content must fit a ${width}px viewport`,
      })
      .toBeLessThanOrEqual(width);
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
    await expect(page).toHaveTitle(
      "Cozya: os jantares da semana decididos, com a lista do mercado",
    );
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "O que tem pra janta? Já está decidido.",
    );
    await expect(page.locator("#primeiro-convite")).toContainText(
      "14 dias grátis, sem cartão. Não vira assinatura sozinho.",
    );
    await expect(page.locator(".plan-option").first().locator(".plan-price")).toHaveText(
      /R\$\s*14,90\/mês/,
    );
    await expect(page.locator(".plan-option-best .plan-price")).toHaveText(/R\$\s*149,00\/ano/);
    await expect(
      page.getByRole("link", { name: "Assinar o Pro mensal", exact: true }),
    ).toHaveAttribute("href", "/signup?plan=pro&cycle=mensal");
    await expect(
      page.getByRole("link", { name: "Assinar o Pro anual", exact: true }),
    ).toHaveAttribute("href", "/signup?plan=pro&cycle=anual");
    const faq = page
      .locator("#perguntas details")
      .filter({ hasText: "Preciso de cartão para experimentar?" });
    await faq.locator("summary").click();
    await expect(faq.locator("p")).toBeVisible();
    await expect(faq.locator("p")).toContainText("3 créditos de IA para o período");
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
