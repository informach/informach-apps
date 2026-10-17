import "server-only";
import type { CreditBalance } from "@informach/billing";
import type { Staff } from "@/lib/access";
import { auditAs } from "@/lib/action";
import { formatDay } from "@/lib/format";
import { isProductKey, PRODUCT_KEYS, PRODUCTS, type ProductKey } from "@/lib/products";
import { isStaffRole } from "@/lib/roles";
import {
  creditBalances,
  databaseSessions,
  ediComputers,
  fichaViewers,
  findPerson,
  lastViewBy,
  namesOf,
  peopleShortcutCounts,
  productPresenceFor,
  recentEmails,
  searchPeople,
  subscriptionsFor,
  timelineEvents,
  usageCounts,
} from "./repository";
import {
  COZYA_DEMO_DAYS,
  cozyaDemoDay,
  currentSubscription,
  describeSubscription,
  describeTimeline,
  describeUserAgent,
  emailCategoryLabel,
  emailStatus,
  isBanActive,
  type PeopleFilters,
  type PlanState,
  shouldRecordView,
  type Tone,
} from "./service";
import { cachedSessionsByApp } from "./sessions";

const ID = /^[A-Za-z0-9_-]{1,80}$/;

export type ProductPlan = {
  product: ProductKey;
  label: string;
  tone: Tone;
};

type SubscriptionRow = Awaited<ReturnType<typeof subscriptionsFor>>[number];

function planFor(
  product: ProductKey,
  rows: SubscriptionRow[],
  cozyaTrialStartedAt: Date | null,
  now: Date,
): { state: PlanState | null; label: string; tone: Tone; row: SubscriptionRow | null } {
  const row = currentSubscription(rows);
  const state = row ? describeSubscription(row) : null;
  if (state && state.kind !== "cancelada" && state.kind !== "outro")
    return { state, label: state.short, tone: state.tone, row };
  if (product === "cozya") {
    const day = cozyaDemoDay(cozyaTrialStartedAt, now);
    if (day)
      return { state, label: `demonstração, dia ${day} de ${COZYA_DEMO_DAYS}`, tone: "info", row };
  }
  return { state, label: state ? state.short : "grátis", tone: "muted", row };
}

export type PersonRowView = {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  lastSignInAt: Date | null;
  plans: ProductPlan[];
  pills: Array<{ tone: Tone; label: string }>;
};

/** Lista de Pessoas com etiquetas de plano por produto e situação da conta. */
export async function loadPeople(filters: PeopleFilters) {
  const now = new Date();
  const [{ rows, total }, shortcuts] = await Promise.all([
    searchPeople(filters),
    peopleShortcutCounts(),
  ]);
  const ids = rows.map((row) => row.id);
  const [subscriptions, { presence, cozyaTrials }] = await Promise.all([
    subscriptionsFor(ids),
    productPresenceFor(ids),
  ]);

  const people: PersonRowView[] = rows.map((row) => {
    const mine = subscriptions.filter((sub) => sub.userId === row.id);
    const apps = new Set<ProductKey>(presence.get(row.id) ?? []);
    for (const sub of mine) if (isProductKey(sub.app)) apps.add(sub.app);
    const plans = PRODUCT_KEYS.filter((key) => apps.has(key)).map((product) => {
      const plan = planFor(
        product,
        mine.filter((sub) => sub.app === product),
        cozyaTrials.get(row.id) ?? null,
        now,
      );
      return { product, label: plan.label, tone: plan.tone };
    });
    const pills: PersonRowView["pills"] = [];
    if (isBanActive(row.banned, row.banExpiresAt, now))
      pills.push({
        tone: "bad",
        label: row.banExpiresAt ? `Banida até ${formatDay(row.banExpiresAt)}` : "Banida, sem data",
      });
    if (!row.emailVerified) pills.push({ tone: "warn", label: "E-mail não confirmado" });
    if (mine.some((sub) => sub.status === "past_due" || sub.status === "unpaid"))
      pills.push({ tone: "bad", label: "Pagamento em atraso" });
    if (isStaffRole(row.role)) pills.push({ tone: "info", label: `Equipe, ${row.role}` });
    if (!pills.length) pills.push({ tone: "ok", label: "E-mail confirmado" });
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      createdAt: row.createdAt,
      lastSignInAt: row.lastSignInAt,
      plans,
      pills,
    };
  });

  return { people, total, shortcuts };
}

