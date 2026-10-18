import "server-only";
import { getBalance } from "@informach/billing/credits";
import {
  and,
  count,
  db,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "@informach/db";
import {
  agendaFamilyMembers,
  agendaStudentProfiles,
  cozyaMeals,
  cozyaProfiles,
  cozyaRecipes,
  creditLedger,
  customers,
  ediActivations,
  ediDevices,
  ediEntitlements,
  emailDeliveries,
  events,
  missaoFamilies,
  missaoProfiles,
  missaoSessions,
  missaoStudyDevices,
  sessions,
  subscriptions,
  users,
} from "@informach/db/schema";
import { revokeDevice } from "@informach/edi-licensing/devices";
import type { ProductKey } from "@/lib/products";
import { readDb } from "@/lib/read-db";
import { eventsAboutPerson } from "../audit/repository";
import {
  COZYA_DEMO_DAYS,
  countLiveSessions,
  likePattern,
  PAGE_SIZE,
  type PeopleFilters,
  type PlanFilter,
  planScope,
  TIMELINE_EXCLUDED,
} from "./service";

/**
 * Consultas de Pessoas e da ficha. Toda seleção lista as colunas de propósito:
 * nada de `select()` vazio, que traria token, IP ou texto de e-mail junto. O
 * teste `features/privacy.test.ts` confere isso.
 *
 * "Usa o produto" (filtro e etiquetas) é, por app:
 * - Cozya: tem `cozya.profiles` (criado na primeira entrada no app) ou cliente de cobrança do Cozya.
 * - Agenda da Turma: tem perfil de criança, é adulto convidado numa família ou tem cliente de cobrança da Agenda.
 * - Missão Saber: tem `missao_saber.families` (criada no primeiro acesso) ou cliente de cobrança da Missão.
 * - Suíte Edi: tem computador conectado alguma vez, direito de uso em `edi.entitlements` ou cliente de cobrança do Edi.
 */

const subjectIsUser = sql`${customers.subjectType} = 'user' and ${customers.subjectId} = ${users.id}`;

function hasCustomer(app: ProductKey) {
  return sql`exists (select 1 from ${customers} where ${subjectIsUser} and ${customers.app} = ${app})`;
}

function usesProduct(app: ProductKey) {
  switch (app) {
    case "cozya":
      return sql`(exists (select 1 from ${cozyaProfiles} where ${cozyaProfiles.userId} = ${users.id}) or ${hasCustomer(app)})`;
    case "agenda-da-turma":
      return sql`(exists (select 1 from ${agendaStudentProfiles} where ${agendaStudentProfiles.userId} = ${users.id})
        or exists (select 1 from ${agendaFamilyMembers} where ${agendaFamilyMembers.userId} = ${users.id})
        or ${hasCustomer(app)})`;
    case "missao-saber":
      return sql`(exists (select 1 from ${missaoFamilies} where ${missaoFamilies.userId} = ${users.id}) or ${hasCustomer(app)})`;
    case "edi":
      return sql`(exists (select 1 from ${ediDevices} where ${ediDevices.userId} = ${users.id})
        or exists (select 1 from ${ediEntitlements} where ${ediEntitlements.userId} = ${users.id})
        or ${hasCustomer(app)})`;
  }
}

type SubscriptionStatus = (typeof subscriptions.status.enumValues)[number];

/** Assinatura nessas situações, no produto pedido ou em qualquer um (`app` nulo). */
function hasSubscriptionIn(statuses: SubscriptionStatus[], app: ProductKey | null) {
  const inApp = app ? sql` and ${customers.app} = ${app}` : sql``;
  return sql`exists (select 1 from ${subscriptions} inner join ${customers} on ${subscriptions.customerId} = ${customers.id}
    where ${subjectIsUser} and ${inArray(subscriptions.status, statuses)}${inApp})`;
}

/**
 * Filtro de situação, sempre dentro do produto filtrado: "Agenda da Turma" e
 * "Em atraso" juntos é quem está em atraso na Agenda, não em qualquer produto.
 * As regras de cada situação estão em `planScope`, testada sem banco.
 */
function planCondition(plan: PlanFilter, product: ProductKey | null) {
  const scope = planScope(plan, product);
  const subscribed = hasSubscriptionIn(scope.statuses, scope.app);
  if (scope.without) return sql`not ${subscribed}`;
  if (!scope.cozyaDemo) return subscribed;
  // Demonstração do Cozya ainda dentro dos 14 dias.
  return sql`(${subscribed} or exists (select 1 from ${cozyaProfiles}
    where ${cozyaProfiles.userId} = ${users.id}
    and ${cozyaProfiles.trialStartedAt} > now() - make_interval(days => ${COZYA_DEMO_DAYS})))`;
}

const activeBan = sql`(${users.banned} and (${users.banExpiresAt} is null or ${users.banExpiresAt} > now()))`;

function peopleWhere(filters: PeopleFilters) {
  const conditions = [];
  if (filters.q) {
    const pattern = likePattern(filters.q);
    conditions.push(
      or(eq(users.id, filters.q), ilike(users.email, pattern), ilike(users.name, pattern)),
    );
  }
  if (filters.product) conditions.push(usesProduct(filters.product));
  if (filters.plan) conditions.push(planCondition(filters.plan, filters.product));
  if (filters.account === "nao-confirmada") conditions.push(eq(users.emailVerified, false));
  if (filters.account === "banida") conditions.push(activeBan);
  if (filters.account === "equipe") conditions.push(inArray(users.role, ["owner", "admin"]));
  return conditions.length ? and(...conditions) : undefined;
}

/**
 * Última entrada: o evento `session.created` mais recente. As sessões de Cozya,
 * Agenda e Missão ficam no Redis de cada app, então `core.sessions` não serve
 * para isso; a auditoria registra toda entrada, em qualquer produto.
 */
//
// Os nomes vão escritos por extenso de propósito: numa consulta de uma tabela só,
// o Drizzle tira o nome da tabela das colunas que estão na lista do select, e
// `${users.id}` viraria `"id"`, que dentro da subconsulta é o id do evento. A
// comparação nunca batia e a última entrada saía vazia para todo mundo.
const lastSignIn = sql<Date | null>`(select max(signin.created_at) from audit.events signin
  where signin.actor_id = "users"."id" and signin.event_type = 'session.created')`;

export async function searchPeople(filters: PeopleFilters) {
  const where = peopleWhere(filters);
  const [rows, [total]] = await Promise.all([
    readDb()
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        emailVerified: users.emailVerified,
        role: users.role,
        banned: users.banned,
        banExpiresAt: users.banExpiresAt,
        createdAt: users.createdAt,
        lastSignInAt: lastSignIn.mapWith((value) => (value ? new Date(value) : null)),
      })
      .from(users)
      .where(where)
      .orderBy(sql`${lastSignIn} desc nulls last`, desc(users.createdAt))
      .limit(PAGE_SIZE)
      .offset((filters.page - 1) * PAGE_SIZE),
    readDb().select({ value: count() }).from(users).where(where),
  ]);
  return { rows, total: total?.value ?? 0 };
}

