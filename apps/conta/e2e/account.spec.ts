import { randomBytes, randomUUID } from "node:crypto";
import { getAppUrl } from "@informach/config/domains";
import { db, eq } from "@informach/db";
import { users } from "@informach/db/schema";
import { createFamilyService } from "@informach/family";
import { expect, test } from "@playwright/test";

const accountOrigin = getAppUrl("conta", "development");

test("account, family, people and trial on a disposable database", async ({
  page,
  browser,
}, testInfo) => {
  if (process.env.COMPASSO_ISOLATED_DATABASE !== "1")
    throw new Error("Disposable database required");
  const email = `${randomUUID()}@example.test`;
  await page.context().setExtraHTTPHeaders({
    "X-Real-IP": testInfo.project.name === "desktop" ? "198.51.100.31" : "198.51.100.32",
  });
  const password = randomBytes(18).toString("hex");
  const signup = await page.request.post("/api/auth/sign-up/email", {
    headers: { Origin: accountOrigin },
    data: { email, password, name: "Marina Oliveira" },
  });
  expect(signup.ok(), await signup.text()).toBeTruthy();
  await db.update(users).set({ emailVerified: true }).where(eq(users.email, email));
  await page.goto("/entrar");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Senha", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL(accountOrigin);
  await expect(page.getByRole("heading", { name: "Sua família começa aqui." })).toBeVisible();
  await page.getByLabel("Como você chama sua família?").fill("Família Oliveira");
  await page.getByRole("button", { name: "Criar minha família" }).click();
  await expect(page.getByRole("heading", { name: "Família Oliveira" })).toBeVisible();
  await page.getByText("Adicionar alguém à família", { exact: false }).click();
  await page.getByLabel("Nome", { exact: true }).fill("Ana Oliveira");
  await page.getByRole("button", { name: "Adicionar pessoa", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ana Oliveira" })).toBeVisible();
  await page.getByRole("button", { name: "Experimentar 14 dias sem cartão" }).click();
  await expect(page.getByText("Teste em andamento", { exact: true })).toBeVisible();
  await expect(page.locator(".wallet-balance")).toContainText("20");
  const family = createFamilyService({ db });
  const [actor] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (!actor) throw new Error("Missing account fixture");
  const [group] = await family.listGroups(actor.id);
  if (!group) throw new Error("Missing family fixture");
  const child = (await family.listPeople(actor.id, group.id)).find(
    (person) => person.displayName === "Ana Oliveira",
  );
  if (!child) throw new Error("Missing child fixture");
  await family.activateProfile(
    actor.id,
    { groupId: group.id, personId: child.id, app: "agenda-da-turma" },
    async () => null,
  );

  const guestContext = await browser.newContext({
    baseURL: accountOrigin,
    extraHTTPHeaders: {
      "X-Real-IP": testInfo.project.name === "desktop" ? "198.51.100.35" : "198.51.100.36",
    },
  });
  try {
    const guestEmail = `${randomUUID()}@example.test`;
    const guestPassword = randomBytes(18).toString("hex");
    const guestSignup = await guestContext.request.post("/api/auth/sign-up/email", {
      headers: { Origin: accountOrigin },
      data: { email: guestEmail, password: guestPassword, name: "Rafael Oliveira" },
    });
    expect(guestSignup.ok(), await guestSignup.text()).toBeTruthy();
    await db.update(users).set({ emailVerified: true }).where(eq(users.email, guestEmail));
    await page.reload();
    await page.getByText("Adultos e convites", { exact: true }).click();
    await page.getByLabel("E-mail do adulto").fill(guestEmail);
    await page.getByRole("button", { name: "Criar convite", exact: true }).click();
    await expect(page.getByLabel("Código do convite")).toBeVisible();
    const token = await page.getByLabel("Código do convite").inputValue();
    const guestPage = await guestContext.newPage();
    await guestPage.goto("/entrar");
    await guestPage.getByLabel("E-mail", { exact: true }).fill(guestEmail);
    await guestPage.getByLabel("Senha", { exact: true }).fill(guestPassword);
    await guestPage.getByRole("button", { name: "Entrar", exact: true }).click();
    await guestPage.waitForURL(accountOrigin);
    await guestPage.getByText("Recebi um convite", { exact: true }).click();
    await guestPage.getByLabel("Código recebido").fill(token);
    await guestPage.getByRole("button", { name: "Entrar na família", exact: true }).click();
    await expect(guestPage.getByRole("heading", { name: "Família Oliveira" })).toBeVisible();
    await expect(guestPage.getByRole("heading", { name: "Ana Oliveira", exact: true })).toHaveCount(
      0,
    );

    await page.reload();
    await page.getByText("Pessoas, perfis e permissões", { exact: true }).click();
    await page.getByText("Gerenciar Ana Oliveira", { exact: true }).click();
    const permissions = page
      .locator(".profile-access")
      .filter({ has: page.getByRole("heading", { name: "Agenda da Turma", exact: true }) });
    await permissions
      .getByRole("combobox", { name: "Permissão", exact: true })
      .selectOption("read");
    await permissions.getByRole("button", { name: "Atualizar permissão" }).click();
    await expect(permissions.getByRole("status")).toContainText("Salvo");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page
      .locator(".management-stack")
      .screenshot({ path: testInfo.outputPath("permissions.png") });
    await guestPage.reload();
    await expect(
      guestPage.getByRole("heading", { name: "Ana Oliveira", exact: true }),
    ).toBeVisible();
    await permissions
      .getByRole("combobox", { name: "Alteração", exact: true })
      .selectOption("revoke");
    await permissions
      .getByRole("combobox", { name: "Permissão", exact: true })
      .selectOption("read");
    await permissions.getByRole("button", { name: "Atualizar permissão" }).click();
    await expect(permissions.locator(".access-list")).not.toContainText("Rafael Oliveira");
    await guestPage.reload();
    await expect(guestPage.getByRole("heading", { name: "Ana Oliveira", exact: true })).toHaveCount(
      0,
    );
  } finally {
    await guestContext.close();
  }

  await page.getByLabel("Nome da pessoa", { exact: true }).fill("Ana Maria Oliveira");
  await page.getByRole("button", { name: "Salvar pessoa", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ana Maria Oliveira", exact: true }),
  ).toBeVisible();
  const imported = await family.createPerson(actor.id, {
    groupId: group.id,
    kind: "dependent",
    displayName: "Ana do Missão Saber",
  });
  const importedProfile = await family.activateProfile(
    actor.id,
    { groupId: group.id, personId: imported.id, app: "missao-saber" },
    async () => null,
  );
  await page.reload();
  await page.getByText("Pessoas, perfis e permissões", { exact: true }).click();
  await page.getByText("Gerenciar Ana do Missão Saber", { exact: true }).click();
  await page.getByText("Associar a uma pessoa já cadastrada", { exact: true }).last().click();
  await page
    .getByRole("combobox", { name: "Este perfil pertence a quem?", exact: true })
    .selectOption(child.id);
  await page
    .getByRole("checkbox", {
      name: "Confirmo que os dois perfis são da mesma pessoa.",
      exact: true,
    })
    .check();
  await page.getByRole("button", { name: "Associar este perfil", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ana do Missão Saber", exact: true })).toHaveCount(
    0,
  );
  expect(
    await family.findPersonProfile(actor.id, {
      groupId: group.id,
      personId: child.id,
      app: "missao-saber",
    }),
  ).toMatchObject({ id: importedProfile.profileId });
  await page.getByText("Gerenciar Ana Maria Oliveira", { exact: true }).click();
  await page.getByText("Arquivar nesta família", { exact: true }).click();
  await page
    .getByLabel("Quero arquivar Ana Maria Oliveira nesta família.", { exact: true })
    .check();
  await page.getByRole("button", { name: "Arquivar pessoa", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ana Maria Oliveira", exact: true })).toHaveCount(
    0,
  );
  await page.getByText("Pessoas arquivadas", { exact: true }).click();
  await page
    .getByLabel(
      "Quero restaurar Ana Maria Oliveira e os acessos anteriormente concedidos aos seus perfis nesta família.",
      { exact: true },
    )
    .check();
  await page.getByRole("button", { name: "Restaurar Ana Maria Oliveira", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ana Maria Oliveira", exact: true }),
  ).toBeVisible();
  await page.locator("details").evaluateAll((elements) => {
    for (const element of elements) element.removeAttribute("open");
  });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: testInfo.outputPath("account.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  // Multiple contexts require an explicit choice; neither content nor wallet is auto-selected.
  const otherGroup = await family.createGroup(actor.id, "Outra família");
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Escolha a família que deseja acessar." }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ana Maria Oliveira", exact: true })).toHaveCount(
    0,
  );
  await expect(page.locator(".wallet-balance")).toContainText("selecione uma família");
  await page.getByRole("combobox", { name: "Família", exact: true }).selectOption(otherGroup.id);
  await page.getByRole("button", { name: "Trocar família", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Outra família", exact: true })).toBeVisible();
  await expect(page.locator(".wallet-balance")).toContainText("0");
  await page.getByRole("combobox", { name: "Família", exact: true }).selectOption(group.id);
  await page.getByRole("button", { name: "Trocar família", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ana Maria Oliveira", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".wallet-balance")).toContainText("20");
  // Another family's unguessable ID is still checked server-side, not selected by possession.
  await page.goto(`/?familia=${randomUUID()}`);
  await expect(
    page.getByRole("heading", { name: "Não conseguimos abrir esta página." }),
  ).toBeVisible();
});
