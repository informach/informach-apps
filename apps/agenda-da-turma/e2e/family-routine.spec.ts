import { and, db, eq } from "@informach/db";
import { agendaStudentProfiles, agendaTasks, familyAppProfiles } from "@informach/db/schema";
import { expect, test } from "@playwright/test";
import { browserFamily, browserProfile, enterAgenda, family } from "./fixtures/compasso";

test("two adults share only authorized school profiles and revocation reaches open sessions", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  if (!baseURL) throw new Error("Missing local URL");
  const runtimeErrors: string[] = [];
  page.on("pageerror", (e) => runtimeErrors.push(e.message));
  page.on("console", (m) => {
    if (
      /Content Security Policy|Refused to execute|violates.*directive|controlled input|hydration|hydrated/i.test(
        m.text(),
      )
    )
      runtimeErrors.push(m.text());
  });
  const owner = await browserFamily({ paid: true });
  const person = await family.createPerson(owner.id, {
    groupId: owner.groupId,
    kind: "dependent",
    displayName: "Criança A fictícia",
  });
  await enterAgenda(page, owner);
  await page.goto("/familia");
  await page.getByRole("button", { name: /Adicionar criança/ }).click();
  const dialog = page.getByRole("dialog", { name: "Adicionar criança à Agenda" });
  await expect(page.getByRole("dialog").getByRole("combobox")).toBeEnabled();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox", { name: "Criança", exact: true }).selectOption(person.id);
  await dialog.getByRole("button", { name: "Adicionar à Agenda", exact: true }).click();
  await expect(dialog).toBeHidden();
  const [child] = await db
    .select({ id: agendaStudentProfiles.id })
    .from(agendaStudentProfiles)
    .innerJoin(familyAppProfiles, eq(familyAppProfiles.id, agendaStudentProfiles.familyProfileId))
    .where(
      and(eq(familyAppProfiles.groupId, owner.groupId), eq(familyAppProfiles.personId, person.id)),
    );
  if (!child) throw new Error("Missing school profile created through UI");
  await browserProfile(owner, "Criança B restrita");
  await page.goto(`/atividades/nova?perfil=${child.id}`);
  await page.getByLabel("Atividade", { exact: true }).fill("Preparar mochila fictícia");
  await page.getByRole("combobox", { name: "Tipo", exact: true }).selectOption("material");
  await page.getByRole("button", { name: "Salvar 1 material", exact: true }).click();
  await expect(page).toHaveURL(/\/atividades\?perfil=/);
  const guest = await browserFamily();
  const invitation = await family.createInvitation(owner.id, owner.groupId, guest.email);
  await family.acceptInvitation(guest.id, invitation.token);
  const target = {
    groupId: owner.groupId,
    personId: person.id,
    app: "agenda-da-turma",
    userId: guest.id,
  };
  for (const action of ["read", "write"] as const)
    await family.grantAccess(owner.id, { ...target, action });
  const guestContext = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 } });
  try {
    const guestPage = await guestContext.newPage();
    await enterAgenda(guestPage, guest, "/contexto");
    await guestPage
      .getByRole("combobox", { name: "Família", exact: true })
      .selectOption(owner.groupId);
    await guestPage.getByRole("button", { name: "Continuar", exact: true }).click();
    await expect(guestPage).toHaveURL(/\/dashboard$/);
    await expect(guestPage.getByText("Criança B restrita", { exact: true })).toHaveCount(0);
    await guestPage.goto("/atividades");
    await guestPage
      .getByRole("button", { name: "Marcar como feito: Preparar mochila fictícia", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (await db.select().from(agendaTasks).where(eq(agendaTasks.profileId, child.id)))[0]
            ?.status,
      )
      .toBe("done");
    await page.goto("/atividades?situacao=all");
    await expect(
      page.getByRole("button", { name: "Reabrir: Preparar mochila fictícia", exact: true }),
    ).toBeVisible();
    const staleExport = await guestPage.request.get(
      `${baseURL}/api/data/export?familia=${guest.groupId}`,
    );
    expect(staleExport.status()).toBe(409);
    const exportResponse = await guestPage.request.get(
      `${baseURL}/api/data/export?familia=${owner.groupId}`,
    );
    expect(exportResponse.status()).toBe(200);
    expect((await exportResponse.json()).profiles).toHaveLength(1);
    await family.revokeAccess(owner.id, { ...target, action: "write" });
    await guestPage.goto("/atividades?situacao=all");
    const readonly = guestPage.getByRole("button", {
      name: "Reabrir: Preparar mochila fictícia",
      exact: true,
    });
    await expect(readonly).toHaveCount(0);
    await expect(
      guestPage.getByRole("link", { name: "Preparar mochila fictícia", exact: true }),
    ).toBeVisible();
    await family.revokeAccess(owner.id, { ...target, action: "read" });
    await guestPage.reload();
    await expect(
      guestPage.getByRole("link", { name: "Preparar mochila fictícia", exact: true }),
    ).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: testInfo.outputPath("family-permissions.png"), fullPage: true });
    const ownerExport = await page.request.get(
      `${baseURL}/api/data/export?familia=${owner.groupId}`,
    );
    expect(ownerExport.status()).toBe(200);
    expect((await ownerExport.json()).profiles).toHaveLength(2);
    expect(runtimeErrors).toEqual([]);
  } finally {
    await guestContext.close();
  }
});