/** Contagens dos atalhos da lista. */
export async function peopleShortcutCounts() {
  const counted = (condition: ReturnType<typeof sql>) =>
    readDb()
      .select({ value: count() })
      .from(users)
      .where(condition)
      .then(([row]) => row?.value ?? 0);
  const [atraso, naoConfirmada, teste, banida] = await Promise.all([
    counted(planCondition("atraso", null)),
    counted(sql`${users.emailVerified} = false`),
    counted(planCondition("teste", null)),
    counted(activeBan),
  ]);
  return { atraso, naoConfirmada, teste, banida };
}

/** Assinaturas de várias pessoas, para as etiquetas da lista e a ficha. */
export async function subscriptionsFor(userIds: string[]) {
  if (!userIds.length) return [];
  return readDb()
    .select({
      userId: customers.subjectId,
      app: customers.app,
      providerCustomerId: customers.providerCustomerId,
      status: subscriptions.status,
      productId: subscriptions.productId,
      currentPeriodStart: subscriptions.currentPeriodStart,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
      pendingProductId: subscriptions.pendingProductId,
      canceledAt: subscriptions.canceledAt,
      confirmedAt: subscriptions.confirmedAt,
      trialEnd: subscriptions.trialEnd,
      createdAt: subscriptions.createdAt,
      updatedAt: subscriptions.updatedAt,
    })
    .from(subscriptions)
    .innerJoin(customers, eq(subscriptions.customerId, customers.id))
    .where(and(eq(customers.subjectType, "user"), inArray(customers.subjectId, userIds)));
}

