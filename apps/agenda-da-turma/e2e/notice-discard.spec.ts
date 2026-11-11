import { createHash, randomUUID } from "node:crypto";
import { db, eq } from "@informach/db";
import { agendaNotices } from "@informach/db/schema";
import { lockFamilyMembership } from "@informach/family/context";
import { expect, test } from "@playwright/test";
import { browserFamily, browserProfile, enterAgenda } from "./fixtures/compasso";

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
async function seedDraft(userId: string, groupId: string, profileId: string, titles: string[]) {
  const text = `Recado fictício ${randomUUID()}`;
  // A page can still be reading/updating the preceding draft. Take the family
  // lock before INSERT acquires FK locks, matching the production write order.
  const [notice] = await db.transaction(async (tx) => {
    await lockFamilyMembership(tx, userId, groupId);
    return tx
      .insert(agendaNotices)
      .values({
        familyGroupId: groupId,
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
  });
  return required(notice);
}

async function statusOf(id: string) {
  return (await db.select().from(agendaNotices).where(eq(agendaNotices.id, id)))[0]?.status;
}

test("discarding a draft persists: trash in the review, and discard from the dashboard", async ({
  page,
  baseURL,
}) => {
  // Três páginas autenticadas compiladas a frio pelo `next dev` do e2e.
  test.setTimeout(180_000);
  if (!baseURL) throw new Error("Local app required");
  const id = `notice-discard-browser-${randomUUID()}`;
  const email = `${id}@e2e.local`;
  const f = await browserFamily({ id, email, password: "NoticeDiscard!Synthetic2026" });
  const child = await browserProfile(f, "Criança navegador");
  await enterAgenda(page, f);
  const profileId = child.id;
  // A lixeira da revisão chega ao servidor: recarregar não traz a ação de volta.
  const draft = await seedDraft(id, f.groupId, profileId, [
    "Fazer páginas 20 e 21",
    "Levar tesoura",
  ]);
  await page.goto(`/recados/novo?retomar=${draft.id}`);
  const tirar = (n: number) =>
    page.getByRole("button", { name: `Tirar a atividade ${n}`, exact: true });
  await expect(tirar(2)).toBeVisible();
  await tirar(1).click();
  await expect(tirar(2)).toHaveCount(0);
  // A atividade lida aparece numa linha curta: o título, sem o formulário aberto.
  await expect(page.getByText("Levar tesoura", { exact: true })).toBeVisible();
  await page.reload();
  await expect(tirar(1)).toBeVisible();
  await expect(tirar(2)).toHaveCount(0);
  await expect(page.getByText("Levar tesoura", { exact: true })).toBeVisible();
  expect(await statusOf(draft.id)).toBe("ready");

  // Remover a última descarta o recado e devolve o formulário de importação.
  await page.getByRole("button", { name: "Tirar a atividade 1", exact: true }).click();
  await expect(page.getByText("Recado descartado.")).toBeVisible();
  await expect(page).toHaveURL(/\/recados\/novo$/);
  await expect(
    page.getByRole("heading", { name: "Recado para Criança", exact: true }),
  ).toBeVisible();
  expect(await statusOf(draft.id)).toBe("discarded");
  await page.goto("/dashboard");
  await expect(page.getByText(/ficou sem conferir|ficaram sem conferir/)).toHaveCount(0);

  // Descartar a última atividade lida não pode levar junto o que a pessoa
  // escreveu à mão nesta tela.
  const withManual = await seedDraft(id, f.groupId, profileId, ["Estudar para a prova"]);
  await page.goto(`/recados/novo?retomar=${withManual.id}`);
  await page.getByRole("button", { name: "Escrever mais uma", exact: true }).click();
  await expect(tirar(2)).toBeVisible();
  // A atividade lida fica fechada; a nova, escrita aqui, abre o formulário.
  await page.getByRole("textbox", { name: "Atividade", exact: true }).fill("Comprar cartolina");
  await page.getByRole("button", { name: "Tirar a atividade 1", exact: true }).click();
  await expect(page.getByText("Recado descartado.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Atividade", exact: true })).toHaveValue(
    "Comprar cartolina",
  );
  expect(await statusOf(withManual.id)).toBe("discarded");
  // E um `?retomar=` vencido abre a importação com um aviso, nunca um erro.
  await page.reload();
  await expect(
    page.getByText("Aquele recado não está mais esperando conferência", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Recado para Criança", exact: true }),
  ).toBeVisible();

  // O card do dashboard tem saída própria.
  const second = await seedDraft(id, f.groupId, profileId, ["Trazer autorização"]);
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: /ficou sem conferir|ficaram sem conferir/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Descartar o recado de Microsoft Teams", exact: true })
    .click();
  await page.getByRole("button", { name: "Descartar", exact: true }).click();
  await expect(page.getByText("Recado descartado.")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /ficou sem conferir|ficaram sem conferir/ }),
  ).toHaveCount(0);
  expect(await statusOf(second.id)).toBe("discarded");
});
