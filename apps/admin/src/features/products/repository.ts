import "server-only";
import { and, count, eq, gt, gte, inArray, isNotNull, isNull, sql } from "@informach/db";
import {
  agendaProductEvents,
  agendaStudentProfiles,
  boraCustomWorkouts,
  boraFamilies,
  boraProfiles,
  boraSessions,
  cozyaProductEvents,
  cozyaProfiles,
  customers,
  ediActivations,
  ediDevices,
  ediEntitlements,
  ediReleases,
  estrelaChildren,
  estrelaCompletions,
  estrelaDevices,
  estrelaFamilies,
  events,
  familyMembers,
  missaoFamilies,
  missaoProfiles,
  missaoReports,
  missaoSessions,
  missaoStudyDevices,
  users,
} from "@informach/db/schema";
import type { ProductKey } from "@/lib/products";
import { readDb } from "@/lib/read-db";
import { memo } from "../overview/memo";
import { iso } from "../overview/sql-time";
import {
  agendaParticipants,
  estrelaDeviceAuthority,
  familyPresence,
} from "../people/family-metadata";

/**
 * Números de uso de cada produto. Só contagens: nenhum nome de receita, recado,
 * criança ou projeto, nenhuma resposta. De criança, só quantos perfis existem.
 */

export type Funnel = {
  /** Contas com presença no produto. */
  accounts: number;
  /** Dessas, com e-mail confirmado. */
  confirmed: number;
  /** Dessas, com atividade no produto desde `since`. */
  active: number;
};

const TTL = 2 * 60_000;

/** Monta a contagem do funil sobre um conjunto de contas e um conjunto de ativas. */
async function funnelFor(presence: ReturnType<typeof sql>, activity: ReturnType<typeof sql>) {
  const rows = await readDb().execute<{ accounts: number; confirmed: number; active: number }>(sql`
    with presence as (${presence}),
    activity as (${activity})
    select
      count(*)::int as accounts,
      count(*) filter (where ${users.emailVerified})::int as confirmed,
      count(*) filter (where presence.user_id in (select user_id from activity))::int as active
    from presence
    join ${users} on ${users.id} = presence.user_id
  `);
  const row = rows[0];
  return {
    accounts: Number(row?.accounts ?? 0),
    confirmed: Number(row?.confirmed ?? 0),
    active: Number(row?.active ?? 0),
  } satisfies Funnel;
}

export type CozyaUsage = Funnel & { trials: number; events: Record<string, number> };

export function cozyaUsage(since: Date): Promise<CozyaUsage> {
  return memo(`products:cozya:${since.toISOString().slice(0, 13)}`, TTL, async () => {
    const db = readDb();
    const [funnel, trials, events] = await Promise.all([
      funnelFor(
        sql`select ${cozyaProfiles.userId} as user_id from ${cozyaProfiles}`,
        sql`select distinct ${cozyaProductEvents.userId} as user_id from ${cozyaProductEvents}
            where ${cozyaProductEvents.occurredAt} >= ${iso(since)} and ${cozyaProductEvents.userId} is not null`,
      ),
      db
        .select({ total: count() })
        .from(cozyaProfiles)
        .where(isNotNull(cozyaProfiles.trialStartedAt)),
      db
        .select({ name: cozyaProductEvents.name, total: count() })
        .from(cozyaProductEvents)
        .where(gte(cozyaProductEvents.occurredAt, since))
        .groupBy(cozyaProductEvents.name),
    ]);
    return {
      ...funnel,
      trials: Number(trials[0]?.total ?? 0),
      events: Object.fromEntries(events.map((row) => [row.name, Number(row.total)])),
    };
  });
}

export type AgendaUsage = Funnel & {
  families: number;
  children: number;
  guests: number;
  events: Record<string, number>;
};

