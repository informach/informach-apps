import { randomBytes, randomUUID } from "node:crypto";
import { getAppUrl } from "@informach/config/domains";
import { and, db, eq } from "@informach/db";
import { sessions, users } from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { expect, type Page, test } from "@playwright/test";

test("transfers common identity only after the other adult accepts", async ({
  page,
  browser,
}, testInfo) => {
  if (process.env.COMPASSO_ISOLATED_DATABASE !== "1")
    throw new Error("Disposable database required");
  const origin = getAppUrl("conta", "development");
  async function signup(target: Page, name: string, ip: string) {
    await target.context().setExtraHTTPHeaders({ "X-Real-IP": ip });
    const email = `${randomUUID()}@example.test`;
    const password = randomBytes(20).toString("hex");
    const response = await target.request.post(`${origin}/api/auth/sign-up/email`, {
      headers: { Origin: origin },
      data: { email, password, name },
    });
    expect(response.ok()).toBeTruthy();
    const [actor] = await db
      .update(users)
      .set({ emailVerified: true })
      .where(eq(users.email, email))
      .returning({ id: users.id });
    if (!actor) throw new Error("Missing fixture");
    return { id: actor.id, email, password };
  }
  async function login(target: Page, actor: { email: string; password: string }) {
    await target.goto(`${origin}/entrar`);
    await target.getByLabel("E-mail", { exact: true }).fill(actor.email);
    await target.getByLabel("Senha", { exact: true }).fill(actor.password);
    await target.getByRole("button", { name: "Entrar", exact: true }).click();
    await target.waitForURL(origin);
  }
  const context = await browser.newContext({ baseURL: origin, viewport: page.viewportSize() });
  try {
    const recipientPage = await context.newPage();
    const desktop = testInfo.project.name === "desktop";
    const source = await signup(
      page,
      "Marina Oliveira",
      desktop ? "198.51.100.91" : "198.51.100.92",
    );
    const target = await signup(
      recipientPage,
      "Rafael Oliveira",
      desktop ? "198.51.100.93" : "198.51.100.94",
    );
    const family = createFamilyService({ db });
    const group = await family.createGroup(source.id, "Família Oliveira");
    const invitation = await family.createInvitation(source.id, group.id, target.email);
    await family.acceptInvitation(target.id, invitation.token);
    const child = await family.createPerson(source.id, {
      groupId: group.id,
      kind: "dependent",
      displayName: "Ana Oliveira",
    });
    await family.activateProfile(
      source.id,
      { groupId: group.id, personId: child.id, app: "agenda-da-turma" },
      async () => null,
    );
    await login(page, source);
    await page.getByText("Pessoas, perfis e permissões", { exact: true }).click();
    await page.getByText("Gerenciar Ana Oliveira", { exact: true }).click();
    await page.getByText("Transferir o cadastro de Ana Oliveira", { exact: true }).click();
    const form = page.locator(".person-transfer-form");
    await form
      .getByRole("combobox", { name: "Adulto que assumirá o cadastro" })
      .selectOption(target.id);
    await form.getByRole("checkbox").check();
    await db
      .update(sessions)
      .set({ createdAt: new Date(Date.now() - 16 * 60_000) })
      .where(and(eq(sessions.userId, source.id), eq(sessions.originApp, "conta")));
    await form.getByRole("button", { name: "Pedir transferência do cadastro" }).click();
    await expect(form.getByRole("status")).toContainText("Entre novamente");
    expect((await family.familyManagement(source.id, group.id)).transfers).toHaveLength(0);
    await form.getByRole("link", { name: "Confirmar minha entrada" }).click();
    await page.getByLabel("E-mail", { exact: true }).fill(source.email);
    await page.getByLabel("Senha", { exact: true }).fill(source.password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.waitForURL(`${origin}/?familia=${group.id}`);
    await page.getByText("Pessoas, perfis e permissões", { exact: true }).click();
    await page.getByText("Gerenciar Ana Oliveira", { exact: true }).click();
    await page.getByText("Transferir o cadastro de Ana Oliveira", { exact: true }).click();
    await form.getByRole("checkbox").check();
    await form.getByRole("button", { name: "Pedir transferência do cadastro" }).click();
    await expect(page.locator(".person-transfer-requests")).toContainText("Rafael Oliveira");
    await expect(page.getByLabel("Nome da pessoa", { exact: true })).toHaveValue("Ana Oliveira");
    await login(recipientPage, target);
    const request = recipientPage.locator(".person-transfer-requests");
    await expect(request).toContainText("Ana Oliveira");
    await request.screenshot({ path: testInfo.outputPath("transfer-request.png") });
    expect(
      (await family.listPeople(target.id, group.id)).some((person) => person.id === child.id),
    ).toBe(false);
    await request.getByRole("checkbox").check();
    await request.getByRole("button", { name: "Aceitar responsabilidade pelo cadastro" }).click();
    await expect(request).toHaveCount(0);
    await recipientPage.getByText("Pessoas, perfis e permissões", { exact: true }).click();
    await recipientPage.getByText("Gerenciar Ana Oliveira", { exact: true }).click();
    await expect(recipientPage.getByLabel("Nome da pessoa", { exact: true })).toHaveValue(
      "Ana Oliveira",
    );
    await recipientPage
      .locator(".management-stack")
      .screenshot({ path: testInfo.outputPath("transfer-recipient.png") });
    expect(
      (await family.familyManagement(target.id, group.id)).profiles.find(
        (profile) => profile.personId === child.id,
      )?.actions,
    ).toEqual([]);
    await expect(
      recipientPage
        .locator(".profile-access")
        .getByRole("combobox", { name: "Permissão", exact: true }),
    ).toHaveCount(0);
    await page.reload();
    await page.getByText("Pessoas, perfis e permissões", { exact: true }).click();
    await page.getByText("Gerenciar Ana Oliveira", { exact: true }).click();
    await expect(page.getByLabel("Nome da pessoa", { exact: true })).toHaveCount(0);
    await expect(
      page.locator(".profile-access").getByRole("combobox", { name: "Permissão", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page
      .locator(".management-stack")
      .screenshot({ path: testInfo.outputPath("identity-transferred.png") });
  } finally {
    await context.close();
  }
});
