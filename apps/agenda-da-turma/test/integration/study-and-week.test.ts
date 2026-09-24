import { randomUUID } from "node:crypto";
import { db, eq } from "@informach/db";
import {
  agendaNotificationDeliveries,
  agendaProductEvents,
  agendaTasks,
  customers,
  emailDeliveries,
  subscriptions,
  users,
} from "@informach/db/schema";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addDaysIso, todayLocalIso } from "@/features/dashboard/date";
import { setNoticeActionStatus } from "@/features/notices/service";
import { deliverRoutineNotifications } from "@/features/notifications/delivery";
import { DEFAULT_NOTIFICATION_PREFERENCES } from "@/features/notifications/schemas";
import { saveNotificationPreferences } from "@/features/notifications/service";
import { createStudentProfile } from "@/features/students/service";
import { createStudyPlan, listStudySessions, removeStudyPlan } from "@/features/study-plan/service";
import { emails } from "@/lib/emails";

function value<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

let owner: string;
let child: string;
let customer: string;

async function makePro() {
  const [billingCustomer] = await db
    .insert(customers)
    .values({
      provider: "stripe",
      providerCustomerId: `test-${owner}`,
      subjectType: "user",
      subjectId: owner,
      app: "agenda-da-turma",
      email: `${owner}@e2e.local`,
    })
    .returning();
  if (!billingCustomer) throw new Error("Customer missing");
  customer = billingCustomer.id;
  await db.insert(subscriptions).values({
    customerId: customer,
    provider: "stripe",
    providerSubscriptionId: `test-${owner}`,
    productId: "agenda_da_turma_pro_monthly",
    providerPriceId: "price_synthetic",
    status: "active",
    currentPeriodStart: new Date(Date.now() - 86400_000),
    currentPeriodEnd: new Date(Date.now() + 30 * 86400_000),
  });
}

async function exam(dueAt: string, type: "exam" | "task" = "exam") {
  const title = `Prova fictícia ${randomUUID()}`;
  const [task] = await db
    .insert(agendaTasks)
    .values({
      profileId: child,
      createdByUserId: owner,
      type,
      title,
      dueAt,
      dateOrigin: "school",
      fingerprint: randomUUID(),
    })
    .returning();
  if (!task) throw new Error("Task missing");
  return task;
}

beforeEach(async () => {
  owner = `study-test-${randomUUID()}`;
  await db.insert(users).values({
    id: owner,
    name: "Adulto fictício",
    email: `${owner}@e2e.local`,
    emailVerified: true,
  });
  await makePro();
  child = value(
    await createStudentProfile(owner, { name: "Criança fictícia", birthDate: null }),
  ).id;
  emails.clearOutbox();
});
afterEach(async () => {
  await db.delete(agendaProductEvents).where(eq(agendaProductEvents.userId, owner));
  await db.delete(emailDeliveries).where(eq(emailDeliveries.userId, owner));
  await db
    .delete(agendaNotificationDeliveries)
    .where(eq(agendaNotificationDeliveries.userId, owner));
  await db.delete(users).where(eq(users.id, owner));
  await db.delete(subscriptions).where(eq(subscriptions.customerId, customer));
  await db.delete(customers).where(eq(customers.id, customer));
  emails.clearOutbox();
});