export function agendaUsage(since: Date): Promise<AgendaUsage> {
  return memo(`products:agenda:${since.toISOString().slice(0, 13)}`, TTL, async () => {
    const db = readDb();
    const [funnel, families, children, guests, events] = await Promise.all([
      funnelFor(
        sql`select user_id from (${familyPresence("agenda-da-turma")}) presence
            union select ${agendaProductEvents.userId} from ${agendaProductEvents}
              where ${agendaProductEvents.event} = 'signup' and ${agendaProductEvents.userId} is not null`,
        sql`select distinct ${agendaProductEvents.userId} as user_id from ${agendaProductEvents}
            where ${agendaProductEvents.createdAt} >= ${iso(since)} and ${agendaProductEvents.userId} is not null`,
      ),
      db.execute<{ total: number }>(
        sql`select count(distinct group_id)::int as total from (${agendaParticipants()}) participants`,
      ),
      db.select({ total: count() }).from(agendaStudentProfiles),
      db.execute<{ total: number }>(
        sql`select count(*)::int as total from (${agendaParticipants()}) participants where role = 'member'`,
      ),
      db
        .select({ name: agendaProductEvents.event, total: count() })
        .from(agendaProductEvents)
        .where(gte(agendaProductEvents.createdAt, since))
        .groupBy(agendaProductEvents.event),
    ]);
    return {
      ...funnel,
      families: families[0]?.total ?? 0,
      children: Number(children[0]?.total ?? 0),
      guests: Number(guests[0]?.total ?? 0),
      events: Object.fromEntries(events.map((row) => [row.name, Number(row.total)])),
    };
  });
}

export type MissaoUsage = Funnel & {
  profiles: number;
  studyDevices: number;
  sessions: Record<string, number>;
  openReports: number;
};

export function missaoUsage(since: Date, now: Date): Promise<MissaoUsage> {
  return memo(`products:missao:${since.toISOString().slice(0, 13)}`, TTL, async () => {
    const db = readDb();
    const [funnel, profiles, devices, sessions, reports] = await Promise.all([
      funnelFor(
        sql`select ${missaoFamilies.userId} as user_id from ${missaoFamilies}`,
        sql`select distinct ${missaoProfiles.userId} as user_id
            from ${missaoSessions} join ${missaoProfiles} on ${missaoProfiles.id} = ${missaoSessions.profileId}
            where ${missaoSessions.createdAt} >= ${iso(since)}`,
      ),
      db.select({ total: count() }).from(missaoProfiles),
      db
        .select({ total: count() })
        .from(missaoStudyDevices)
        .where(
          and(
            isNotNull(missaoStudyDevices.connectedAt),
            isNull(missaoStudyDevices.revokedAt),
            gt(missaoStudyDevices.expiresAt, now),
          ),
        ),
      db
        .select({ mode: missaoSessions.mode, total: count() })
        .from(missaoSessions)
        .where(gte(missaoSessions.completedAt, since))
        .groupBy(missaoSessions.mode),
      db
        .select({ total: count() })
        .from(missaoReports)
        .where(inArray(missaoReports.status, ["open", "investigating"])),
    ]);
    return {
      ...funnel,
      profiles: Number(profiles[0]?.total ?? 0),
      studyDevices: Number(devices[0]?.total ?? 0),
      sessions: Object.fromEntries(sessions.map((row) => [row.mode, Number(row.total)])),
      openReports: Number(reports[0]?.total ?? 0),
    };
  });
}

export type BoraUsage = Funnel & {
  profiles: number;
  /** Treinos da semana por modo de contagem (`camera`, `manual`, `pareado`). */
  sessions: Record<string, number>;
  customWorkouts: number;
};

export function boraUsage(since: Date): Promise<BoraUsage> {
  return memo(`products:bora:${since.toISOString().slice(0, 13)}`, TTL, async () => {
    const db = readDb();
    const [funnel, profiles, sessions, workouts] = await Promise.all([
      funnelFor(
        sql`select ${boraFamilies.userId} as user_id from ${boraFamilies}`,
        sql`select distinct ${boraSessions.userId} as user_id from ${boraSessions}
            where ${boraSessions.createdAt} >= ${iso(since)}`,
      ),
      db.select({ total: count() }).from(boraProfiles),
      db
        .select({ mode: boraSessions.mode, total: count() })
        .from(boraSessions)
        .where(gte(boraSessions.createdAt, since))
        .groupBy(boraSessions.mode),
      db.select({ total: count() }).from(boraCustomWorkouts),
    ]);
    return {
      ...funnel,
      profiles: Number(profiles[0]?.total ?? 0),
      sessions: Object.fromEntries(sessions.map((row) => [row.mode, Number(row.total)])),
      customWorkouts: Number(workouts[0]?.total ?? 0),
    };
  });
}

export type EstrelaUsage = Funnel & {
  children: number;
  /** Aparelhos das crianças conectados agora (sem desconexão e dentro da validade). */
  devices: number;
  /** Famílias com um segundo responsável. */
  guardians: number;
  /** Tarefas feitas na semana por quem marcou (`child` no aparelho, `adult` pelos pais). */
  completions: Record<string, number>;
};