/** Em quais produtos cada pessoa aparece, pelo critério documentado no topo do arquivo. */
export async function productPresenceFor(userIds: string[]) {
  const presence = new Map<string, Set<ProductKey>>();
  if (!userIds.length) return { presence, cozyaTrials: new Map<string, Date>() };
  const add = (userId: string, app: ProductKey) => {
    const set = presence.get(userId) ?? new Set<ProductKey>();
    set.add(app);
    presence.set(userId, set);
  };
  const [cozya, agendaProfiles, agendaGuests, missao, edi, entitlements, billingCustomers] =
    await Promise.all([
      readDb()
        .select({ userId: cozyaProfiles.userId, trialStartedAt: cozyaProfiles.trialStartedAt })
        .from(cozyaProfiles)
        .where(inArray(cozyaProfiles.userId, userIds)),
      readDb()
        .selectDistinct({ userId: agendaStudentProfiles.userId })
        .from(agendaStudentProfiles)
        .where(inArray(agendaStudentProfiles.userId, userIds)),
      readDb()
        .selectDistinct({ userId: agendaFamilyMembers.userId })
        .from(agendaFamilyMembers)
        .where(inArray(agendaFamilyMembers.userId, userIds)),
      readDb()
        .select({ userId: missaoFamilies.userId })
        .from(missaoFamilies)
        .where(inArray(missaoFamilies.userId, userIds)),
      readDb()
        .selectDistinct({ userId: ediDevices.userId })
        .from(ediDevices)
        .where(inArray(ediDevices.userId, userIds)),
      readDb()
        .select({ userId: ediEntitlements.userId })
        .from(ediEntitlements)
        .where(inArray(ediEntitlements.userId, userIds)),
      readDb()
        .selectDistinct({ userId: customers.subjectId, app: customers.app })
        .from(customers)
        .where(and(eq(customers.subjectType, "user"), inArray(customers.subjectId, userIds))),
    ]);
  const cozyaTrials = new Map<string, Date>();
  for (const row of cozya) {
    add(row.userId, "cozya");
    if (row.trialStartedAt) cozyaTrials.set(row.userId, row.trialStartedAt);
  }
  for (const row of [...agendaProfiles, ...agendaGuests]) add(row.userId, "agenda-da-turma");
  for (const row of missao) add(row.userId, "missao-saber");
  for (const row of [...edi, ...entitlements]) add(row.userId, "edi");
  for (const row of billingCustomers) {
    if (
      row.app === "cozya" ||
      row.app === "agenda-da-turma" ||
      row.app === "missao-saber" ||
      row.app === "edi"
    )
      add(row.userId, row.app);
  }
  return { presence, cozyaTrials };
}

// ---------------------------------------------------------------------------
// Ficha
// ---------------------------------------------------------------------------

export async function findPerson(id: string) {
  const [row] = await readDb()
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      emailVerified: users.emailVerified,
      role: users.role,
      banned: users.banned,
      banReason: users.banReason,
      banExpiresAt: users.banExpiresAt,
      twoFactorEnabled: users.twoFactorEnabled,
      createdAt: users.createdAt,
      lastSignInAt: lastSignIn.mapWith((value) => (value ? new Date(value) : null)),
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return row ?? null;
}

