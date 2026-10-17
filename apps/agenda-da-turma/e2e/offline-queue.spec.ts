import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { db, eq } from "@informach/db";
import {
  accounts,
  agendaIdempotentWrites,
  agendaProductEvents,
  agendaStudentProfiles,
  agendaTasks,
  emailDeliveries,
  users,
} from "@informach/db/schema";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Missing browser fixture");
  return value;
}

function todayIso() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

/** Uma família Free, já no dashboard, com uma atividade de hoje para concluir. */
async function familyWithTask(page: Page, context: BrowserContext, baseURL: string, id: string) {
  const email = `${id}@e2e.local`;
  const title = `Lição de casa ${randomUUID().slice(0, 8)}`;
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
    password: await hashPassword("OfflineQueue!Synthetic2026"),
  });
  const login = await context.request.post(`${baseURL}/api/auth/sign-in/email`, {
    headers: { Origin: baseURL },
    data: { email, password: "OfflineQueue!Synthetic2026" },
  });
  expect(login.ok()).toBe(true);
  await page.goto("/choose-plan");
  await page.getByRole("button", { name: "Começar grátis", exact: true }).click();
  await expect(page).toHaveURL(/dashboard/);

  const [child] = await db
    .insert(agendaStudentProfiles)
    .values({ userId: id, name: "Criança navegador" })
    .returning();
  await db.insert(agendaTasks).values({
    profileId: required(child).id,
    createdByUserId: id,
    type: "task",
    title,
    dueAt: todayIso(),
    dateOrigin: "school",
    fingerprint: randomUUID(),
  });
  return title;
}

async function removeFamily(id: string) {
  await db.delete(agendaProductEvents).where(eq(agendaProductEvents.userId, id));
  await db.delete(agendaIdempotentWrites).where(eq(agendaIdempotentWrites.userId, id));
  await db.delete(emailDeliveries).where(eq(emailDeliveries.userId, id));
  await db.delete(users).where(eq(users.id, id));
}

const taskStatus = async (title: string) =>
  (await db.select().from(agendaTasks).where(eq(agendaTasks.title, title)))[0]?.status;

/**
 * Marcar como feito sem rede, e a gravação chegar sozinha depois.
 *
 * É o teste que prova as duas metades da fila: a intenção não se perde quando o
 * sinal some, e ela não é confundida com uma gravação que aconteceu — enquanto
 * está na fila, a tela diz isso.
 */
test("offline queue: completing without network reaches the server when it returns", async ({
  page,
  context,
  baseURL,
}) => {
  // Dashboard e atividades compilados a frio pelo `next dev` do e2e.
  test.setTimeout(180_000);
  if (!baseURL) throw new Error("Local app required");
  const id = `offline-queue-browser-${randomUUID()}`;
  try {
    const title = await familyWithTask(page, context, baseURL, id);

    await page.goto("/atividades");
    const toggle = page.getByRole("button", { name: `Marcar como feito: ${title}` });
    await expect(toggle).toBeVisible();
    // "Já carregada" é o botão pronto para o toque, e não só desenhado. A lista
    // fica num Suspense (`loading.tsx`) que hidrata depois do resto; num runner
    // lento, cortar a rede antes disso fazia o clique sumir e o selo nunca
    // aparecer. Antes de hidratar o botão vem desabilitado (`ready`).
    await expect(toggle).toBeEnabled();

    // A rede some com a tela já carregada — o portão da escola.
    await context.setOffline(true);
    await toggle.click();

    // A decisão fica aplicada E anunciada como não enviada. As duas coisas
    // juntas: só a primeira seria uma promessa falsa.
    await expect(page.getByText("Sobe quando a rede voltar")).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("1 mudança esperando a rede.")).toBeVisible();
    expect(await taskStatus(title)).toBe("pending");

    // A rede volta: o `online` da janela acorda o esvaziamento.
    await context.setOffline(false);
    await expect(page.getByText("1 mudança esperando a rede.")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByText("Sobe quando a rede voltar")).toHaveCount(0);

    await expect.poll(() => taskStatus(title), { timeout: 20_000 }).toBe("done");

    // Uma gravação, um recibo: a fila repetiu a chave e o servidor não gravou
    // duas vezes.
    const receipts = await db
      .select()
      .from(agendaIdempotentWrites)
      .where(eq(agendaIdempotentWrites.userId, id));
    expect(receipts).toHaveLength(1);
    const [task] = await db.select().from(agendaTasks).where(eq(agendaTasks.title, title));
    expect(task?.version).toBe(2);
  } finally {
    await context.setOffline(false);
    await removeFamily(id);
  }
});

/**
 * O botão de concluir não finge estar pronto.
 *
 * Com o HTML na tela e os scripts ainda a caminho, o card aparece inteiro e o
 * `onClick` não existe. Um toque ali sumia sem aviso. Aqui os scripts são
 * segurados de verdade, como numa rede móvel lenta.
 */
test("completion button stays disabled until the list hydrates", async ({
  page,
  context,
  baseURL,
}) => {
  test.setTimeout(180_000);
  if (!baseURL) throw new Error("Local app required");
  const id = `offline-queue-hydration-${randomUUID()}`;
  try {
    const title = await familyWithTask(page, context, baseURL, id);

    let release = () => {};
    const scripts = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/_next/static/**/*.js", async (route) => {
      await scripts;
      await route.continue();
    });
    const toggle = page.getByRole("button", { name: `Marcar como feito: ${title}` });
    try {
      await page.goto("/atividades", { waitUntil: "commit" });
      await expect(toggle).toBeVisible();
      await expect(toggle).toBeDisabled();
    } finally {
      release();
    }
    await expect(toggle).toBeEnabled();
    await toggle.click();
    // O toque chegou ao servidor: é a prova que importa, e não depende de o
    // card continuar na lista depois do `router.refresh()`.
    await expect.poll(() => taskStatus(title), { timeout: 20_000 }).toBe("done");
  } finally {
    await removeFamily(id);
  }
});

/**
 * "Desfazer" logo depois de "Feito", em Hoje.
 *
 * Concluir sobe a versão da atividade. O aviso de "Desfazer" é do card que
 * acabou de sair da lista, e mandava a versão de antes: o servidor respondia
 * conflito e o toque não fazia nada. A versão nova agora volta na resposta e o
 * card a guarda.
 */
test("undo right after done reopens the activity on Hoje", async ({ page, context, baseURL }) => {
  test.setTimeout(180_000);
  if (!baseURL) throw new Error("Local app required");
  const id = `offline-queue-undo-${randomUUID()}`;
  try {
    const title = await familyWithTask(page, context, baseURL, id);
    await page.goto("/dashboard");
    const toggle = page.getByRole("button", { name: `Marcar como feito: ${title}` });
    await expect(toggle).toBeEnabled();
    await toggle.click();
    await expect.poll(() => taskStatus(title), { timeout: 20_000 }).toBe("done");
    await page.getByRole("button", { name: "Desfazer", exact: true }).click();
    await expect.poll(() => taskStatus(title), { timeout: 20_000 }).toBe("pending");
    // A linha volta para "Para hoje", pronta para ser concluída de novo.
    await expect(toggle).toBeVisible();
  } finally {
    await removeFamily(id);
  }
});
