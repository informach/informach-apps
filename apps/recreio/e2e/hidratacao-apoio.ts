import { expect, type Locator, type Page, type Route } from "@playwright/test";

/** HTML e servidor reais; só a chegada dos scripts fica suspensa, sem espera fixa. */
export async function conferirCarregamento(page: Page, controles: Locator[]) {
  let liberar: (() => void) | undefined;
  let bloqueados = 0;
  const scripts = new Promise<void>((resolver) => {
    liberar = resolver;
  });
  const padrao = "**/_next/static/**/*.js";
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
    await page.unroute(padrao, bloquear);
  }
  for (const controle of controles) await expect(controle).toBeEnabled();
}
