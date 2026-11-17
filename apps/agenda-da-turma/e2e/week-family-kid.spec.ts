import { randomUUID } from "node:crypto";
import { and, db, eq } from "@informach/db";
import { agendaTasks } from "@informach/db/schema";
import { expect, type Page, test } from "@playwright/test";
import {
  browserFamily,
  browserProfile,
  family as centralFamily,
  enterAgenda,
} from "./fixtures/compasso";

/**
 * Semana, Família e a vez da criança (fase 5 da página do dia).
 *
 * As datas saem do dia de hoje em São Paulo, como as do app: a lista da
 * criança vai até o próximo dia de aula, e o que vem depois fica para o
 * "Quer adiantar?". O teste calcula esses dias pela mesma regra, sem depender
 * de que dia da semana ele rode.
 */

function todayIso() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekday(iso: string) {
  return new Date(`${iso}T12:00:00Z`).getUTCDay();
}

function nextSchoolDay(iso: string) {
  let candidate = addDays(iso, 1);
  while ([0, 6].includes(weekday(candidate))) candidate = addDays(candidate, 1);
  return candidate;
}

const WEEKDAY = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function kidLabel(dueAt: string, today: string) {
  if (dueAt <= today) return "É para hoje";
  if (dueAt === addDays(today, 1)) return "É para amanhã";
  return `É para ${WEEKDAY[weekday(dueAt)]}`;
}

async function family(page: Page, id: string) {
  const f = await browserFamily({ id });
  const child = await browserProfile(f, "Clara");
  await enterAgenda(page, f);
  return child.id;
}

async function task(profileId: string, userId: string, title: string, dueAt: string | null) {
  await db.insert(agendaTasks).values({
    profileId,
    createdByUserId: userId,
    type: "task",
    title,
    dueAt,
    dateOrigin: dueAt ? "school" : "unspecified",
    fingerprint: randomUUID(),
  });
}

// Pela criança da execução: sobras de uma rodada interrompida têm o mesmo título.
const statusOf = async (profileId: string, title: string) =>
  (
    await db
      .select()
      .from(agendaTasks)
      .where(and(eq(agendaTasks.profileId, profileId), eq(agendaTasks.title, title)))
  )[0]?.status;

test("a vez da criança vai até a próxima aula, desfaz o toque errado e oferece adiantar", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(120_000);
  if (!baseURL) throw new Error("Local app required");
  const id = `kid-turn-${randomUUID()}`;
  const childId = await family(page, id);
  const today = todayIso();
  const next = nextSchoolDay(today);
  // Um dia da semana depois da próxima aula, ainda dentro dos sete dias.
  const later = addDays(next, 1);
  await task(childId, id, "Passou ontem", addDays(today, -1));
  await task(childId, id, "Para a próxima aula", next);
  await task(childId, id, "Para depois", later);

  await page.goto(`/crianca/${childId}`);
  await expect(page.getByText("Oi, Clara!")).toBeVisible();
  // O que passou do prazo vira "é para hoje", sem vermelho.
  await expect(page.getByRole("heading", { name: "Passou ontem" })).toBeVisible();
  await expect(page.getByText("É para hoje")).toBeVisible();
  await expect(page.getByText("1 de 2")).toBeVisible();

  // Feito fica na tela com "Desfazer"; desfazer volta de verdade no banco.
  await page.getByRole("button", { name: "Feito!" }).click();
  await expect(page.getByText("Feito", { exact: true })).toBeVisible();
  await expect.poll(() => statusOf(childId, "Passou ontem")).toBe("done");
  await page.getByRole("button", { name: "Desfazer" }).click();
  await expect(page.getByRole("button", { name: "Feito!" })).toBeVisible();
  await expect.poll(() => statusOf(childId, "Passou ontem")).toBe("pending");
  await page.getByRole("button", { name: "Feito!" }).click();
  await expect.poll(() => statusOf(childId, "Passou ontem")).toBe("done");
  await page.getByRole("button", { name: "Próxima" }).click();

  await expect(page.getByRole("heading", { name: "Para a próxima aula" })).toBeVisible();
  await expect(page.getByText(kidLabel(next, today))).toBeVisible();
  await page.getByRole("button", { name: "Feito!" }).click();
  await page.getByRole("button", { name: "Terminar" }).click();

  await expect(page.getByRole("heading", { name: "Tudo feito por hoje, Clara!" })).toBeVisible();
  await expect(page.getByText("Você cuidou de 2 coisas.", { exact: false })).toBeVisible();
  await expect(page.getByText("Tem mais uma coisa para os próximos dias.")).toBeVisible();
  await page.getByRole("button", { name: "Adiantar" }).click();
  await expect(page.getByRole("heading", { name: "Para depois" })).toBeVisible();
  await expect(page.getByText(kidLabel(later, today))).toBeVisible();

  // Sair é segurar; o leitor de tela ativa com um clique só.
  const exit = page.getByRole("button", { name: /^Segure para devolver/ });
  await expect(exit).toBeVisible();
  // Um toque de dedo (pointerdown, pointerup e click) não tira a criança da vez.
  await exit.click();
  await page.waitForTimeout(500);
  await expect(exit).toBeVisible();
});

