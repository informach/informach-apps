import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
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
  agendaStates,
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
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && /hydrat|Content Security Policy/i.test(message.text()))
      runtimeErrors.push(message.text());
  });
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
    // The browser fixture must also work against the empty reference tables in CI.
    await db.insert(agendaStates).values({ uf: school, ibgeCode: school, name: "Estado fictício" });
    await db.insert(agendaCities).values({
      ibgeCode: school,
      stateUf: school,
      name: "Cidade fictícia",
    });
    await db.insert(agendaSchools).values({
      inepCode: school,
      cityIbgeCode: school,
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

    await test.step("activities use one creation flow and filters preserve the selected child", async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/dashboard?perfil=${child.id}`);
      const schoolAccess = page.getByRole("region", { name: "Atividades", exact: true });
      await expect(schoolAccess).toBeInViewport();
      for (const [label, route] of [
        ["Ver atividades", "/atividades"],
        ["Ver calendário", "/calendario"],
        ["Importar mensagem ou foto", "/recados/novo"],
      ] as const) {
        await expect(page.getByRole("link", { name: label, exact: true })).toHaveCount(1);
        await expect(schoolAccess.getByRole("link", { name: label, exact: true })).toHaveAttribute(
          "href",
          `${route}?perfil=${child.id}`,
        );
      }
      await expect(
        page.getByRole("navigation", { name: "Navegação principal" }).getByRole("link", {
          name: "Atividades",
          exact: true,
        }),
      ).toBeInViewport();
      await page.screenshot({
        path: testInfo.outputPath("school-access-mobile.png"),
        caret: "initial",
      });
      await schoolAccess.getByRole("link", { name: "Ver atividades", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/atividades\\?perfil=${child.id}$`));
      for (const width of [360, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        await expect(page.getByRole("button", { name: "Nova atividade", exact: true })).toHaveCount(
          1,
        );
        await expect(
          page.getByRole("button", { name: "Nova atividade", exact: true }),
        ).toBeInViewport();
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true);
        await page.screenshot({
          path: testInfo.outputPath(`school-create-${width}.png`),
          caret: "initial",
        });
      }
      await page.setViewportSize({ width: 390, height: 844 });
      for (const [label, type] of [
        ["Para casa", "task"],
        ["Trabalho", "project"],
        ["Prova", "exam"],
      ] as const) {
        await page.getByRole("button", { name: "Nova atividade", exact: true }).click();
        const dialog = page.getByRole("dialog");
        await dialog.getByRole("combobox", { name: "Tipo", exact: true }).click();
        await page
          .getByRole("option", {
            name: label === "Para casa" ? "Para casa (tarefa)" : label,
            exact: true,
          })
          .click();
        await expect(dialog.getByRole("combobox", { name: "Tipo", exact: true })).toContainText(
          label,
        );
        await dialog.getByRole("combobox", { name: "Matéria", exact: true }).click();
        await page.getByRole("option", { name: "Matéria de revisão", exact: true }).click();
        await dialog.getByLabel("Atividade", { exact: true }).fill(`Cadastro direto: ${label}`);
        await dialog.getByLabel("Data de entrega").fill(date);
        await dialog.getByRole("button", { name: "Criar atividade", exact: true }).click();
        await expect(dialog).toHaveCount(0);
        const [saved] = await db
          .select()
          .from(agendaActivities)
          .where(
            and(
              eq(agendaActivities.createdByUserId, id),
              eq(agendaActivities.title, `Cadastro direto: ${label}`),
            ),
          );
        expect(saved).toMatchObject({ type, turmaId, dueAt: date });
      }
      const typeFilter = page.getByRole("combobox", { name: "Tipo de atividade", exact: true });
      await typeFilter.click();
      await page.getByRole("option", { name: "Prova", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/atividades\\?perfil=${child.id}&tipo=exam$`));
      await expect(
        page.getByRole("button", { name: "Ações para Cadastro direto: Prova", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Ações para Cadastro direto: Trabalho", exact: true }),
      ).toHaveCount(0);
      await page.getByRole("combobox", { name: "Estudante", exact: true }).click();
      await page.getByRole("option", { name: "Criança B navegador", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/atividades\\?perfil=${sibling.id}&tipo=exam$`));
      await expect(
        page.getByText("Nenhuma atividade com esses filtros", { exact: true }),
      ).toBeVisible();
      await page.getByRole("link", { name: "Ver todos os tipos", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/atividades\\?perfil=${sibling.id}$`));
      await page.goto(`/atividades?perfil=${child.id}&tipo=invalid`);
      await expect(typeFilter).toContainText("Todos os tipos");
      await expect(
        page.getByRole("button", { name: "Ações para Cadastro direto: Trabalho", exact: true }),
      ).toBeVisible();
      await page.goto(`/calendario?date=${date}`);
      await page.getByRole("button", { name: "Nova atividade", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Nova atividade" })).toBeVisible();
      await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    });

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
    await page.getByRole("button", { name: "Salvar 1 atividade", exact: true }).click();
    await expect(page).toHaveURL(/atividades/);
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
    const [replayedExtraction] = await Promise.all([
      page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/recados/parse" &&
          response.request().method() === "POST",
      ),
      page.getByRole("button", { name: "Identificar atividades", exact: true }).click(),
    ]);
    expect(replayedExtraction.status()).toBe(200);
    await expect(page.getByText(/Este recado já foi aplicado a/)).toBeVisible();
    await page.getByRole("button", { name: "Salvar 1 atividade", exact: true }).click();
    await expect(page).toHaveURL(/atividades/);
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
    await page.getByRole("button", { name: "Salvar 1 atividade", exact: true }).click();
    await expect(page.getByLabel("Correção da atividade 1")).toBeVisible();
    await page.getByLabel("Correção da atividade 1").selectOption(previous.id);
    await page.screenshot({ path: testInfo.outputPath("deadline-correction.png"), fullPage: true });
    await page.getByRole("button", { name: "Salvar 1 atividade", exact: true }).click();
    await expect(page).toHaveURL(/atividades/);
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

    // Replay a persisted vision result through the real upload endpoint. No live AI call.
    const photoBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
    const homework = {
      ...extracted,
      type: "task" as const,
      title: "Matemática: páginas 20 e 21",
      dueAt: "2030-09-15",
      sourceExcerpt: "Anotado em 14/09/2030. Para casa amanhã: páginas 20 e 21.",
    };
    const exam = {
      ...extracted,
      type: "exam" as const,
      title: "Prova de ciências da agenda",
      dueAt: null,
      dateOrigin: "unspecified" as const,
      sourceExcerpt: "Prova de ciências — data ilegível.",
    };
    const [photoNotice] = await db
      .insert(agendaNotices)
      .values({
        ownerUserId: id,
        createdByUserId: id,
        captureProfileId: child.id,
        source: "notebook",
        text: "",
        attachmentName: "agenda-sintetica.png",
        attachmentType: "image/png",
        attachmentData: photoBase64,
        attachmentExpiresAt: new Date(Date.now() + 30 * 86400000),
        contentHash: createHash("sha256")
          .update(JSON.stringify(["", photoBase64, [], "2030-09-14"]))
          .digest("hex"),
        status: "ready",
        parsedResult: {
          actions: [homework, exam],
          warnings: ["Confira a data da prova; a anotação está ilegível."],
          publicationReference: null,
        },
      })
      .returning();
    const photoId = required(photoNotice).id;
    await page.goto(`/atividades?perfil=${child.id}`);
    await page.getByRole("link", { name: "Importar mensagem ou foto", exact: true }).click();
    await expect(
      page.getByRole("combobox", { name: "Para qual criança?", exact: true }),
    ).toHaveValue(child.id);
    await expect(page.locator("#notice-camera")).toHaveAttribute("capture", "environment");
    await page.locator("#notice-camera").setInputFiles({
      name: "agenda-sintetica.png",
      mimeType: "image/png",
      buffer: Buffer.from(photoBase64, "base64"),
    });
    await expect(
      page.getByRole("combobox", { name: "O que você vai importar?", exact: true }),
    ).toHaveValue("notebook");
    await expect(page.getByRole("img", { name: "Foto selecionada para leitura" })).toBeVisible();
    await expect(
      page.getByLabel("Observação para acompanhar a foto (opcional)", { exact: true }),
    ).toHaveValue("");
    await page.getByLabel("Data da anotação (se conhecida)").fill("2030-09-14");
    await page.getByRole("button", { name: "Identificar atividades", exact: true }).click();
    await expect(
      page.getByText("Confira a data da prova; a anotação está ilegível.", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Salvar 2 atividades", exact: true }).click();
    await expect(page).toHaveURL(/atividades/);
    await expect(page.getByRole("link", { name: homework.title, exact: true })).toBeVisible();
    const examCard = page
      .getByRole("article")
      .filter({ has: page.getByRole("link", { name: exam.title, exact: true }) });
    await expect(examCard.getByText("Prazo a confirmar", { exact: true })).toBeVisible();
    await page.goto("/recados");
    await expect(page.getByRole("button", { name: /Marcar como feito/ })).toHaveCount(0);
    await page.locator(`a[href="/recados/${photoId}"]`).click();
    await page.waitForURL(`/recados/${photoId}`);
    await expect(
      page.getByRole("heading", { name: "Documento original · Agenda ou caderno" }),
    ).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page
        .getByRole("link", { name: "Baixar anexo original: agenda-sintetica.png", exact: true })
        .click(),
    ]);
    expect(await download.failure()).toBeNull();
    const downloadPath = required((await download.path()) ?? undefined);
    expect((await readFile(downloadPath)).toString("base64")).toBe(photoBase64);
    await page.getByRole("link", { name: "Ver atividades deste original", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`recado=${photoId}`));
    await expect(page.getByRole("article")).toHaveCount(2);
    await page
      .getByRole("button", { name: `Marcar como feito em casa: ${homework.title}`, exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: `Reabrir: ${homework.title}`, exact: true }),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: testInfo.outputPath("notebook-activities.png"),
      fullPage: true,
      caret: "initial",
    });
    await page.goto(`/atividades?perfil=${sibling.id}&tipo=task`);
    await page.getByRole("button", { name: "Nova atividade", exact: true }).click();
    await page.waitForURL(/atividades\/nova/);
    await expect(page).toHaveURL(/atividades\/nova/);
    await expect(page.getByLabel("Criança", { exact: true })).toHaveValue(sibling.id);
    await page.getByLabel("Atividade", { exact: true }).fill("Leitura planejada pela família");
    await page.getByRole("button", { name: "Salvar 1 atividade", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/atividades\\?perfil=${sibling.id}$`));
    await expect(
      page.getByRole("link", { name: "Leitura planejada pela família", exact: true }),
    ).toBeVisible();
    // Representative family dashboard: different types, today, tomorrow and empty sections.
    await db.insert(agendaNoticeActions).values([
      {
        profileId: child.id,
        createdByUserId: id,
        type: "material",
        title: "Separar o material de arte",
        fingerprint: createHash("sha256").update(`${id}:material`).digest("hex"),
        dueAt: date,
        dateOrigin: "family",
      },
      {
        profileId: child.id,
        createdByUserId: id,
        type: "project",
        title: "Preparar a apresentação de ciências",
        fingerprint: createHash("sha256").update(`${id}:project`).digest("hex"),
        dueAt: new Date(new Date(`${date}T12:00:00Z`).valueOf() + 86400000)
          .toISOString()
          .slice(0, 10),
        dateOrigin: "family",
      },
    ]);
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Para cuidar hoje", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Separar o material de arte", exact: true }),
    ).toBeVisible();
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const width of [360, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      for (const dark of [false, true]) {
        await page.evaluate(async (useDark) => {
          document.documentElement.classList.toggle("dark", useDark);
          await document.fonts.ready;
          window.scrollTo(0, 0);
        }, dark);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
        await page.screenshot({
          path: testInfo.outputPath(`family-dashboard-${width}-${dark ? "dark" : "light"}.png`),
          fullPage: true,
          caret: "initial",
          animations: "disabled",
        });
      }
    }
    expect(runtimeErrors).toEqual([]);
  } finally {
    await db.delete(agendaTurmas).where(eq(agendaTurmas.schoolInepCode, school));
    await db.delete(agendaSchools).where(eq(agendaSchools.inepCode, school));
    await db.delete(agendaCities).where(eq(agendaCities.ibgeCode, school));
    await db.delete(agendaStates).where(eq(agendaStates.uf, school));
    await db.delete(agendaProductEvents).where(eq(agendaProductEvents.userId, id));
    await db.delete(emailDeliveries).where(eq(emailDeliveries.userId, id));
    await db.delete(users).where(eq(users.id, id));
    if (customerId) {
      await db.delete(subscriptions).where(eq(subscriptions.customerId, customerId));
      await db.delete(customers).where(eq(customers.id, customerId));
    }
  }
});
