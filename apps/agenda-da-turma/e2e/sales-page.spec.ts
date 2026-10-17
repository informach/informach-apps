import { expect, test } from "@playwright/test";

test.setTimeout(120_000);

const DAY = /(seg|ter|qua|qui|sex|sáb|dom), \d+/;

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
  // O cartaz de provas abre a demonstração: uma atividade por matéria.
  await expect(demo.getByText("A Agenda achou 4 provas para Clara")).toBeVisible();
  await expect(demo.getByText(/Inglês não está nas matérias de Clara/)).toBeVisible();

  // Passeio: a autorização tem a data da escola; o boné não tem data, e
  // planejar para a véspera é uma decisão da família, dita como tal.
  await demo.getByRole("button", { name: "Passeio", exact: true }).click();
  await expect(demo.getByText("A Agenda achou 3 atividades para Clara")).toBeVisible();
  await expect(demo.getByText("Material · sem data, a confirmar")).toBeVisible();
  const plan = demo.getByRole("button", { name: "Planejar para a véspera" });
  await plan.focus();
  await page.keyboard.press("Enter");
  await expect(demo.getByRole("button", { name: /^Planejado para / })).toBeDisabled();
  await expect(demo.getByText(/^Material · .+, planejado por vocês$/)).toBeVisible();
  await expect(demo.getByText(/^Autorização · .+, a escola disse$/)).toBeVisible();

  // Tirar e Manter pelo teclado, e o botão de salvar acompanha a conta.
  const remove = demo.getByRole("button", { name: "Tirar: Passeio ao museu" });
  await remove.focus();
  await page.keyboard.press("Space");
  await expect(demo.getByRole("button", { name: "Manter: Passeio ao museu" })).toBeVisible();
  await expect(demo.getByRole("button", { name: "Salvar 2 atividades" })).toBeVisible();
  await demo.getByRole("button", { name: "Manter: Passeio ao museu" }).click();
  await demo.getByRole("button", { name: "Salvar 3 atividades" }).click();
  await expect(demo.getByText("Salvo na agenda de Clara")).toBeVisible();
  await expect(demo.getByText("Passeio ao museu", { exact: true })).toBeVisible();
  await demo.getByRole("button", { name: "Recomeçar o teste" }).click();

  // O cartaz vai além de sete dias: as quatro provas continuam no salvo, cada
  // uma no seu dia. Era uma grade de sete dias e três delas sumiam.
  await demo.getByRole("button", { name: "Cartaz de provas", exact: true }).click();
  await demo.getByRole("button", { name: "Salvar 4 provas" }).click();
  for (const title of [
    "Prova de Português",
    "Prova de Matemática",
    "Prova de Ciências",
    "Prova de Inglês",
  ])
    await expect(demo.getByText(title, { exact: true })).toBeVisible();
  await expect(demo.locator("li").filter({ hasText: "Prova de Inglês" })).toContainText(DAY);

  await demo.getByRole("button", { name: "Recomeçar o teste" }).click();
  await demo.getByRole("button", { name: "Material", exact: true }).click();
  await expect(demo.getByText("A Agenda achou 1 atividade para Clara")).toBeVisible();

  await expect.poll(() => events.filter((e) => e.action === "complete").length).toBe(2);
  expect(events.filter((e) => e.action === "plan")).toHaveLength(1);
  expect(events.filter((e) => e.event === "landing_view")).toHaveLength(1);
  expect(events.every((e) => e.variant === "pagina-do-dia-v1")).toBe(true);
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
    const pricing = page.locator("#planos");
    await expect(pricing.getByRole("button", { name: "Mensal", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(pricing).toContainText("19,90");
    if (selection === "annual") {
      await pricing.getByRole("button", { name: /^Anual/ }).click();
      await expect(pricing).toContainText("199,00");
      await expect(pricing).toContainText("pague 10 meses, use 12");
      await expect(pricing).toContainText("16,58");
    }
    const cta =
      selection === "free"
        ? page.locator('[data-landing-placement="hero"]')
        : pricing.getByRole("link", { name: "Assinar o Pro" });
    await cta.click();
    await expect(page).toHaveURL(
      selection === "free"
        ? /\/signup$/
        : new RegExp(`/signup\\?plan=pro&cycle=${selection === "annual" ? "anual" : "mensal"}`),
    );
    // O cadastro diz para onde vai: o Pro escolhido segue para o pagamento
    // depois do código; o resto, para a criança e o primeiro recado.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      selection === "free"
        ? "Vamos começar pelo recado que está te preocupando."
        : "Crie a conta para assinar o Pro",
    );
    await expect(
      page.getByText(selection === "free" ? "Passo 1 de 4: Conta" : "Passo 1 de 3: Conta"),
    ).toBeVisible();
    await expect.poll(() => events.filter((e) => e.event === "landing_cta").length).toBe(1);
    expect(events.find((e) => e.event === "landing_cta")).toMatchObject({
      firstCta: true,
      placement: selection === "free" ? "hero" : "pricing",
      selection: selection === "free" ? { plan: "free" } : { plan: "pro", cycle: selection },
    });
  });
}

