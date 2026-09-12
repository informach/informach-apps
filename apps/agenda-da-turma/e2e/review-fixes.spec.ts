import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { and, db, eq } from "@informach/db";
import {
  accounts,
  agendaActivities,
  agendaActivityStatuses,
  agendaCities,
  agendaNoticeActions,
  agendaNotices,
  agendaProductEvents,
  agendaSchools,
  agendaStudentProfiles,
  agendaSubjects,
  agendaTurmaMembers,
  agendaTurmas,
  customers,
  emailDeliveries,
  subscriptions,
  users,
} from "@informach/db/schema";
import { expect, test } from "@playwright/test";

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing browser fixture");
  return value;
}

test("review fixes: consecutive edits, source scope, reuse for another child and deadline correction", async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  test.setTimeout(300_000);
  if (!baseURL) throw new Error("Local app required");
  const id = `review-fixes-browser-${randomUUID()}`;
  const email = `${id}@e2e.local`;
  const school = `review-browser-${randomUUID()}`;
  let customerId: string | undefined;
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
      password: await hashPassword("ReviewFixes!Synthetic2026"),
    });
    const login = await context.request.post(`${baseURL}/api/auth/sign-in/email`, {
      headers: { Origin: baseURL },
      data: { email, password: "ReviewFixes!Synthetic2026" },
    });
    expect(login.ok()).toBe(true);
    await page.goto("/choose-plan");
    await page.getByRole("button", { name: "Começar grátis", exact: true }).click();
    await expect(page).toHaveURL(/dashboard/);

    const [customer] = await db
      .insert(customers)
      .values({
        provider: "stripe",
        providerCustomerId: `test-${id}`,
        subjectType: "user",
        subjectId: id,
        app: "agenda-da-turma",
        email,
      })
      .returning();
    customerId = required(customer).id;
    await db.insert(subscriptions).values({
      customerId,
      provider: "stripe",
      providerSubscriptionId: `test-${id}`,
      productId: "agenda_da_turma_pro_monthly",
      providerPriceId: "price_synthetic",
      status: "active",
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
    });
    const children = await db
      .insert(agendaStudentProfiles)
      .values([
        { userId: id, name: "Criança A navegador" },
        { userId: id, name: "Criança B navegador" },
      ])
      .returning();
    const child = required(children[0]),
      sibling = required(children[1]);
    const [city] = await db.select().from(agendaCities).limit(1);
    await db.insert(agendaSchools).values({
      inepCode: school,
      cityIbgeCode: required(city).ibgeCode,
      name: "Escola fictícia revisão",
    });
    const [group] = await db
      .insert(agendaTurmas)
      .values({
        schoolInepCode: school,
        createdByUserId: id,
        code: randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase(),
        grade: "4ano",
        year: 2026,
        classLetter: "A",
        shift: "morning",
      })
      .returning();
    const turmaId = required(group).id;
    await db.insert(agendaTurmaMembers).values({ turmaId, studentProfileId: child.id });
    await db
      .update(agendaStudentProfiles)
      .set({ activeTurmaId: turmaId })
      .where(eq(agendaStudentProfiles.id, child.id));
    const [subject] = await db
      .insert(agendaSubjects)
      .values({ turmaId, createdByUserId: id, name: "Matéria de revisão" })
      .returning();
    const date = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const [activity] = await db
      .insert(agendaActivities)
      .values({
        turmaId,
        subjectId: required(subject).id,
        createdByUserId: id,
        type: "task",
        visibility: "individual",
        title: "Atividade versão 1",
        dueAt: date,
      })
      .returning();
    const activityId = required(activity).id;
    await db.insert(agendaActivityStatuses).values({ activityId, studentProfileId: child.id });

    for (const version of [2, 3]) {
      await page.goto("/atividades");
      await page
        .getByRole("button", { name: `Ações para Atividade versão ${version - 1}`, exact: true })
        .click();
      await page.getByRole("menuitem", { name: "Editar", exact: true }).click();
      await page.getByLabel("Atividade", { exact: true }).fill(`Atividade versão ${version}`);
      await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect
        .poll(
          async () =>
            (await db.select().from(agendaActivities).where(eq(agendaActivities.id, activityId)))[0]
              ?.version,
        )
        .toBe(version);
    }
    for (const version of [4, 5]) {
      await page.goto(`/calendario?date=${date}`);
      await page
        .getByRole("button", {
          name: new RegExp(`tarefa de Matéria de revisão: Atividade versão ${version - 1}`),
        })
        .click();
      await page.getByRole("button", { name: "Editar", exact: true }).click();
      await page.getByLabel("Atividade", { exact: true }).fill(`Atividade versão ${version}`);
      await page.getByRole("button", { name: "Salvar alterações", exact: true }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect
        .poll(
          async () =>
            (await db.select().from(agendaActivities).where(eq(agendaActivities.id, activityId)))[0]
              ?.version,
        )
        .toBe(version);
    }
    await page.screenshot({ path: testInfo.outputPath("consecutive-edits.png"), fullPage: true });

    const text = "Publicado em 13/09/2030. Entregar autorização amanhã.";
    const extracted = {
      type: "authorization" as const,
      title: "Entregar autorização",
      description: null,
      dueAt: "2030-09-14",
      dateOrigin: "relative" as const,
      time: null,
      location: null,
      sourceExcerpt: "Entregar autorização amanhã.",
    };
    const [notice] = await db
      .insert(agendaNotices)
      .values({
        ownerUserId: id,
        createdByUserId: id,
        captureProfileId: child.id,
        source: "teams",
        text,
        contentHash: createHash("sha256")
          .update(JSON.stringify([text, null, [], null]))
          .digest("hex"),
        status: "ready",
        parsedResult: {
          actions: [extracted],
          warnings: [],
          publicationReference: { date: "2030-09-13", sourceExcerpt: "Publicado em 13/09/2030." },
        },
      })
      .returning();
    const noticeId = required(notice).id;
    await page.goto(`/recados/novo?retomar=${noticeId}`);
    await expect(
      page.getByText("Publicação identificada: 13/09/2030", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("checkbox", {
        name: "Confirmo que o original contém informações apenas das crianças marcadas abaixo.",
      })
      .check();
    await page.getByRole("button", { name: "Salvar 1 providência", exact: true }).click();
    await expect(page).toHaveURL(/dashboard/);
    expect(
      (await db.select().from(agendaNotices).where(eq(agendaNotices.id, noticeId)))[0]
        ?.sourceProfileIds,
    ).toEqual([child.id]);

    // The actual parse endpoint replays this extraction; no AI provider call.
    await page.goto("/recados/novo");
    await page
      .getByRole("combobox", { name: "Para qual criança?", exact: true })
      .selectOption(sibling.id);
    await page.getByLabel("Cole a mensagem ou publicação").fill(text);
    await page.getByRole("button", { name: "Organizar recado", exact: true }).click();
    await expect(page.getByText(/Este recado já foi aplicado a/)).toBeVisible();
    await page.getByRole("button", { name: "Salvar 1 providência", exact: true }).click();
    await expect(page).toHaveURL(/dashboard/);
    expect(
      await db.select().from(agendaNoticeActions).where(eq(agendaNoticeActions.noticeId, noticeId)),
    ).toHaveLength(2);

    const [before] = await db
      .select()
      .from(agendaNoticeActions)
      .where(
        and(
          eq(agendaNoticeActions.noticeId, noticeId),
          eq(agendaNoticeActions.profileId, child.id),
        ),
      );
    const previous = required(before);
    const [correction] = await db
      .insert(agendaNotices)
      .values({
        ownerUserId: id,
        createdByUserId: id,
        captureProfileId: child.id,
        source: "teams",
        text: "RETIFICAÇÃO: autorização até 16/09/2030",
        contentHash: randomUUID(),
        status: "ready",
        parsedResult: {
          actions: [
            {
              ...extracted,
              dueAt: "2030-09-16",
              dateOrigin: "school",
              sourceExcerpt: "Autorização até 16/09/2030.",
            },
          ],
          warnings: [],
        },
      })
      .returning();
    await page.goto(`/recados/novo?retomar=${required(correction).id}`);
    await page.getByRole("button", { name: "Salvar 1 providência", exact: true }).click();
    await expect(page.getByLabel("Correção da providência 1")).toBeVisible();
    await page.getByLabel("Correção da providência 1").selectOption(previous.id);
    await page.screenshot({ path: testInfo.outputPath("deadline-correction.png"), fullPage: true });
    await page.getByRole("button", { name: "Salvar 1 providência", exact: true }).click();
    await expect(page).toHaveURL(/dashboard/);
    const after = await db
      .select()
      .from(agendaNoticeActions)
      .where(eq(agendaNoticeActions.profileId, child.id));
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ id: previous.id, version: 2, dueAt: "2030-09-16" });
    expect(
      (
        await db
          .select()
          .from(agendaNoticeActions)
          .where(eq(agendaNoticeActions.profileId, sibling.id))
      )[0]?.dueAt,
    ).toBe("2030-09-14");
  } finally {
    await db.delete(agendaTurmas).where(eq(agendaTurmas.schoolInepCode, school));
    await db.delete(agendaSchools).where(eq(agendaSchools.inepCode, school));
    await db.delete(agendaProductEvents).where(eq(agendaProductEvents.userId, id));
    await db.delete(emailDeliveries).where(eq(emailDeliveries.userId, id));
    await db.delete(users).where(eq(users.id, id));
    if (customerId) {
      await db.delete(subscriptions).where(eq(subscriptions.customerId, customerId));
      await db.delete(customers).where(eq(customers.id, customerId));
    }
  }
});