describe("study plan", () => {
  it("creates sessions before the exam, linked to it and as family planning", async () => {
    const task = await exam(addDaysIso(todayLocalIso(), 6));
    expect(
      value(await createStudyPlan(owner, { taskId: task.id, sessions: 3, minutesEach: 30 })),
    ).toEqual({ sessions: 3 });
    const sessions = await listStudySessions(owner, task.id);
    expect(sessions).toHaveLength(3);
    const rows = await db.select().from(agendaTasks).where(eq(agendaTasks.studyForTaskId, task.id));
    expect(rows.every((row) => row.type === "study")).toBe(true);
    // A escola marcou uma data só: a prova. O resto é planejamento da casa.
    expect(rows.every((row) => row.dateOrigin === "family")).toBe(true);
    expect(rows.every((row) => row.dueAt && row.dueAt < (task.dueAt ?? ""))).toBe(true);
    expect(rows.every((row) => row.estimatedMinutes === 30)).toBe(true);
  });
  it("refuses what cannot be planned, and replanning does not stack", async () => {
    const today = await exam(todayLocalIso());
    expect(
      await createStudyPlan(owner, { taskId: today.id, sessions: 2, minutesEach: 30 }),
    ).toMatchObject({ ok: false, error: { code: "NO_TIME_LEFT" } });
    const chore = await exam(addDaysIso(todayLocalIso(), 5), "task");
    expect(
      await createStudyPlan(owner, { taskId: chore.id, sessions: 2, minutesEach: 30 }),
    ).toMatchObject({ ok: false, error: { code: "NOT_PLANNABLE" } });

    const task = await exam(addDaysIso(todayLocalIso(), 6));
    value(await createStudyPlan(owner, { taskId: task.id, sessions: 3, minutesEach: 30 }));
    value(await createStudyPlan(owner, { taskId: task.id, sessions: 2, minutesEach: 60 }));
    expect(await listStudySessions(owner, task.id)).toHaveLength(2);
  });
  it("refuses on the free limit WITHOUT destroying the plan that already exists", async () => {
    // Um `return` de dentro de uma transação Drizzle commita: cancelar o plano
    // antes de checar o limite apagaria o que a família já tinha e devolveria
    // um erro pedindo espaço para sessões que acabaram de sumir.
    await db.delete(subscriptions).where(eq(subscriptions.customerId, customer));
    const task = await exam(addDaysIso(todayLocalIso(), 8));
    value(await createStudyPlan(owner, { taskId: task.id, sessions: 2, minutesEach: 30 }));
    const before = await listStudySessions(owner, task.id);
    expect(before).toHaveLength(2);
    // Enche a cota gratuita com pendências avulsas.
    for (let i = 0; i < 20; i += 1) await exam(addDaysIso(todayLocalIso(), 9), "task");
    expect(
      await createStudyPlan(owner, { taskId: task.id, sessions: 3, minutesEach: 30 }),
    ).toMatchObject({ ok: false, error: { code: "ACTIVITY_LIMIT_REACHED" } });
    const after = await listStudySessions(owner, task.id);
    expect(after.map((s) => s.id)).toEqual(before.map((s) => s.id));
  });
  it("cancels the pending sessions when the exam itself is canceled", async () => {
    const task = await exam(addDaysIso(todayLocalIso(), 6));
    value(await createStudyPlan(owner, { taskId: task.id, sessions: 3, minutesEach: 30 }));
    const [first] = await listStudySessions(owner, task.id);
    if (!first) throw new Error("Session missing");
    // O que já foi estudado continua feito.
    value(await setNoticeActionStatus(owner, { id: first.id, version: 1, status: "done" }));
    value(await setNoticeActionStatus(owner, { id: task.id, version: 1, status: "canceled" }));
    const remaining = await listStudySessions(owner, task.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]?.status).toBe("done");
  });
  it("removes a plan without touching what was already done", async () => {
    const task = await exam(addDaysIso(todayLocalIso(), 6));
    value(await createStudyPlan(owner, { taskId: task.id, sessions: 3, minutesEach: 30 }));
    expect(value(await removeStudyPlan(owner, { taskId: task.id }))).toEqual({ canceled: 3 });
    expect(await listStudySessions(owner, task.id)).toHaveLength(0);
  });
  it("never plans for a child of another family", async () => {
    const outsider = `study-outsider-${randomUUID()}`;
    await db.insert(users).values({
      id: outsider,
      name: "Estranho fictício",
      email: `${outsider}@e2e.local`,
      emailVerified: true,
    });
    const task = await exam(addDaysIso(todayLocalIso(), 6));
    expect(
      await createStudyPlan(outsider, { taskId: task.id, sessions: 2, minutesEach: 30 }),
    ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    await db.delete(users).where(eq(users.id, outsider));
  });
});

describe("weekly digest", () => {
  /** Um domingo às 18h em São Paulo. */
  const sundaySixPm = new Date("2026-10-04T21:00:00.000Z");

  async function enableWeekly(day: number, hour: number) {
    value(
      await saveNotificationPreferences(owner, {
        ...DEFAULT_NOTIFICATION_PREFERENCES,
        emailEnabled: true,
        // O diário tem teste próprio; aqui ele não pode somar um e-mail.
        digestHour: 5,
        weeklyDigestEnabled: true,
        weeklyDigestDay: day,
        weeklyDigestHour: hour,
      }),
    );
  }

  it("goes out on the chosen weekday and hour, once per week", async () => {
    await db.insert(agendaTasks).values({
      profileId: child,
      createdByUserId: owner,
      type: "exam",
      title: "Prova de Ciências",
      dueAt: "2026-10-07",
      dateOrigin: "school",
      fingerprint: randomUUID(),
    });
    await enableWeekly(0, 18);

    // Dia certo, hora errada.
    await deliverRoutineNotifications(new Date("2026-10-04T19:00:00.000Z"));
    expect(emails.getOutbox()).toHaveLength(0);
    // Hora certa, dia errado.
    await deliverRoutineNotifications(new Date("2026-10-05T21:00:00.000Z"));
    expect(emails.getOutbox()).toHaveLength(0);

    await deliverRoutineNotifications(sundaySixPm);
    const outbox = emails.getOutbox();
    expect(outbox).toHaveLength(1);
    expect(outbox[0]?.subject).toBe("A semana que vem na sua casa");
    expect(outbox[0]?.text).toContain("Prova de Ciências");

    // Rodar de novo na mesma hora não manda outro.
    await deliverRoutineNotifications(sundaySixPm);
    expect(emails.getOutbox()).toHaveLength(1);
  });
  it("stays quiet when the week ahead is empty", async () => {
    await enableWeekly(0, 18);
    await deliverRoutineNotifications(sundaySixPm);
    expect(emails.getOutbox()).toHaveLength(0);
  });
});
