import { expect, type Locator, type Page } from "@playwright/test";
import { suspenderScriptsDoPortal } from "./apoio";

/** HTML e servidor reais; só a chegada dos scripts fica suspensa, sem espera fixa. */
export async function conferirCarregamento(page: Page, controles: Locator[]) {
  const pausa = suspenderScriptsDoPortal(page.context());
  try {
    await page.reload({ waitUntil: "commit" });
    await expect.poll(pausa.contar).toBeGreaterThan(0);
    for (const controle of controles) await expect(controle).toBeDisabled();
  } finally {
    pausa.liberar();
  }
  for (const controle of controles) await expect(controle).toBeEnabled();
}
