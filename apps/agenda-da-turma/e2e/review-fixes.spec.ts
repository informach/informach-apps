import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { and, db, eq, isNotNull } from "@informach/db";
import {
  accounts,
  agendaActivities,
  agendaCities,
  agendaNotices,
  agendaProductEvents,
  agendaSchools,
  agendaStates,
  agendaStudentProfiles,
  agendaSubjects,
  agendaTasks,
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
  // Jornada longa: visita a maior parte das rotas do app, incluindo as quatro
  // seções de Família, e o `next dev` do e2e compila cada uma na primeira
  // visita autenticada — o aquecimento por HTTP não alcança páginas (ver
  // warmup.setup.ts). Mede ~50 s com compilação fria; a folga é para o runner
  // do CI. Se crescer mais, quebrar em testes com orçamento próprio em vez de
  // subir este número.
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
    // O grátis vale por padrão: depois do login, a conta vai direto para Hoje.
    await page.goto("/dashboard");

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
    await db.insert(agendaTasks).values({
      sharedActivityId: activityId,
      profileId: child.id,
      createdByUserId: id,
      type: "task",
      subjectId: required(subject).id,
      title: "Atividade versão 1",
      dueAt: date,
      dateOrigin: "school",
      fingerprint: `e2e-${activityId}`,
    });

    await test.step("activities use one creation flow and filters preserve the selected child", async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/dashboard?perfil=${child.id}`);
      // O rodapé é a navegação: quatro destinos e o botão Adicionar no centro.
      // O card de atalhos do dashboard repetia três deles e foi removido.
      const mainNav = page.getByRole("navigation", { name: "Navegação principal" });
      await expect(mainNav).toBeInViewport();
      await expect(mainNav.getByRole("link")).toHaveCount(4);
      await expect(mainNav.getByRole("link", { name: "Recados", exact: true })).toHaveCount(0);
      // A criança escolhida viaja com a navegação.
      for (const [label, route] of [
        ["Hoje", "/dashboard"],
        ["Atividades", "/atividades"],
        ["Semana", "/calendario"],
      ] as const) {
        await expect(mainNav.getByRole("link", { name: label, exact: true })).toHaveAttribute(
          "href",
          `${route}?perfil=${child.id}`,
        );
      }
      await expect(mainNav.getByRole("link", { name: "Família", exact: true })).toHaveAttribute(
        "href",
        "/familia",
      );
      // Entrada única: os quatro caminhos vivem na folha Adicionar e todos
      // preservam a criança filtrada. Antes cada um tinha rótulo próprio,
      // espalhado por três telas.
      await expect(page.getByRole("button", { name: "Adicionar", exact: true })).toHaveCount(1);
      await page.getByRole("button", { name: "Adicionar", exact: true }).click();
      const addSheet = page.getByRole("dialog", { name: "O que chegou?" });
      // A criança filtrada já vem escolhida no topo da folha.
      await expect(
        addSheet.getByRole("button", { name: "Criança A navegador", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      // "Foto" abre a câmera da própria folha, como no canvas; os outros três
      // caminhos são links para a tela do recado ou para o formulário.
      await expect(addSheet.getByLabel(/^Foto/)).toHaveAttribute("type", "file");
      for (const [label, route] of [
        [/^Mensagem/, "/recados/novo?modo=colar"],
        [/^Falar/, "/recados/novo?modo=falar"],
        [/^Escrever/, "/atividades/nova"],
      ] as const) {
        await expect(addSheet.getByRole("link", { name: label })).toHaveAttribute(
          "href",
          `${route}${route.includes("?") ? "&" : "?"}perfil=${child.id}`,
        );
      }
      // A folha sobe com animação: a foto espera ela parar.
      await page.evaluate(() =>
        Promise.all(document.getAnimations().map((animation) => animation.finished)),
      );
      await page.screenshot({
        path: testInfo.outputPath("add-sheet-mobile.png"),
        caret: "initial",
      });
      await page.keyboard.press("Escape");
      await expect(addSheet).toBeHidden();
      // A folha some antes de o Radix devolver os eventos de ponteiro ao body.
      // Sem esperar por isso, o primeiro toque seguinte cai no vazio — e a
      // janela é curta o bastante para só aparecer com a máquina carregada.
      await expect
        .poll(() => page.evaluate(() => getComputedStyle(document.body).pointerEvents))
        .not.toBe("none");
      await page.screenshot({
        path: testInfo.outputPath("school-access-mobile.png"),
        caret: "initial",
      });
      await mainNav.getByRole("link", { name: "Atividades", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/atividades\\?perfil=${child.id}$`));
      for (const width of [360, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        // Um botão só, e um destino só: o segundo formulário com este mesmo
        // nome saiu.
        await expect(page.getByRole("link", { name: "Nova atividade", exact: true })).toHaveCount(
          1,
        );
        await expect(
          page.getByRole("link", { name: "Nova atividade", exact: true }),
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
      // Escola, extra e recado passam pelo mesmo formulário. Compartilhar com a
      // turma deixou de ser um segundo cadastro e virou uma caixa dele.
      for (const [label, type, share] of [
        ["Para casa", "task", false],
        ["Trabalho", "project", false],
        ["Prova", "exam", true],
      ] as const) {
        await page.getByRole("link", { name: "Nova atividade", exact: true }).click();
        await expect(page).toHaveURL(/\/atividades\/nova/);
        const form = page.getByRole("main");
        await form.getByLabel("Tipo", { exact: true }).selectOption(type);
        await form.getByLabel("Matéria", { exact: true }).selectOption({
          label: "Matéria de revisão",
        });
        await form.getByLabel("Atividade", { exact: true }).fill(`Cadastro direto: ${label}`);
        await form.getByLabel("Data (opcional)", { exact: true }).fill(date);
        const share_ = form.getByLabel("Mandar para a turma");
        await expect(share_).toBeVisible();
        if (share) await share_.check();
        // O botão diz o tipo: "Salvar 1 tarefa", "Salvar 1 prova".
        await form.getByRole("button", { name: /^Salvar 1 / }).click();
        // A lista, não o formulário: `/atividades/nova` também casa com
        // `/atividades`, e a asserção passaria antes de a gravação terminar.
        await expect(page).toHaveURL(new RegExp(`/atividades\\?perfil=${child.id}$`));
        const [saved] = await db
          .select()
          .from(agendaTasks)
          .where(
            and(
              eq(agendaTasks.createdByUserId, id),
              eq(agendaTasks.title, `Cadastro direto: ${label}`),
            ),
          );
        expect(saved).toMatchObject({ type, dueAt: date, profileId: child.id });
        // Só a prova foi publicada, e é ela que a turma passa a ver.
        expect(Boolean(saved?.sharedActivityId)).toBe(share);
        if (share && saved?.sharedActivityId) {
          const [published] = await db
            .select()
            .from(agendaActivities)
            .where(eq(agendaActivities.id, saved.sharedActivityId));
          expect(published).toMatchObject({
            turmaId,
            type,
            dueAt: date,
            visibility: "shared_with_turma",
          });
        }
        await page.goto(`/atividades?perfil=${child.id}`);
      }
      const typeFilter = page.getByRole("combobox", { name: "Tipo de atividade", exact: true });
      await typeFilter.click();
      await page.getByRole("option", { name: "Prova", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/atividades\\?perfil=${child.id}&tipo=exam$`));
      await expect(
        page.getByRole("link", { name: "Cadastro direto: Prova", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Cadastro direto: Trabalho", exact: true }),
      ).toHaveCount(0);
      await page.getByRole("combobox", { name: "Estudante", exact: true }).click();
      await page.getByRole("option", { name: "Criança B navegador", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/atividades\\?perfil=${sibling.id}&tipo=exam$`));
      await expect(
        page.getByText("Nenhuma atividade com esses filtros", { exact: true }),
      ).toBeVisible();
      // O botão de escape do vazio deixou de ser só sobre o tipo: com a janela
      // de prazo vinda dos contadores da rotina, ele limpa qualquer recorte —
      // e o nome passou a dizer isso. O destino continua o mesmo.
      await page.getByRole("link", { name: "Limpar filtros", exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`/atividades\\?perfil=${sibling.id}$`));
      await page.goto(`/atividades?perfil=${child.id}&tipo=invalid`);
      await expect(typeFilter).toContainText("Todos os tipos");
      await expect(
        page.getByRole("link", { name: "Cadastro direto: Trabalho", exact: true }),
      ).toBeVisible();
      // A Semana leva ao mesmo formulário, já com o dia tocado e a criança:
      // o "+" de um dia vazio da semana que vem.
      await page.goto(`/calendario?date=${date}&perfil=${child.id}`);
      await page.getByRole("link", { name: "Próxima semana", exact: true }).click();
      await expect(page).toHaveURL(/[?&]date=\d{4}-\d{2}-\d{2}/);
      await page
        .getByRole("link", { name: /^Adicionar para / })
        .first()
        .click();
      await expect(page).toHaveURL(
        new RegExp(`/atividades/nova\\?data=\\d{4}-\\d{2}-\\d{2}&perfil=${child.id}$`),
      );
      // Tocar num dia leva ao mesmo formulário com a data já preenchida.
      // No celular a vista do mês é agenda vertical — a grade 7×6 fica para
      // `md` — então o alvo é o "+" do cartão de hoje, e não a célula. O nome
      // acessível traz a data por extenso, não o ISO, então a busca é pelo
      // prefixo dentro do cartão marcado como "Hoje".
      await page.goto(`/calendario?view=month&date=${date}&perfil=${child.id}`);
      const todayCard = page
        .getByRole("article")
        .filter({ has: page.getByText("Hoje", { exact: true }) })
        .first();
      await expect(todayCard).toBeVisible();
      await todayCard.getByRole("button", { name: /^Criar atividade em / }).click();
      await expect(page).toHaveURL(`/atividades/nova?data=${date}&perfil=${child.id}`);
      await expect(page.getByLabel("Data (opcional)", { exact: true })).toHaveValue(date);
    });

    await test.step("família reúne crianças, turmas, adultos e ajustes", async () => {
      // As rotas antigas continuam respondendo: há links salvos e as telas
      // profundas de extracurriculares e matérias seguem sob elas.
      await page.goto("/perfis");
      await expect(page).toHaveURL(/\/familia$/);
      await page.goto(`/turmas?perfil=${child.id}`);
      await expect(page).toHaveURL(new RegExp(`/familia/turmas\\?perfil=${child.id}$`));

      await page.goto("/familia");
      const sections = page.getByRole("navigation", { name: "Seções da família" });
      await expect(sections.getByRole("link")).toHaveCount(4);
      // Quem procura "meus filhos" toca em Família e acha, em vez de precisar
      // do menu do avatar.
      for (const name of ["Criança A navegador", "Criança B navegador"]) {
        await expect(
          page.getByRole("button", { name: `Ações para ${name}`, exact: true }),
        ).toBeVisible();
      }

      for (const [label, route, heading] of [
        ["Turmas", "/familia/turmas", "Escola fictícia revisão"],
        ["Adultos", "/familia/adultos", "Quem cuida junto"],
        ["Ajustes", "/familia/ajustes", "Sua agenda no calendário pessoal"],
      ] as const) {
        await sections.getByRole("link", { name: label, exact: true }).click();
        await expect(page).toHaveURL(new RegExp(`${route}$`));
        await expect(page.getByText(heading).first()).toBeVisible();
      }

      // O rodapé acende Família em todas as sub-rotas.
      await expect(
        page
          .getByRole("navigation", { name: "Navegação principal" })
          .getByRole("link", { name: "Família", exact: true }),
      ).toHaveAttribute("aria-current", "page");
    });

    // Editar é sempre o mesmo formulário, na mesma tela, seja qual for o
    // caminho até ela, e a correção de quem publicou alcança a turma: a versão
    // que sobe é a de `agenda.activities`, não só a da cópia de quem editou.
    // O card não tem mais menu de três pontos: o título abre a leitura, e o
    // formulário fica a um toque, em Editar.
    for (const version of [2, 3]) {
      await page.goto("/atividades");
      await page
        .getByRole("link", { name: `Atividade versão ${version - 1}`, exact: true })
        .click();
      await page.getByRole("link", { name: "Editar", exact: true }).click();
      // A primeira visita ao detalhe compila a página no `next dev`, e isso não
      // cabe nos 5 s de um `expect` local. O orçamento é desta espera, não do teste.
      await expect(page).toHaveURL(/\/atividades\/[0-9a-f-]{36}\?editar=1$/, { timeout: 30_000 });
      await page.getByLabel("Atividade", { exact: true }).fill(`Atividade versão ${version}`);
      await page.getByRole("button", { name: "Salvar alteração", exact: true }).click();
      // A gravação recarrega o formulário na versão nova, então a confirmação
      // que permanece na tela é o histórico — que é o que a família consulta.
      await expect(
        page.getByText(`Título: Atividade versão ${version - 1} → Atividade versão ${version}`),
      ).toBeVisible();
      await expect
        .poll(
          async () =>
            (await db.select().from(agendaActivities).where(eq(agendaActivities.id, activityId)))[0]
              ?.version,
        )
        .toBe(version);
    }
    for (const version of [4, 5]) {
      // Na Semana, a atividade é uma linha que abre a leitura.
      await page.goto(`/calendario?date=${date}`);
      await page
        .getByRole("list", { name: "Os dias da semana" })
        .getByRole("link", { name: new RegExp(`^Atividade versão ${version - 1}`) })
        .click();
      await expect(page).toHaveURL(/\/atividades\/[0-9a-f-]{36}$/);
      await expect(
        page.getByRole("heading", { name: `Atividade versão ${version - 1}`, level: 1 }),
      ).toBeVisible();
      await page.getByRole("link", { name: "Editar", exact: true }).click();
      await expect(page).toHaveURL(/\/atividades\/[0-9a-f-]{36}\?editar=1$/);
      await page.getByLabel("Atividade", { exact: true }).fill(`Atividade versão ${version}`);
      await page.getByRole("button", { name: "Salvar alteração", exact: true }).click();
      // A gravação recarrega o formulário na versão nova, então a confirmação
      // que permanece na tela é o histórico — que é o que a família consulta.
      await expect(
        page.getByText(`Título: Atividade versão ${version - 1} → Atividade versão ${version}`),
      ).toBeVisible();
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
    // A data do recado em dia da semana, e não "13/09/2030".
    await expect(
      page.getByText("O recado é de sexta, 13 de setembro de 2030.", { exact: true }),
    ).toBeVisible();
    await page.getByRole("checkbox", { name: /^O recado fala só de Criança A navegador/ }).check();
    await page.getByRole("button", { name: "Salvar 1 autorização", exact: true }).click();
    // Salvar termina num "Pronto", com o que entrou na semana, e não numa lista.
    await expect(page.getByRole("heading", { name: /^Pronto\./ })).toBeVisible();
    expect(
      (await db.select().from(agendaNotices).where(eq(agendaNotices.id, noticeId)))[0]
        ?.sourceProfileIds,
    ).toEqual([child.id]);

    // The actual parse endpoint replays this extraction; no AI provider call.
    await page.goto("/recados/novo");
    await page.getByRole("button", { name: "Criança B navegador", exact: true }).click();
    await page.getByLabel("Cole a mensagem ou publicação").fill(text);
    const [replayedExtraction] = await Promise.all([
      page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/recados/parse" &&
          response.request().method() === "POST",
      ),
      page.getByRole("button", { name: "Ler o recado", exact: true }).click(),
    ]);
    expect(replayedExtraction.status()).toBe(200);
    await expect(page.getByText(/Este recado já foi lido para/)).toBeVisible();
    await page.getByRole("button", { name: "Salvar 1 autorização", exact: true }).click();
    await expect(page.getByRole("heading", { name: /^Pronto\./ })).toBeVisible();
    expect(
      await db.select().from(agendaTasks).where(eq(agendaTasks.noticeId, noticeId)),
    ).toHaveLength(2);

    const [before] = await db
      .select()
      .from(agendaTasks)
      .where(and(eq(agendaTasks.noticeId, noticeId), eq(agendaTasks.profileId, child.id)));
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
    await page.getByRole("button", { name: "Salvar 1 autorização", exact: true }).click();
    await expect(page.getByLabel("Correção da atividade 1")).toBeVisible();
    await page.getByLabel("Correção da atividade 1").selectOption(previous.id);
    await page.screenshot({ path: testInfo.outputPath("deadline-correction.png"), fullPage: true });
    await page.getByRole("button", { name: "Salvar 1 autorização", exact: true }).click();
    await expect(page.getByRole("heading", { name: /^Pronto\./ })).toBeVisible();
    // A retificação versiona a atividade que já existia em vez de criar outra:
    // a criança continua com UMA tarefa vinda deste recado. As atividades da
    // escola vivem na mesma tabela desde a convergência, por isso a contagem
    // filtra pelo recado de origem.
    const after = await db
      .select()
      .from(agendaTasks)
      .where(and(eq(agendaTasks.profileId, child.id), isNotNull(agendaTasks.noticeId)));
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ id: previous.id, version: 2, dueAt: "2030-09-16" });
    expect(
      (
        await db
          .select()
          .from(agendaTasks)
          .where(and(eq(agendaTasks.profileId, sibling.id), isNotNull(agendaTasks.noticeId)))
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
    await page.getByRole("button", { name: "Adicionar de um recado", exact: true }).click();
    // "Foto" abre a câmera na própria folha, e a tela do recado já chega com a
    // foto e a criança escolhida, como no canvas.
    await page
      .getByRole("dialog", { name: "O que chegou?" })
      .getByLabel(/^Foto/)
      .setInputFiles({
        name: "agenda-sintetica.png",
        mimeType: "image/png",
        buffer: Buffer.from(photoBase64, "base64"),
      });
    await expect(
      page.getByRole("heading", { name: "Foto para Criança A navegador", level: 1 }),
    ).toBeVisible();
    await expect(page.locator("#notice-source")).toHaveValue("notebook");
    await expect(page.getByRole("img", { name: "Foto selecionada para leitura" })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath("capture-photo.png"),
      fullPage: true,
      caret: "initial",
    });
    await expect(
      page.getByLabel("Observação para acompanhar a foto (opcional)", { exact: true }),
    ).toHaveValue("");
    // Observação, origem, data e link moram em "Mais opções".
    await page.locator("summary", { hasText: "Mais opções" }).click();
    await page.getByLabel("Data da anotação (se conhecida)").fill("2030-09-14");
    await page.getByRole("button", { name: "Ler o recado", exact: true }).click();
    await expect(
      page.getByText("Confira a data da prova; a anotação está ilegível.", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Salvar 2 atividades", exact: true }).click();
    await expect(page.getByRole("heading", { name: /^Pronto\./ })).toBeVisible();
    await page.goto(`/atividades?perfil=${child.id}`);
    await expect(page.getByRole("link", { name: homework.title, exact: true })).toBeVisible();
    const examCard = page
      .getByRole("article")
      .filter({ has: page.getByRole("link", { name: exam.title, exact: true }) });
    await expect(examCard.getByText("Sem data", { exact: true })).toBeVisible();
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
      .getByRole("button", { name: `Marcar como feito: ${homework.title}`, exact: true })
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
    await page.getByRole("link", { name: "Nova atividade", exact: true }).click();
    await page.waitForURL(/atividades\/nova/);
    await expect(page).toHaveURL(/atividades\/nova/);
    await expect(page.getByLabel("Criança", { exact: true })).toHaveValue(sibling.id);
    await page.getByLabel("Atividade", { exact: true }).fill("Leitura planejada pela família");
    await page.getByRole("button", { name: "Salvar 1 tarefa", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/atividades\\?perfil=${sibling.id}$`));
    await expect(
      page.getByRole("link", { name: "Leitura planejada pela família", exact: true }),
    ).toBeVisible();
    // Representative family dashboard: different types, today, tomorrow and empty sections.
    await db.insert(agendaTasks).values([
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
    // Das 18h à meia-noite o título vira "Ainda de hoje"; a atividade é o que importa.
    await expect(page.getByRole("heading", { name: /^(Para hoje|Ainda de hoje)$/ })).toBeVisible();
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
