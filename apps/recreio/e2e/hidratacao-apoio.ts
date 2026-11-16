import { expect, type Locator, type Page, type Route } from "@playwright/test";

/** HTML e servidor reais. Estes ensaios reservam a interceptação de página para este bloqueio. */
export async function conferirCarregamento(page: Page, controles: Locator[]) {
  let liberar: (() => void) | undefined;
  let bloqueados = 0;
  const scripts = new Promise<void>((resolver) => {
    liberar = resolver;
  });
  const padrao = (url: URL) =>
    url.pathname.startsWith("/_next/static/") && url.pathname.endsWith(".js");
  const bloquear = async (rota: Route) => {
    bloqueados++;
    await scripts;
    await rota.fallback();
  };
  await page.route(padrao, bloquear);
  try {
    await page.reload({ waitUntil: "commit" });
    await expect.poll(() => bloqueados).toBeGreaterThan(0);
    for (const controle of controles) await expect(controle).toBeDisabled();
  } finally {
    liberar?.();
    await page.unrouteAll({ behavior: "wait" });
  }
  for (const controle of controles) await expect(controle).toBeEnabled();
}
