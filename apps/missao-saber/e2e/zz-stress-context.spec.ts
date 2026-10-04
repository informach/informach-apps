// DIAGNÓSTICO TEMPORÁRIO (branch diag/chromium-sw-dispose): não vai para a main.
import { expect, type Page, test } from "@playwright/test";

const ITERATIONS = 150;

async function swState(tab: Page) {
  return tab.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return "unregistered";
    if (registration.installing) return "installing";
    if (registration.waiting) return "waiting";
    return registration.active ? "active" : "none";
  });
}

for (const variant of ["close-after-load", "close-after-sw-ready"] as const) {
  test(`stress ${variant}`, async ({ page, browser, baseURL }) => {
    test.setTimeout(900_000);
    // O contexto padrão fica vivo com uma página carregada, como no teste do CI.
    await page.goto("/estudar");
    const states: Record<string, number> = {};
    for (let i = 0; i < ITERATIONS; i++) {
      const extra = await browser.newContext({ baseURL });
      const tab = await extra.newPage();
      await tab.goto("/estudar");
      if (variant === "close-after-sw-ready")
        await tab.evaluate(async () => {
          await navigator.serviceWorker.ready;
        });
      const state = await swState(tab);
      states[state] = (states[state] ?? 0) + 1;
      await extra.close();
      // Dá ao navegador o mesmo intervalo que o teste real dá antes da desmontagem.
      await page.waitForTimeout(50);
      expect(browser.isConnected(), `disconnected at ${i} ${JSON.stringify(states)}`).toBe(true);
      expect(await page.evaluate(() => document.readyState)).toBe("complete");
    }
    console.log(`STATES ${variant} ${JSON.stringify(states)}`);
  });
}