// ---------------------------------------------------------------------------
// Ficha
// ---------------------------------------------------------------------------

export type FichaProduct = {
  product: ProductKey;
  planLabel: string;
  tone: Tone;
  line: string | null;
  stripeCustomerId: string | null;
  credits: CreditBalance | null;
  facts: string[];
  notes: string[];
};

export type FichaSession = { product: string; device: string; lastActiveAt: Date | null };

/**
 * Tudo que a ficha mostra, já em frases. Abrir a ficha grava `admin.user_viewed`
 * em nome de quem abriu, uma vez a cada 10 minutos por pessoa da equipe, antes
 * de buscar o resto da conta (só a existência é conferida antes). A gravação é
 * estrita: se falhar, sai `AuditPersistenceError`, nada da conta sai daqui e a
 * página pede para tentar de novo.
 */
export async function loadFicha(id: string, staff: Staff) {
  if (!ID.test(id)) return null;
  const person = await findPerson(id);
  if (!person) return null;
  const now = new Date();

  const lastView = await lastViewBy(staff.id, id);
  const recordNow = shouldRecordView(lastView, now);
  if (recordNow) await auditAs(staff, "admin.user_viewed", { targetId: id });
  const viewRecordedAt = recordNow ? now : (lastView ?? now);

  const [
    subscriptions,
    usage,
    edi,
    balances,
    dbSessions,
    cachedSessions,
    emails,
    rawEvents,
    viewers,
  ] = await Promise.all([
    subscriptionsFor([id]),
    usageCounts(id),
    ediComputers(id),
    creditBalances(id),
    databaseSessions(id),
    cachedSessionsByApp(id),
    recentEmails(id),
    timelineEvents(id),
    fichaViewers(id),
  ]);

  const actorIds = [
    ...new Set(rawEvents.map((event) => event.actorId).filter((value): value is string => !!value)),
  ];
  const names = await namesOf(actorIds.filter((actor) => actor !== id));
  const timeline = describeTimeline(rawEvents, id, (actor) => names.get(actor) ?? null);

  const balanceByApp = new Map(balances.map((entry) => [entry.app, entry.balance]));
  const products: FichaProduct[] = [];
  const add = (
    product: ProductKey,
    extra: Omit<
      FichaProduct,
      "product" | "planLabel" | "tone" | "line" | "stripeCustomerId" | "credits"
    >,
  ) => {
    const rows = subscriptions.filter((sub) => sub.app === product);
    const plan = planFor(product, rows, usage.cozya.trialStartedAt, now);
    products.push({
      product,
      planLabel:
        plan.label === "grátis"
          ? "Grátis"
          : plan.label.charAt(0).toUpperCase() + plan.label.slice(1),
      tone: plan.tone,
      line: plan.state?.line ?? null,
      stripeCustomerId: plan.row?.providerCustomerId ?? rows[0]?.providerCustomerId ?? null,
      credits: balanceByApp.get(product) ?? null,
      ...extra,
    });
  };

  const hasSub = (product: ProductKey) => subscriptions.some((sub) => sub.app === product);

  if (usage.cozya.present || hasSub("cozya") || balanceByApp.has("cozya")) {
    const facts = [
      `${usage.cozya.recipes === 1 ? "1 receita guardada" : `${usage.cozya.recipes} receitas guardadas`} · ${
        usage.cozya.plannedWeeks === 1
          ? "1 semana planejada"
          : `${usage.cozya.plannedWeeks} semanas planejadas`
      }`,
    ];
    add("cozya", { facts, notes: [] });
  }

  const agendaPresent =
    usage.agenda.childProfiles > 0 || usage.agenda.guestIn > 0 || hasSub("agenda-da-turma");
  if (agendaPresent || balanceByApp.has("agenda-da-turma")) {
    const facts = [
      `${usage.agenda.childProfiles === 1 ? "1 perfil de criança" : `${usage.agenda.childProfiles} perfis de criança`} · ${
        usage.agenda.invitedAdults === 0 ? "nenhum adulto convidado" : "1 adulto convidado"
      }`,
    ];
    if (usage.agenda.guestIn > 0)
      facts.push("Também é adulto convidado na família de outra pessoa");
    add("agenda-da-turma", {
      facts,
      notes: ["Das crianças, só a contagem. Nome, turma e atividades ficam fora."],
    });
  }

  if (usage.missao.present || hasSub("missao-saber")) {
    const facts = [
      `${usage.missao.studentProfiles === 1 ? "1 perfil de estudante" : `${usage.missao.studentProfiles} perfis de estudante`} · ${
        usage.missao.studyDevices === 1
          ? "1 aparelho de estudo conectado"
          : `${usage.missao.studyDevices} aparelhos de estudo conectados`
      }`,
      usage.missao.completedMissions === 0
        ? "Nenhuma missão concluída ainda"
        : `${usage.missao.completedMissions === 1 ? "1 missão concluída" : `${usage.missao.completedMissions} missões concluídas`}`,
    ];
    add("missao-saber", {
      facts,
      notes: ["Das crianças, só a contagem. Apelido, ano escolar e respostas ficam fora."],
    });
  }

  const ediConnected = edi.devices.filter((device) => device.connected).length;
  if (edi.devices.length || edi.entitlement || hasSub("edi")) {
    const facts = [
      edi.devices.length === 0
        ? "Nenhum computador conectado"
        : `${ediConnected} de 2 computadores conectados`,
    ];
    if (edi.entitlement?.suspended) facts.push("Direito de uso suspenso");
    add("edi", { facts, notes: [] });
  }

  const sessionsList: FichaSession[] = [
    ...cachedSessions.flatMap((entry) =>
      (entry.sessions ?? []).map((session) => ({
        product: entry.name,
        device: describeUserAgent(session.userAgent),
        lastActiveAt: session.updatedAt ?? session.createdAt,
      })),
    ),
    ...dbSessions.map((session) => ({
      product: isStaffRole(person.role) ? "Suíte Edi ou Bastidores" : PRODUCTS.edi.name,
      device: describeUserAgent(session.userAgent),
      lastActiveAt: session.updatedAt ?? session.createdAt,
    })),
  ].sort((a, b) => (b.lastActiveAt?.getTime() ?? 0) - (a.lastActiveAt?.getTime() ?? 0));
  const unreachable = cachedSessions
    .filter((entry) => entry.sessions === null)
    .map((entry) => entry.name);

  const activeSubscriptionProducts = PRODUCT_KEYS.filter((product) => {
    const row = currentSubscription(subscriptions.filter((sub) => sub.app === product));
    return (
      row && (row.status === "active" || row.status === "trialing" || row.status === "past_due")
    );
  });

  return {
    person: { ...person, banActive: isBanActive(person.banned, person.banExpiresAt, now) },
    viewRecordedAt,
    products,
    sessions: sessionsList,
    unreachableSessionApps: unreachable,
    emails: emails.map((email) => ({
      id: email.id,
      label: emailCategoryLabel(email.category),
      status: emailStatus(email.status, email.nextAttemptAt),
      at: email.sentAt ?? email.createdAt,
    })),
    timeline,
    viewers: viewers.map((viewer) => ({
      // Sem nome nem e-mail só acontece quando a conta foi excluída (left join vazio).
      name: viewer.name?.trim() || viewer.email?.split("@")[0] || "Conta excluída",
      at: viewer.createdAt,
      isMe: viewer.actorId === staff.id,
    })),
    edi: edi.devices.map((device) => ({
      id: device.id,
      name: device.name,
      lastSeenAt: device.lastSeenAt,
      connected: device.connected,
    })),
    activeSubscriptionProducts,
    // Conta sem confirmação quase nunca usou produto ainda: aí a equipe escolhe
    // entre todos, perguntando à pessoa onde ela se cadastrou.
    verificationProducts: products.length
      ? products.map((entry) => entry.product)
      : [...PRODUCT_KEYS],
    verificationProductsDetected: products.length > 0,
  };
}

export type Ficha = NonNullable<Awaited<ReturnType<typeof loadFicha>>>;
