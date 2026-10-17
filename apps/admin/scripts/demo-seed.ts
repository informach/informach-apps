/**
 * Dados fictícios para ver o Bastidores funcionando em desenvolvimento.
 * Cria uma equipe (owner e admin, senha `senha-de-demonstracao`), pessoas em
 * cada produto, assinaturas em todas as situações, créditos, tarefas de IA,
 * e-mails, auditoria e execuções de rotinas.
 *
 *   DATABASE_URL=postgres://...@127.0.0.1:<porta>/... pnpm --filter @informach/admin demo-seed
 *
 * Só roda contra banco local (localhost ou 127.0.0.1) e recusa banco com dados
 * de verdade (mais de 50 contas). Todo e-mail termina em `@example.test`.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { count, db, eq } from "@informach/db";
import {
  accounts,
  agendaFamilyMembers,
  agendaProductEvents,
  agendaStudentProfiles,
  agentRuns,
  cozyaProductEvents,
  cozyaProfiles,
  creditLedger,
  creditReservations,
  customers,
  ediActivations,
  ediDevices,
  ediEntitlements,
  emailDeliveries,
  events,
  jobRuns,
  missaoFamilies,
  missaoProfiles,
  missaoReports,
  missaoSessions,
  oneTimePayments,
  sessions,
  subscriptions,
  users,
  webhookEvents,
} from "@informach/db/schema";
import { hashPassword } from "better-auth/crypto";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = Date.now();
const ago = (ms: number) => new Date(now - ms);
const ahead = (ms: number) => new Date(now + ms);

function assertLocal(url: string | undefined) {
  if (!url) throw new Error("Defina DATABASE_URL apontando para um banco local.");
  const host = new URL(url).hostname;
  if (host !== "127.0.0.1" && host !== "localhost")
    throw new Error(`Recusado: ${host} não é banco local. O demo-seed só roda em desenvolvimento.`);
}

type Person = {
  id: string;
  name: string;
  email: string;
  role?: string;
  daysAgo: number;
  verified?: boolean;
};

const people: Person[] = [
  {
    id: "demo-owner",
    name: "Helena Demonstração",
    email: "helena@example.test",
    role: "owner",
    daysAgo: 200,
  },
  {
    id: "demo-admin",
    name: "Sofia Suporte",
    email: "suporte@example.test",
    role: "admin",
    daysAgo: 120,
  },
  { id: "demo-marina", name: "Marina Alves", email: "marina@example.test", daysAgo: 90 },
  { id: "demo-joao", name: "João Pereira", email: "joao@example.test", daysAgo: 60 },
  { id: "demo-ana", name: "Ana Costa", email: "ana@example.test", daysAgo: 40 },
  { id: "demo-bruno", name: "Bruno Lima", email: "bruno@example.test", daysAgo: 25 },
  { id: "demo-carla", name: "Carla Souza", email: "carla@example.test", daysAgo: 12 },
  { id: "demo-davi", name: "Davi Rocha", email: "davi@example.test", daysAgo: 6 },
  { id: "demo-elisa", name: "Elisa Martins", email: "elisa@example.test", daysAgo: 4 },
  {
    id: "demo-fabio",
    name: "Fábio Nunes",
    email: "fabio@example.test",
    daysAgo: 2,
    verified: false,
  },
  { id: "demo-gabi", name: "Gabriela Dias", email: "gabi@example.test", daysAgo: 1 },
  { id: "demo-hugo", name: "Hugo Prado", email: "hugo@example.test", daysAgo: 0 },
];

async function main() {
  assertLocal(process.env.DATABASE_URL);
  const [existing] = await db.select({ total: count() }).from(users);
  if ((existing?.total ?? 0) > 50) throw new Error("Recusado: o banco já tem mais de 50 contas.");
  const [seeded] = await db.select({ id: users.id }).from(users).where(eq(users.id, "demo-owner"));
  if (seeded) {
    console.log("Os dados de demonstração já estão neste banco. Nada mudou.");
    process.exit(0);
  }

  await db
    .insert(users)
    .values(
      people.map((person) => ({
        id: person.id,
        name: person.name,
        email: person.email,
        emailVerified: person.verified ?? true,
        role: person.role ?? "member",
        createdAt: ago(person.daysAgo * DAY),
        updatedAt: ago(person.daysAgo * DAY),
      })),
    )
    .onConflictDoNothing();

  const password = await hashPassword("senha-de-demonstracao");
  await db
    .insert(accounts)
    .values(
      ["demo-owner", "demo-admin"].map((userId) => ({
        id: `cred-${userId}`,
        userId,
        accountId: userId,
        providerId: "credential",
        password,
        createdAt: ago(100 * DAY),
        updatedAt: ago(100 * DAY),
      })),
    )
    .onConflictDoNothing();

  // Contas e entradas, como os apps gravam na auditoria.
  const audit = [
    ...people.map((person) => ({
      eventType: "user.created" as const,
      actorId: person.id,
      payload: { email: person.email },
      createdAt: ago(person.daysAgo * DAY),
    })),
    ...people.slice(2).flatMap((person, index) =>
      Array.from({ length: (index % 3) + 1 }, (_, n) => ({
        eventType: "session.created" as const,
        actorId: person.id,
        payload: {
          sessionId: randomUUID(),
          userAgent: "Mozilla/5.0 (Linux; Android 14) Chrome/130",
        },
        createdAt: ago((n * 2 + (index % 4)) * DAY + 3 * HOUR),
      })),
    ),
    {
      eventType: "user.banned" as const,
      actorId: "demo-admin",
      payload: { targetId: "demo-hugo", reason: "Teste de demonstração" },
      createdAt: ago(3 * HOUR),
    },
    {
      eventType: "user.unbanned" as const,
      actorId: "demo-admin",
      payload: { targetId: "demo-hugo", reason: null },
      createdAt: ago(2 * HOUR),
    },
    {
      eventType: "billing.payment_failed" as const,
      actorId: null,
      payload: { subjectId: "demo-joao", app: "cozya" },
      createdAt: ago(5 * DAY),
    },
  ];
  await db.insert(events).values(audit.map((row) => ({ id: randomUUID(), ...row })));

  // Sessões guardadas no Postgres (Edi e Bastidores). O IP fica de propósito: a tela não pode mostrar.
  await db.insert(sessions).values([
    {
      id: randomUUID(),
      userId: "demo-marina",
      token: `demo-token-${randomUUID()}`,
      expiresAt: ahead(20 * DAY),
      ipAddress: "203.0.113.77",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edi/0.1.0 Chrome/130",
      createdAt: ago(2 * DAY),
      updatedAt: ago(3 * HOUR),
    },
  ]);

  // Clientes e assinaturas por produto, em todas as situações.
  type Plan = {
    userId: string;
    app: string;
    productId: string;
    status: "active" | "trialing" | "past_due" | "canceled";
    startedDaysAgo: number;
  };
  const plans: Plan[] = [
    {
      userId: "demo-marina",
      app: "cozya",
      productId: "cozya_pro_monthly",
      status: "active",
      startedDaysAgo: 80,
    },
    {
      userId: "demo-marina",
      app: "agenda-da-turma",
      productId: "agenda_da_turma_pro_annual",
      status: "active",
      startedDaysAgo: 70,
    },
    {
      userId: "demo-joao",
      app: "cozya",
      productId: "cozya_pro_monthly",
      status: "past_due",
      startedDaysAgo: 50,
    },
    {
      userId: "demo-ana",
      app: "missao-saber",
      productId: "missao_family_monthly",
      status: "active",
      startedDaysAgo: 30,
    },
    {
      userId: "demo-bruno",
      app: "agenda-da-turma",
      productId: "agenda_da_turma_pro_monthly",
      status: "trialing",
      startedDaysAgo: 5,
    },
    {
      userId: "demo-carla",
      app: "cozya",
      productId: "cozya_pro_annual",
      status: "canceled",
      startedDaysAgo: 11,
    },
    {
      userId: "demo-davi",
      app: "missao-saber",
      productId: "missao_individual_annual",
      status: "active",
      startedDaysAgo: 6,
    },
  ];
  for (const plan of plans) {
    const person = people.find((p) => p.id === plan.userId);
    const [customer] = await db
      .insert(customers)
      .values({
        provider: "stripe",
        providerCustomerId: `cus_demo_${plan.userId}_${plan.app}`.replaceAll("-", "_"),
        subjectType: "user",
        subjectId: plan.userId,
        app: plan.app,
        email: person?.email ?? "demo@example.test",
      })
      .onConflictDoNothing()
      .returning({ id: customers.id });
    if (!customer) continue;
    await db.insert(subscriptions).values({
      customerId: customer.id,
      provider: "stripe",
      providerSubscriptionId: `sub_demo_${plan.userId}_${plan.app}`.replaceAll("-", "_"),
      productId: plan.productId,
      providerPriceId: `price_demo_${plan.productId}`,
      status: plan.status,
      currentPeriodStart: ago(Math.min(plan.startedDaysAgo, 25) * DAY),
      currentPeriodEnd: ahead(5 * DAY),
      confirmedAt: ago(plan.startedDaysAgo * DAY),
      trialEnd: plan.status === "trialing" ? ahead(9 * DAY) : null,
      canceledAt: plan.status === "canceled" ? ago(2 * DAY) : null,
      createdAt: ago(plan.startedDaysAgo * DAY),
      updatedAt: ago(2 * DAY),
    });
  }

  await db.insert(oneTimePayments).values({
    customerId:
      (await db.select({ id: customers.id }).from(customers).limit(1))[0]?.id ?? randomUUID(),
    provider: "stripe",
    providerPaymentId: "pi_demo_pack_1",
    productId: "cozya_credits_20",
    amountCents: 1290,
    currency: "BRL",
    creditAmount: 20,
    status: "paid",
    paidAt: ago(3 * DAY),
  });

  await db.insert(webhookEvents).values([
    {
      provider: "stripe",
      providerEventId: "cozya:evt_demo_falhou",
      eventType: "invoice.paid",
      payload: { demo: true },
      error: "Erro de demonstração com dado que não pode aparecer na tela",
      attempts: 2,
      createdAt: ago(2 * HOUR),
    },
    {
      provider: "stripe",
      providerEventId: "agenda-da-turma:evt_demo_ok",
      eventType: "customer.subscription.updated",
      payload: { demo: true },
      attempts: 1,
      processedAt: ago(1 * DAY),
      createdAt: ago(1 * DAY),
    },
  ]);

  // Créditos e tarefas de IA.
  await db.insert(creditLedger).values([
    {
      ownerType: "user",
      ownerId: "demo-marina",
      app: "cozya",
      amount: 100,
      entryType: "bonus_grant",
      createdAt: ago(20 * DAY),
    },
    {
      ownerType: "user",
      ownerId: "demo-marina",
      app: "cozya",
      amount: -14,
      entryType: "consumption",
      createdAt: ago(2 * DAY),
    },
    {
      ownerType: "user",
      ownerId: "demo-marina",
      app: "agenda-da-turma",
      amount: 50,
      entryType: "bonus_grant",
      createdAt: ago(15 * DAY),
    },
    {
      ownerType: "user",
      ownerId: "demo-marina",
      app: "agenda-da-turma",
      amount: -6,
      entryType: "consumption",
      createdAt: ago(1 * DAY),
    },
  ]);
  const reservationStatuses = [
    "committed",
    "committed",
    "committed",
    "released",
    "active",
  ] as const;
  await db.insert(creditReservations).values(
    reservationStatuses.map((status, index) => ({
      ownerType: "user" as const,
      ownerId: "demo-marina",
      estimatedAmount: 2,
      app: index % 2 ? "agenda-da-turma" : "cozya",
      feature: index % 2 ? "notice-extract" : "recipe-chat",
      model: "demo/model",
      status,
      expiresAt: status === "active" ? ago(10 * 60_000) : ahead(HOUR),
      createdAt: ago(index * HOUR),
    })),
  );
  await db.insert(agentRuns).values([
    {
      app: "cozya",
      agent: "recipe-chat",
      status: "completed",
      startedAt: ago(5 * HOUR),
      finishedAt: ago(5 * HOUR - 4000),
      metadata: { providerCostUsd: 0.0123 },
    },
    {
      app: "cozya",
      agent: "recipe-chat",
      status: "completed",
      startedAt: ago(30 * HOUR),
      finishedAt: ago(30 * HOUR - 3000),
      metadata: { providerCostUsd: 0.0081 },
    },
    {
      app: "agenda-da-turma",
      agent: "notice-extract",
      status: "completed",
      startedAt: ago(8 * HOUR),
      finishedAt: ago(8 * HOUR - 2000),
      metadata: {},
    },
  ]);

  // E-mails: assunto e corpo existem no banco e não podem aparecer na tela.
  await db.insert(emailDeliveries).values([
    {
      id: randomUUID(),
      recipient: "marina@example.test",
      category: "auth.sign-in-otp",
      messageKey: `demo-${randomUUID()}`,
      fromAddress: "nao-responda@example.test",
      unsubscribeUrl: "https://example.test/u",
      subject: "SEGREDO-ASSUNTO 123456",
      html: "<p>SEGREDO-CORPO 123456</p>",
      text: "SEGREDO-CORPO 123456",
      provider: "sendgrid",
      status: "sent",
      sendAttempts: 1,
      sentAt: ago(2 * HOUR),
      userId: "demo-marina",
      createdAt: ago(2 * HOUR),
      updatedAt: ago(2 * HOUR),
    },
    {
      id: randomUUID(),
      recipient: "fabio@example.test",
      category: "auth.verify-email-otp",
      messageKey: `demo-${randomUUID()}`,
      fromAddress: "nao-responda@example.test",
      unsubscribeUrl: "https://example.test/u",
      subject: "SEGREDO-ASSUNTO 654321",
      html: "<p>SEGREDO-CORPO</p>",
      text: "SEGREDO-CORPO",
      provider: "sendgrid",
      status: "failed",
      sendAttempts: 3,
      lastError: "SEGREDO-ERRO do provedor",
      userId: "demo-fabio",
      createdAt: ago(1 * HOUR),
      updatedAt: ago(1 * HOUR),
    },
  ]);

  // Uso de cada produto, só para as contagens.
  await db
    .insert(cozyaProfiles)
    .values({
      userId: "demo-marina",
      householdSize: 3,
      preferences: "SEGREDO-PREFERENCIAS",
      updatedAt: ago(3 * DAY),
    })
    .onConflictDoNothing();
  await db.insert(cozyaProductEvents).values([
    {
      userId: "demo-marina",
      name: "recipe_viewed",
      dedupKey: `demo-${randomUUID()}`,
      occurredAt: ago(1 * DAY),
    },
    {
      userId: "demo-joao",
      name: "recipe_viewed",
      dedupKey: `demo-${randomUUID()}`,
      occurredAt: ago(2 * DAY),
    },
  ]);
  await db.insert(agendaStudentProfiles).values([
    { userId: "demo-marina", name: "SEGREDO-NOME-CRIANCA" },
    { userId: "demo-bruno", name: "SEGREDO-NOME-CRIANCA-2" },
  ]);
  await db
    .insert(agendaFamilyMembers)
    .values({ ownerUserId: "demo-marina", userId: "demo-elisa" })
    .onConflictDoNothing();
  await db.insert(agendaProductEvents).values({
    userId: "demo-marina",
    event: "notice_read",
    source: "web",
    count: 3,
    createdAt: ago(1 * DAY),
  });
  await db
    .insert(missaoFamilies)
    .values({ userId: "demo-ana", consentVersion: "2026-09" })
    .onConflictDoNothing();
  const [profile] = await db
    .insert(missaoProfiles)
    .values({
      userId: "demo-ana",
      nickname: "SEGREDO-APELIDO",
      grade: 5,
      gradeYear: 2026,
      avatar: "fox",
      courseId: "obmep",
    })
    .returning({ id: missaoProfiles.id });
  if (profile) {
    const [session] = await db
      .insert(missaoSessions)
      .values({
        profileId: profile.id,
        lessonId: "demo-lesson",
        version: 1,
        mode: "mission",
        snapshot: { demo: true },
        requestKey: randomUUID(),
        completedAt: ago(2 * DAY),
      })
      .returning({ id: missaoSessions.id });
    await db.insert(missaoReports).values({
      userId: "demo-ana",
      profileId: profile.id,
      sessionId: session?.id,
      lessonId: "demo-lesson",
      version: 1,
      itemId: "q1",
      category: "possible_error",
      detail: "SEGREDO-RELATO",
      status: "open",
    });
  }
  const [device] = await db
    .insert(ediDevices)
    .values({
      id: randomUUID(),
      userId: "demo-marina",
      name: "Notebook da escola",
      publicKeySpki: "demo",
      keyThumbprint: randomBytes(32).toString("hex"),
      lastSeenAt: ago(4 * HOUR),
    })
    .returning({ id: ediDevices.id });
  if (device) await db.insert(ediActivations).values({ deviceId: device.id, revision: 1 });
  await db
    .insert(ediEntitlements)
    .values({ userId: "demo-marina", paidThrough: ahead(20 * DAY) })
    .onConflictDoNothing();

  // Rotinas agendadas: uma falha recente para aparecer em "Precisa de você".
  const jobs: Array<[string, string, boolean, string | null]> = [
    ["cozya", "billing-release-reservations", true, null],
    ["agenda-da-turma", "billing-release-reservations", true, null],
    ["cozya", "email-retry", false, "PostgresError"],
    ["missao-saber", "billing", true, null],
    ["admin", "admin-watch", true, null],
  ];
  await db.insert(jobRuns).values(
    jobs.map(([app, job, ok, errorName]) => ({
      app,
      job,
      ok,
      errorName,
      startedAt: ago(4 * 60_000),
      finishedAt: ago(4 * 60_000 - 1500),
      summary: (ok ? { processed: 3 } : {}) as Record<string, number | boolean>,
    })),
  );

  console.log(
    `Pronto: ${people.length} pessoas fictícias. Entre com helena@example.test e a senha senha-de-demonstracao.`,
  );
  process.exit(0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