export function estrelaUsage(since: Date, now: Date): Promise<EstrelaUsage> {
  return memo(`products:estrela:${since.toISOString().slice(0, 13)}`, TTL, async () => {
    const db = readDb();
    const [funnel, children, devices, guardians, completions] = await Promise.all([
      funnelFor(
        familyPresence("dia-de-estrela"),
        sql`select distinct ${events.actorId} as user_id from ${events}
            where ${events.payload}->>'appName' = 'Dia de Estrela' and ${events.eventType} = 'session.created'
              and ${events.createdAt} >= ${iso(since)}`,
      ),
      db.select({ total: count() }).from(estrelaChildren),
      db
        .select({ total: count() })
        .from(estrelaDevices)
        .where(
          and(
            isNotNull(estrelaDevices.connectedAt),
            isNull(estrelaDevices.revokedAt),
            estrelaDeviceAuthority(),
            gt(estrelaDevices.expiresAt, now),
          ),
        ),
      db
        .select({ total: count() })
        .from(estrelaFamilies)
        .where(sql`(
        select count(*) from ${familyMembers} where ${familyMembers.groupId} = ${estrelaFamilies.familyGroupId}
          and ${familyMembers.revokedAt} is null) > 1`),
      db
        .select({ markedBy: estrelaCompletions.markedBy, total: count() })
        .from(estrelaCompletions)
        .where(gte(estrelaCompletions.completedAt, since))
        .groupBy(estrelaCompletions.markedBy),
    ]);
    return {
      ...funnel,
      children: Number(children[0]?.total ?? 0),
      devices: Number(devices[0]?.total ?? 0),
      guardians: Number(guardians[0]?.total ?? 0),
      completions: Object.fromEntries(completions.map((row) => [row.markedBy, Number(row.total)])),
    };
  });
}

export type EdiUsage = Funnel & {
  connectedDevices: number;
  devicesSeen: number;
  paidAccess: number;
  releases: number;
};

export function ediUsage(since: Date, now: Date): Promise<EdiUsage> {
  return memo(`products:edi:${since.toISOString().slice(0, 13)}`, TTL, async () => {
    const db = readDb();
    const [funnel, connected, seen, paid, releases] = await Promise.all([
      funnelFor(
        sql`select ${ediDevices.userId} as user_id from ${ediDevices}
            union select ${ediEntitlements.userId} from ${ediEntitlements}
            union select ${customers.subjectId} from ${customers}
              where ${customers.app} = 'edi' and ${customers.subjectType} = 'user'`,
        sql`select distinct ${ediDevices.userId} as user_id from ${ediDevices}
            where ${ediDevices.lastSeenAt} >= ${iso(since)}`,
      ),
      db
        .select({ total: sql<number>`count(distinct ${ediActivations.deviceId})`.mapWith(Number) })
        .from(ediActivations)
        .where(isNull(ediActivations.revokedAt)),
      db.select({ total: count() }).from(ediDevices).where(gte(ediDevices.lastSeenAt, since)),
      db
        .select({ total: count() })
        .from(ediEntitlements)
        .where(and(eq(ediEntitlements.suspended, false), gt(ediEntitlements.paidThrough, now))),
      db.select({ total: count() }).from(ediReleases).where(isNull(ediReleases.withdrawnAt)),
    ]);
    return {
      ...funnel,
      connectedDevices: connected[0]?.total ?? 0,
      devicesSeen: Number(seen[0]?.total ?? 0),
      paidAccess: Number(paid[0]?.total ?? 0),
      releases: Number(releases[0]?.total ?? 0),
    };
  });
}

export type UsageByProduct = {
  cozya: CozyaUsage;
  "agenda-da-turma": AgendaUsage;
  "missao-saber": MissaoUsage;
  "bora-treinar": BoraUsage;
  "dia-de-estrela": EstrelaUsage;
  edi: EdiUsage;
};

export async function usageFor<K extends ProductKey>(
  product: K,
  since: Date,
  now: Date,
): Promise<UsageByProduct[K]> {
  const usage =
    product === "cozya"
      ? cozyaUsage(since)
      : product === "agenda-da-turma"
        ? agendaUsage(since)
        : product === "missao-saber"
          ? missaoUsage(since, now)
          : product === "bora-treinar"
            ? boraUsage(since)
            : product === "dia-de-estrela"
              ? estrelaUsage(since, now)
              : ediUsage(since, now);
  return usage as Promise<UsageByProduct[K]>;
}
