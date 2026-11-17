import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { browserFamily, browserProfile, enterAgenda } from "./fixtures/compasso";

/**
 * O app não rola de lado no telefone, inclusive no plano gratuito.
 *
 * A barra superior do gratuito já teve um item a mais, o botão "Seja Pro", que
 * somado ao logotipo, ao tema e ao avatar passava dos 360 px. Hoje o topo do
 * celular é o símbolo e a conta, e só em Hoje. O botão saiu com
 * a página do dia (o Pro aparece quando faz falta), e o teste fica para que a
 * barra continue cabendo e nenhuma tela do gratuito volte a anunciar o Pro em
 * todo lugar.
 */
test("a barra superior cabe no telefone no plano gratuito", async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  if (!baseURL) throw new Error("Local app required");
  const id = `app-shell-${randomUUID()}`;
  const email = `${id}@e2e.local`;
  const password = "AppShell!Synthetic2026";
  const f = await browserFamily({ id, email, password });
  const child = await browserProfile(f, "Criança fictícia");
  await enterAgenda(page, f);
  await page.setViewportSize({ width: 360, height: 780 });
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    for (const route of ["/dashboard", "/atividades", `/atividades/nova?perfil=${child.id}`]) {
      await page.goto(route);
      // Como no canvas, o símbolo e a conta ficam no topo de Hoje; as outras
      // telas começam pelo próprio título.
      if (route === "/dashboard")
        await expect(
          page.getByRole("link", { name: "Agenda da Turma, ir para Hoje" }),
        ).toBeVisible();
      else await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await expect(page.getByRole("link", { name: "Seja Pro", exact: true })).toHaveCount(0);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    }
  }
});
