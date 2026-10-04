import { type BrowserContext, expect, type Page } from "@playwright/test";

/**
 * Fecha um contexto extra (outro aparelho, navegador reaberto) só depois que o
 * service worker de cada página dele estiver ativo.
 *
 * O Chromium headless cai com SIGSEGV ao descartar um contexto enquanto o
 * worker ainda instala, e isso derrubava a desmontagem do teste seguinte com
 * "browserContext.close: Target page, context or browser has been closed".
 * Medido no CI em 04/10/2026 (PR #5): fechar logo após o `load` derrubou o
 * navegador em menos de um minuto; esperar `navigator.serviceWorker.ready`
 * passou 150 vezes em 150. O app registra o worker no `load` de toda página.
 */
export async function closeDevice(context: BrowserContext) {
  for (const page of context.pages())
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
  await context.close();
}

export async function prepareProfile(
  page: Page,
  nickname: string,
  grade = "6",
  course = "olitef-n1",
) {
  await page.goto("/familia/preparar");
  await page.getByLabel("Apelido do estudante").fill(nickname);
  await page.getByLabel("Ano escolar", { exact: true }).selectOption(grade);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Continuar para a trilha" }).click();
  await page.locator(`input[name="first-course"][value="${course}"]`).check();
  await page.getByRole("button", { name: "Criar perfil", exact: true }).click();
  await expect(page.getByRole("heading", { name: `Tudo pronto para ${nickname}.` })).toBeVisible();
}

export async function enterStudy(page: Page, nickname: string, shared = false) {
  await page.getByLabel("Quem vai estudar agora?").selectOption({ label: nickname });
  if (shared) await page.getByLabel(/Permitir trocar entre/).check();
  await page.getByRole("button", { name: `Começar estudo com ${nickname}`, exact: true }).click();
  await expect(page.getByRole("heading", { name: `Olá, ${nickname}.` })).toBeVisible();
}

export async function parentLogin(
  page: Page,
  email: string,
  password = "Missao-Teste-2026-Local!",
  next = "/familia",
) {
  await page.goto(`/entrar?next=${encodeURIComponent(next)}`);
  await page.getByLabel("E-mail do responsável", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar no Missão Saber", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${next.replace(/[?]/g, "\\?")}$`));
}

export async function openStudy(page: Page, nickname: string, shared = false) {
  await page.goto("/estudar");
  await enterStudy(page, nickname, shared);
}

export const startMission = (page: Page) =>
  page.getByRole("button", {
    name: /^(Começar minha primeira missão|Começar missão|Revisar esta ideia)/,
  });