test("responsive light and dark layouts, FAQ keyboard, contact and legal navigation", async ({
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
  await expect(page.getByText("A Agenda achou 1 atividade para Clara")).toBeVisible();
  await page.getByRole("button", { name: "Cartaz de provas", exact: true }).click();
  await expect(page.getByText("A Agenda achou 4 provas para Clara")).toBeVisible();

  // Nenhum e-mail de contato na página pública: o canal é o direct.
  expect(await page.locator('a[href^="mailto:"]').count()).toBe(0);
  await expect(page.getByRole("link", { name: "Mandar um direct" })).toHaveAttribute(
    "href",
    "https://ig.me/m/criecomhelenaejulio",
  );
  // "Quem faz" usa a foto e o texto do site da Informach, servidos daqui.
  const who = page.locator("#quem-faz");
  await expect(who.getByRole("heading", { level: 2 })).toHaveText(
    "Uma família que faz tecnologia para outras famílias.",
  );
  await expect(
    who.getByRole("img", { name: "Helena e Júlio sorrindo, lado a lado" }),
  ).toBeVisible();
  expect(
    await who.getByRole("img").evaluate((img) => (img as HTMLImageElement).naturalWidth),
  ).toBeGreaterThan(0);
  // Nenhum travessão no texto visível.
  expect(await page.locator("body").innerText()).not.toMatch(
    new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`),
  );

  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      // Um "Entrar" por largura: na barra do computador ou ao lado do menu.
      await expect(
        page
          .getByRole("banner")
          .getByRole("link", { name: "Entrar", exact: true })
          .filter({ visible: true }),
      ).toHaveCount(1);
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

  // No celular, a navegação mora num menu que abre com o teclado.
  await page.setViewportSize({ width: 390, height: 1000 });
  await page.locator("summary").filter({ hasText: "Menu" }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("navigation", { name: "Menu" }).getByRole("link", { name: "Planos" }),
  ).toBeVisible();
  await page.keyboard.press("Enter");
  await page.setViewportSize({ width: 1440, height: 1000 });

  const question = page.locator("summary").filter({ hasText: "Marcar como feito avisa a escola?" });
  await question.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Feito vale só para a sua casa.", { exact: false })).toBeVisible();

  await page.getByRole("link", { name: "Privacidade", exact: true }).click();
  await page.waitForURL(/\/privacidade$/);
  await expect(page).toHaveURL(/\/privacidade$/);
  await page
    .getByRole("navigation", { name: "Navegação do rodapé" })
    .getByRole("link", { name: "Como funciona" })
    .click();
  await page.waitForURL(/\/#como-funciona$/);
  await expect(page.locator("#how-title")).toBeInViewport();
  expect(errors).toEqual([]);
});