test("a Semana mostra os dias de segunda a domingo, o que está sem data e onde imprimir", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(120_000);
  if (!baseURL) throw new Error("Local app required");
  const id = `week-tab-${randomUUID()}`;
  const childId = await family(page, id);
  const today = todayIso();
  await task(childId, id, "Atividade de hoje", today);
  await task(childId, id, "Sem dia ainda", null);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard");
  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  await nav.getByRole("link", { name: "Semana", exact: true }).click();
  await expect(page).toHaveURL(/\/calendario$/);
  await expect(page.getByRole("heading", { level: 1, name: "Semana" })).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Como ver" }).getByRole("link", { name: "Semana" }),
  ).toHaveAttribute("aria-current", "page");

  const days = page.getByRole("list", { name: "Os dias da semana" });
  await expect(days.getByRole("listitem").filter({ has: page.getByRole("heading") })).toHaveCount(
    7,
  );
  // Segunda primeiro, domingo por último.
  await expect(days.getByRole("heading").first()).toContainText(/^Segunda/);
  await expect(days.getByRole("heading").last()).toContainText(/^Domingo/);
  await expect(days.getByRole("heading", { name: /, hoje/ })).toBeVisible();
  await expect(days.getByRole("link", { name: /Atividade de hoje/ })).toHaveAttribute(
    "href",
    /^\/atividades\/[0-9a-f-]{36}$/,
  );

  await page.getByText("Sem data marcada · 1").click();
  await expect(page.getByRole("link", { name: /Sem dia ainda/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Lista de todas as atividades" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Imprimir a semana/ })).toBeVisible();

  // A semana que vem: um dia vazio leva ao formulário com a data.
  await page.getByRole("link", { name: "Próxima semana" }).click();
  await expect(page.getByRole("link", { name: "Voltar para esta semana" })).toBeVisible();
  await page.getByRole("link", { name: /^Adicionar para segunda/ }).click();
  await expect(page).toHaveURL(/\/atividades\/nova\?data=\d{4}-\d{2}-\d{2}$/);

  // O mês continua a um toque, com a semana começando na segunda.
  await page.goto("/calendario?view=month");
  await expect(
    page.getByRole("navigation", { name: "Como ver" }).getByRole("link", { name: "Mês" }),
  ).toHaveAttribute("aria-current", "page");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("Família mostra a folha da criança, quem cuida junto e o lugar da próxima", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(120_000);
  if (!baseURL) throw new Error("Local app required");
  const id = `family-sheet-${randomUUID()}`;
  const childId = await family(page, id);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/familia");
  const card = page.getByRole("article", { name: "Clara" });
  await expect(card.getByRole("link", { name: "A vez de Clara" })).toHaveAttribute(
    "href",
    `/crianca/${childId}`,
  );
  await expect(card.getByRole("link", { name: "Vincular a turma" })).toHaveAttribute(
    "href",
    `/familia/turmas?perfil=${childId}`,
  );
  await expect(card.getByRole("link", { name: "Atividades extras" })).toHaveAttribute(
    "href",
    `/perfis/${childId}/extras`,
  );
  await expect(page.getByRole("button", { name: /Adicionar criança \(1 de 1\)/ })).toBeVisible();
  const caretakers = page.getByRole("region", { name: "Quem cuida junto" });
  await expect(
    caretakers.getByRole("link", { name: "Pessoas e permissões na Minha conta" }),
  ).toHaveAttribute("href", /localhost:3011\/\?familia=[0-9a-f-]{36}/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
});

test("permissões e família selecionada delimitam a folha da criança", async ({ page }) => {
  const owner = await browserFamily();
  const child = await browserProfile(owner, "Clara");
  const guest = await browserFamily();
  const ownChild = await browserProfile(guest, "Clara da outra família");
  const invite = await centralFamily.createInvitation(owner.id, owner.groupId, guest.email);
  await centralFamily.acceptInvitation(guest.id, invite.token);
  const access = {
    groupId: owner.groupId,
    personId: child.personId,
    app: "agenda-da-turma",
    userId: guest.id,
    action: "read" as const,
  };
  await centralFamily.grantAccess(owner.id, access);
  await enterAgenda(page, guest, "/contexto");
  await page.getByRole("combobox", { name: "Família", exact: true }).selectOption(owner.groupId);
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/familia");
  const card = page.getByRole("article", { name: "Clara", exact: true });
  await expect(card).toBeVisible();
  await expect(page.getByRole("article", { name: "Clara da outra família" })).toHaveCount(0);
  await expect(card.getByRole("link", { name: "A vez de Clara" })).toHaveAttribute(
    "href",
    `/crianca/${child.id}`,
  );
  await expect(card.getByRole("link", { name: "Ver as atividades" })).toHaveAttribute(
    "href",
    `/atividades?perfil=${child.id}`,
  );
  await expect(card.getByRole("link", { name: "Atividades extras" })).toHaveCount(0);
  await expect(card.getByRole("button", { name: /^Ações para/ })).toHaveCount(0);
  await page.goto("/contexto");
  await page.getByRole("combobox", { name: "Família", exact: true }).selectOption(guest.groupId);
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/familia");
  await expect(page.getByRole("article", { name: "Clara", exact: true })).toHaveCount(0);
  await expect(page.getByRole("article", { name: "Clara da outra família" })).toBeVisible();
  await expect(page.getByRole("link", { name: "A vez de Clara" })).toHaveAttribute(
    "href",
    `/crianca/${ownChild.id}`,
  );
});
