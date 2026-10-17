import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { db, eq } from "@informach/db";
import { accounts, agendaStudentProfiles, users } from "@informach/db/schema";
import { expect, test } from "@playwright/test";

/**
 * O app não rola de lado no telefone, inclusive no plano gratuito.
 *
 * A barra superior do gratuito já teve um item a mais, o botão "Seja Pro", que
 * somado ao logotipo, ao tema e ao avatar passava dos 360 px. O botão saiu com
 * a página do dia (o Pro aparece quando faz falta), e o teste fica para que a
 * barra continue cabendo e nenhuma tela do gratuito volte a anunciar o Pro em
 * todo lugar.
 */
test("a barra superior cabe no telefone no plano gratuito", async ({ page, context, baseURL }) => {
  test.setTimeout(120_000);
  if (!baseURL) throw new Error("Local app required");
  const id = `app-shell-${randomUUID()}`;
  const email = `${id}@e2e.local`;
  const password = "AppShell!Synthetic2026";
  try {
    const authRequire = createRequire(
      path.resolve(process.cwd(), "../../packages/auth/package.json"),
    );
    const { hashPassword } = await import(
      pathToFileURL(authRequire.resolve("better-auth/crypto")).href
    );
    await db.insert(users).values({ id, name: "Responsável fictício", email, emailVerified: true });
    await db.insert(accounts).values({
      id: randomUUID(),
      userId: id,
      accountId: id,
      providerId: "credential",
      password: await hashPassword(password),
    });
    const [child] = await db
      .insert(agendaStudentProfiles)
      .values({ userId: id, name: "Criança fictícia" })
      .returning();
    if (!child) throw new Error("Missing fixture profile");

    const login = await context.request.post(`${baseURL}/api/auth/sign-in/email`, {
      headers: { Origin: baseURL },
      data: { email, password },
    });
    expect(login.ok()).toBe(true);
    // O grátis vale por padrão: depois do login, a conta vai direto para Hoje.
    await page.goto("/dashboard");

    await page.setViewportSize({ width: 360, height: 780 });
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const route of ["/dashboard", "/atividades", `/atividades/nova?perfil=${child.id}`]) {
        await page.goto(route);
        await expect(page.getByRole("link", { name: /ir para o início/ })).toBeVisible();
        await expect(page.getByRole("link", { name: "Seja Pro", exact: true })).toHaveCount(0);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true);
      }
    }
  } finally {
    await db.delete(users).where(eq(users.id, id));
  }
});
