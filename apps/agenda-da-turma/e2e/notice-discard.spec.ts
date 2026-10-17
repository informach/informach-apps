import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { db, eq } from "@informach/db";
import {
  accounts,
  agendaNotices,
  agendaProductEvents,
  agendaStudentProfiles,
  emailDeliveries,
  users,
} from "@informach/db/schema";
import { expect, test } from "@playwright/test";

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing browser fixture");
  return value;
}

const extracted = (title: string) => ({
  type: "task" as const,
  title,
  description: null,
  dueAt: null,
  dateOrigin: "unspecified" as const,
  time: null,
  location: null,
  sourceExcerpt: title,
});

/**
 * Semeia um rascunho `ready` como as linhas anteriores aos ids por ação — o
 * caminho de retomada precisa atribuí-los na primeira leitura.
 */
async function seedDraft(userId: string, profileId: string, titles: string[]) {
  const text = `Recado fictício ${randomUUID()}`;
  const [notice] = await db
    .insert(agendaNotices)
    .values({
      ownerUserId: userId,
      createdByUserId: userId,
      captureProfileId: profileId,
      source: "teams",
      text,
      contentHash: createHash("sha256")
        .update(JSON.stringify([text, null, [], null]))
        .digest("hex"),
      status: "ready",
      parsedResult: { actions: titles.map(extracted), warnings: [] },
    })
    .returning();
  return required(notice);
}

async function statusOf(id: string) {
  return (await db.select().from(agendaNotices).where(eq(agendaNotices.id, id)))[0]?.status;
}

test("discarding a draft persists: trash in the review, and discard from the dashboard", async ({
  page,
  context,
  baseURL,
}) => {
  // Três páginas autenticadas compiladas a frio pelo `next dev` do e2e.
  test.setTimeout(180_000);
  if (!baseURL) throw new Error("Local app required");
  const id = `notice-discard-browser-${randomUUID()}`;
  const email = `${id}@e2e.local`;
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
      password: await hashPassword("NoticeDiscard!Synthetic2026"),
    });
    const login = await context.request.post(`${baseURL}/api/auth/sign-in/email`, {
      headers: { Origin: baseURL },
      data: { email, password: "NoticeDiscard!Synthetic2026" },
    });
    expect(login.ok()).toBe(true);
    await page.goto("/choose-plan");
    await page.getByRole("button", { name: "Começar grátis", exact: true }).click();
    await expect(page).toHaveURL(/dashboard/);
    const [child] = await db
      .insert(agendaStudentProfiles)
      .values({ userId: id, name: "Criança navegador" })
      .returning();
    const profileId = required(child).id;

    // A lixeira da revisão chega ao servidor: recarregar não traz a ação de volta.
    const draft = await seedDraft(id, profileId, ["Fazer páginas 20 e 21", "Levar tesoura"]);
    await page.goto(`/recados/novo?retomar=${draft.id}`);
    await expect(page.getByRole("heading", { name: "Atividade 2", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Remover atividade 1", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Atividade 2", exact: true })).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Atividade", exact: true })).toHaveValue(
      "Levar tesoura",
    );
    await page.reload();
    await expect(page.getByRole("heading", { name: "Atividade 1", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Atividade 2", exact: true })).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Atividade", exact: true })).toHaveValue(
      "Levar tesoura",
    );
    expect(await statusOf(draft.id)).toBe("ready");

    // Remover a última descarta o recado e devolve o formulário de importação.
    await page.getByRole("button", { name: "Remover atividade 1", exact: true }).click();
    await expect(page.getByText("Recado descartado.")).toBeVisible();
    await expect(page).toHaveURL(/\/recados\/novo$/);
    await expect(
      page.getByRole("combobox", { name: "Para qual criança?", exact: true }),
    ).toBeVisible();
    expect(await statusOf(draft.id)).toBe("discarded");
    await page.goto("/dashboard");
    await expect(page.getByText(/ficou sem conferir|ficaram sem conferir/)).toHaveCount(0);

    // Descartar a última atividade lida não pode levar junto o que a pessoa
    // escreveu à mão nesta tela.
    const withManual = await seedDraft(id, profileId, ["Estudar para a prova"]);
    await page.goto(`/recados/novo?retomar=${withManual.id}`);
    await page.getByRole("button", { name: "Adicionar atividade", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Atividade 2", exact: true })).toBeVisible();
    await page
      .getByRole("textbox", { name: "Atividade", exact: true })
      .nth(1)
      .fill("Comprar cartolina");
    await page.getByRole("button", { name: "Remover atividade 1", exact: true }).click();
    await expect(page.getByText("Recado descartado.")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Atividade", exact: true })).toHaveValue(
      "Comprar cartolina",
    );
    expect(await statusOf(withManual.id)).toBe("discarded");
    // E um `?retomar=` vencido abre a importação com um aviso, nunca um erro.
    await page.reload();
    await expect(
      page.getByText("Aquele rascunho não está mais aguardando revisão", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "Para qual criança?", exact: true }),
    ).toBeVisible();

    // O card do dashboard tem saída própria.
    const second = await seedDraft(id, profileId, ["Trazer autorização"]);
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: /ficou sem conferir|ficaram sem conferir/ }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Descartar importação de Microsoft Teams", exact: true })
      .click();
    await page.getByRole("button", { name: "Descartar", exact: true }).click();
    await expect(page.getByText("Recado descartado.")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /ficou sem conferir|ficaram sem conferir/ }),
    ).toHaveCount(0);
    expect(await statusOf(second.id)).toBe("discarded");
  } finally {
    await db.delete(agendaProductEvents).where(eq(agendaProductEvents.userId, id));
    await db.delete(emailDeliveries).where(eq(emailDeliveries.userId, id));
    await db.delete(users).where(eq(users.id, id));
  }
});