/** Contagens de uso por produto. De criança, só quantos perfis existem. */
export async function usageCounts(userId: string) {
  const [
    [cozyaProfile],
    [recipes],
    [plannedWeeks],
    [childProfiles],
    [invitedAdults],
    [guestIn],
    [missaoFamily],
    [studentProfiles],
    [studyDevices],
    [missions],
  ] = await Promise.all([
    readDb()
      .select({ trialStartedAt: cozyaProfiles.trialStartedAt })
      .from(cozyaProfiles)
      .where(eq(cozyaProfiles.userId, userId))
      .limit(1),
    readDb().select({ value: count() }).from(cozyaRecipes).where(eq(cozyaRecipes.userId, userId)),
    readDb()
      .select({
        value: sql<number>`count(distinct date_trunc('week', ${cozyaMeals.day}))`.mapWith(Number),
      })
      .from(cozyaMeals)
      .where(eq(cozyaMeals.userId, userId)),
    readDb()
      .select({ value: count() })
      .from(agendaStudentProfiles)
      .where(eq(agendaStudentProfiles.userId, userId)),
    readDb()
      .select({ value: count() })
      .from(agendaFamilyMembers)
      .where(eq(agendaFamilyMembers.ownerUserId, userId)),
    readDb()
      .select({ value: count() })
      .from(agendaFamilyMembers)
      .where(eq(agendaFamilyMembers.userId, userId)),
    readDb()
      .select({ userId: missaoFamilies.userId })
      .from(missaoFamilies)
      .where(eq(missaoFamilies.userId, userId))
      .limit(1),
    readDb()
      .select({ value: count() })
      .from(missaoProfiles)
      .where(eq(missaoProfiles.userId, userId)),
    readDb()
      .select({ value: count() })
      .from(missaoStudyDevices)
      .where(
        and(
          eq(missaoStudyDevices.userId, userId),
          isNull(missaoStudyDevices.revokedAt),
          isNotNull(missaoStudyDevices.connectedAt),
          gt(missaoStudyDevices.expiresAt, sql`now()`),
        ),
      ),
    readDb()
      .select({
        value: count(),
        last: sql<Date | null>`max(${missaoSessions.completedAt})`.mapWith((value) =>
          value ? new Date(value) : null,
        ),
      })
      .from(missaoSessions)
      .innerJoin(missaoProfiles, eq(missaoSessions.profileId, missaoProfiles.id))
      .where(and(eq(missaoProfiles.userId, userId), isNotNull(missaoSessions.completedAt))),
  ]);
  return {
    cozya: {
      present: Boolean(cozyaProfile),
      trialStartedAt: cozyaProfile?.trialStartedAt ?? null,
      recipes: recipes?.value ?? 0,
      plannedWeeks: plannedWeeks?.value ?? 0,
    },
    agenda: {
      childProfiles: childProfiles?.value ?? 0,
      invitedAdults: invitedAdults?.value ?? 0,
      guestIn: guestIn?.value ?? 0,
    },
    missao: {
      present: Boolean(missaoFamily),
      studentProfiles: studentProfiles?.value ?? 0,
      studyDevices: studyDevices?.value ?? 0,
      completedMissions: missions?.value ?? 0,
      lastCompletedAt: missions?.last ?? null,
    },
  };
}

/** Computadores da Suíte Edi: o nome é o que a pessoa escolheu ao conectar. */
export async function ediComputers(userId: string) {
  const [devices, [entitlement]] = await Promise.all([
    readDb()
      .select({
        id: ediDevices.id,
        name: ediDevices.name,
        createdAt: ediDevices.createdAt,
        lastSeenAt: ediDevices.lastSeenAt,
        activeActivations:
          sql<number>`count(${ediActivations.id}) filter (where ${ediActivations.revokedAt} is null)`.mapWith(
            Number,
          ),
      })
      .from(ediDevices)
      .leftJoin(ediActivations, eq(ediActivations.deviceId, ediDevices.id))
      .where(eq(ediDevices.userId, userId))
      .groupBy(ediDevices.id)
      .orderBy(desc(ediDevices.lastSeenAt)),
    readDb()
      .select({ paidThrough: ediEntitlements.paidThrough, suspended: ediEntitlements.suspended })
      .from(ediEntitlements)
      .where(eq(ediEntitlements.userId, userId))
      .limit(1),
  ]);
  return {
    devices: devices.map((device) => ({ ...device, connected: device.activeActivations > 0 })),
    entitlement: entitlement ?? null,
  };
}

/** Apps em que a pessoa tem lançamento de créditos, com saldo e reservas. */
export async function creditBalances(userId: string) {
  const apps = await readDb()
    .selectDistinct({ app: creditLedger.app })
    .from(creditLedger)
    .where(and(eq(creditLedger.ownerType, "user"), eq(creditLedger.ownerId, userId)));
  return Promise.all(
    apps.map(async ({ app }) => ({
      app,
      balance: await getBalance({ db: readDb(), app }, { type: "user", id: userId }),
    })),
  );
}

/** Sessões guardadas no Postgres: Suíte Edi e Bastidores. Sem token e sem IP. */
export async function databaseSessions(userId: string) {
  return readDb()
    .select({
      userAgent: sessions.userAgent,
      createdAt: sessions.createdAt,
      updatedAt: sessions.updatedAt,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, sql`now()`)))
    .orderBy(desc(sessions.updatedAt))
    .limit(20);
}

