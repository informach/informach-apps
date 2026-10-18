import { randomUUID } from "node:crypto";
import { db, eq } from "@informach/db";
import {
  agendaNotificationDeliveries,
  agendaPushSubscriptions,
  agendaTasks,
  customers,
  subscriptions,
  users,
} from "@informach/db/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
 * A tela bloqueada é pública. A política promete que o aviso no celular não
 * mostra nome de criança nem conteúdo escolar, e o texto do push passou a
 * dizer contagens e dias. Este teste manda um resumo de verdade, pelo mesmo
 * caminho do job, e confere o que chegaria ao serviço de push.
 */
const sent = vi.hoisted(() => {
  process.env.VAPID_PUBLIC_KEY = "chave-publica-de-teste";
  process.env.VAPID_PRIVATE_KEY = "chave-privada-de-teste";
  return [] as string[];
});
vi.mock("web-push", () => ({
  default: {
    sendNotification: vi.fn(async (_subscription: unknown, payload: string) => {
      sent.push(payload);
      return {};
    }),
  },
}));

const { deliverRoutineNotifications } = await import("@/features/notifications/delivery");
const { DEFAULT_NOTIFICATION_PREFERENCES } = await import("@/features/notifications/schemas");
const { saveNotificationPreferences } = await import("@/features/notifications/service");
const { createStudentProfile } = await import("@/features/students/service");

let owner: string;
let customer: string;
// Segunda-feira, 19 de outubro de 2026, às 19h em São Paulo.
const now = new Date("2026-10-19T22:00:00.000Z");

beforeEach(async () => {
  sent.length = 0;
  owner = `push-test-${randomUUID()}`;
  await db.insert(users).values({
    id: owner,
    name: "Adulto fictício",
    email: `${owner}@e2e.local`,
    emailVerified: true,
  });
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
    currentPeriodStart: new Date(now.valueOf() - 86400_000),
    currentPeriodEnd: new Date(now.valueOf() + 30 * 86400_000),
  });
});

afterEach(async () => {
  await db
    .delete(agendaNotificationDeliveries)
    .where(eq(agendaNotificationDeliveries.userId, owner));
  await db.delete(users).where(eq(users.id, owner));
  await db.delete(subscriptions).where(eq(subscriptions.customerId, customer));
  await db.delete(customers).where(eq(customers.id, customer));
});

describe("push na tela bloqueada", () => {
  it("diz contagens e dias, sem nome de criança nem título de atividade", async () => {
    const created = await createStudentProfile(owner, { name: "Clarinha Sigilo", birthDate: null });
    if (!created.ok) throw new Error("Profile missing");
    await db.insert(agendaTasks).values([
      {
        profileId: created.value.id,
        createdByUserId: owner,
        type: "exam",
        title: "Prova secreta de ciências",
        dueAt: "2026-10-19",
        dateOrigin: "school",
        fingerprint: randomUUID(),
      },
      {
        profileId: created.value.id,
        createdByUserId: owner,
        type: "material",
        title: "Levar o caderno confidencial",
        dueAt: "2026-10-20",
        dateOrigin: "school",
        fingerprint: randomUUID(),
      },
    ]);
    await db.insert(agendaPushSubscriptions).values({
      userId: owner,
      endpoint: `https://fcm.googleapis.com/fcm/send/${randomUUID()}`,
      p256dh: `B${"a".repeat(86)}`,
      auth: "a".repeat(22),
    });
    const saved = await saveNotificationPreferences(owner, {
      ...DEFAULT_NOTIFICATION_PREFERENCES,
      pushEnabled: true,
      digestHour: 19,
      quietStart: 23,
      quietEnd: 6,
      weeklyDigestEnabled: false,
    });
    expect(saved.ok).toBe(true);

    await deliverRoutineNotifications(now);

    expect(sent).toHaveLength(1);
    const payload = JSON.parse(sent[0] ?? "{}") as Record<string, unknown>;
    expect(payload).toMatchObject({
      title: "O resumo do dia na Agenda",
      body: "1 para hoje e 1 para amanhã.",
      url: "/dashboard",
    });
    expect(sent[0]).not.toMatch(/Clarinha|Sigilo|secreta|confidencial|ciências/i);
  });
});
