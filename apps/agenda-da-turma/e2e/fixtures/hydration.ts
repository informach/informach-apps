import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Espera o React assumir o elemento. Um toque num link antes da hidratação se
 * perde no `next dev` frio (o roteador intercepta e não navega), e o teste
 * clicava cedo demais nas telas que compilam na primeira visita.
 */
export async function waitForHydration(locator: Locator, timeout = 30_000) {
  await expect
    .poll(
      () =>
        locator.evaluate((element) =>
          Object.keys(element).some((key) => key.startsWith("__reactProps$")),
        ),
      { timeout },
    )
    .toBe(true);
}

/**
 * Espera a página inteira do app: o rodapé mora numa fronteira de `Suspense`
 * própria (lê `?perfil=`) e hidrata depois da lista. Navegar antes disso faz o
 * rodapé hidratar já no endereço novo, com outra aba acesa.
 */
export async function waitForAppHydration(page: Page, timeout = 30_000) {
  await waitForHydration(
    // O rodapé do celular (a barra do computador tem o mesmo nome, mas é outra).
    page.locator('nav[aria-label="Navegação principal"].fixed').getByRole("link").first(),
    timeout,
  );
}