/** Últimos e-mails: categoria, situação e horário. Assunto e corpo nunca saem do banco. */
export async function recentEmails(userId: string) {
  return readDb()
    .select({
      id: emailDeliveries.id,
      category: emailDeliveries.category,
      status: emailDeliveries.status,
      sentAt: emailDeliveries.sentAt,
      nextAttemptAt: emailDeliveries.nextAttemptAt,
      createdAt: emailDeliveries.createdAt,
    })
    .from(emailDeliveries)
    .where(eq(emailDeliveries.userId, userId))
    .orderBy(desc(emailDeliveries.createdAt))
    .limit(20);
}

/**
 * Eventos da pessoa: o que ela fez e o que fizeram com a conta dela, inclusive
 * os avisos de assinatura do Stripe, que só trazem o cliente de cobrança. O
 * critério é o mesmo do filtro por pessoa da Auditoria (`eventsAboutPerson`).
 * O payload vai inteiro para o servidor, mas a tela só mostra o que
 * `describeEvent` deixa.
 */
export async function timelineEvents(userId: string) {
  return readDb()
    .select({
      id: events.id,
      eventType: events.eventType,
      actorId: events.actorId,
      payload: events.payload,
      createdAt: events.createdAt,
    })
    .from(events)
    .where(
      and(
        eventsAboutPerson(userId),
        sql`${events.eventType} not in (${sql.join(
          TIMELINE_EXCLUDED.map((type) => sql`${type}`),
          sql`, `,
        )})`,
        sql`${events.eventType} not like 'email.%'`,
      ),
    )
    .orderBy(desc(events.createdAt))
    .limit(50);
}

/** Quem da equipe abriu esta ficha, da consulta mais recente para a mais antiga. */
export async function fichaViewers(targetId: string) {
  return readDb()
    .select({
      actorId: events.actorId,
      name: users.name,
      email: users.email,
      createdAt: events.createdAt,
    })
    .from(events)
    .leftJoin(users, eq(users.id, events.actorId))
    .where(
      and(
        eq(events.eventType, "admin.user_viewed"),
        sql`${events.payload}->>'targetId' = ${targetId}`,
      ),
    )
    .orderBy(desc(events.createdAt))
    .limit(20);
}

export async function lastViewBy(actorId: string, targetId: string): Promise<Date | null> {
  const [row] = await readDb()
    .select({ createdAt: events.createdAt })
    .from(events)
    .where(
      and(
        eq(events.eventType, "admin.user_viewed"),
        eq(events.actorId, actorId),
        sql`${events.payload}->>'targetId' = ${targetId}`,
      ),
    )
    .orderBy(desc(events.createdAt))
    .limit(1);
  return row?.createdAt ?? null;
}

/** Nomes de quem aparece como autor na linha do tempo. */
export async function namesOf(ids: string[]) {
  if (!ids.length) return new Map<string, string>();
  const rows = await readDb()
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(inArray(users.id, ids));
  return new Map(
    rows.map((row) => [row.id, row.name.trim() || row.email.split("@")[0] || "Alguém"]),
  );
}

/** Papel e banimento atuais do alvo, conferidos de novo na hora de agir. */
export async function actionTarget(id: string) {
  const [row] = await readDb()
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      emailVerified: users.emailVerified,
      role: users.role,
      banned: users.banned,
      banExpiresAt: users.banExpiresAt,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Escritas (cliente normal; a conexão das telas recusa escrita)
// ---------------------------------------------------------------------------

/** Apaga as sessões guardadas no Postgres (Suíte Edi e Bastidores). Devolve quantas. */
/**
 * Apaga todas as sessões da conta guardadas no Postgres, as vencidas junto, e
 * devolve quantas estavam valendo: a tela diz "N sessões encerradas" e não deve
 * contar uma sessão que já tinha acabado.
 */
export async function deleteDatabaseSessions(userId: string, now = new Date()): Promise<number> {
  const removed = await db
    .delete(sessions)
    .where(eq(sessions.userId, userId))
    .returning({ expiresAt: sessions.expiresAt });
  return countLiveSessions(removed, now);
}

export async function disconnectEdiComputer(userId: string, deviceId: string): Promise<boolean> {
  return revokeDevice(db, userId, deviceId, new Date());
}
