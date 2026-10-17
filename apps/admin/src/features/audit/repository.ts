import "server-only";
import { and, desc, eq, gte, inArray, sql } from "@informach/db";
import { customers, events, users } from "@informach/db/schema";
import { readDb } from "@/lib/read-db";
import { isStaffRole } from "@/lib/roles";
import {
  type AuditGroupKey,
  BILLING_CUSTOMER_PAYLOAD_KEY,
  GROUP_MATCH,
  PERSON_PAYLOAD_KEYS,
} from "./filters";
import type { AuditEventInput, Person } from "./humanize";

/**
 * Leituras da Auditoria. O payload é lido para montar a frase e listar os
 * nomes dos campos; os valores que ele traz (e-mail de `user.created`, por
 * exemplo) nunca saem daqui sem passar por `describeEvent`.
 */

type SQL = ReturnType<typeof sql>;

function groupCondition(group: Exclude<AuditGroupKey, "tudo">): SQL {
  const match = GROUP_MATCH[group];
  const parts: SQL[] = match.prefixes.map(
    (prefix) => sql`${events.eventType} like ${`${prefix}%`}`,
  );
  for (const exact of match.exact ?? []) parts.push(sql`${events.eventType} = ${exact}`);
  let condition = sql.join(parts, sql` or `);
  condition = sql`(${condition})`;
  for (const excluded of match.exclude ?? [])
    condition = sql`${condition} and ${events.eventType} <> ${excluded}`;
  return sql`(${condition})`;
}

/**
 * Eventos em que a pessoa agiu ou que são sobre ela: pelos campos de
 * `PERSON_PAYLOAD_KEYS` e, nos avisos de assinatura do Stripe, pelos clientes
 * de cobrança dela em qualquer produto. Serve à Auditoria e à linha do tempo
 * da ficha, para as duas contarem a mesma história.
 */
export function eventsAboutPerson(personId: string): SQL {
  // Os nomes dos campos são constantes do código, nunca texto digitado.
  const byKey = PERSON_PAYLOAD_KEYS.map(
    (key) => sql`${events.payload}->>${sql.raw(`'${key}'`)} = ${personId}`,
  );
  const customerIds = sql`select ${customers.id}::text from ${customers}
    where ${customers.subjectType} = 'user' and ${customers.subjectId} = ${personId}`;
  const byCustomer = sql`${events.payload}->>${sql.raw(`'${BILLING_CUSTOMER_PAYLOAD_KEY}'`)} in (${customerIds})`;
  return sql`(${sql.join([eq(events.actorId, personId), ...byKey, byCustomer], sql` or `)})`;
}

export type AuditQuery = {
  group: AuditGroupKey;
  since: Date | null;
  personId: string | null;
  limit: number;
  offset: number;
};

export async function listAuditEvents(query: AuditQuery): Promise<AuditEventInput[]> {
  const conditions: SQL[] = [];
  if (query.group !== "tudo") conditions.push(groupCondition(query.group));
  if (query.since) conditions.push(gte(events.createdAt, query.since));
  if (query.personId) conditions.push(eventsAboutPerson(query.personId));
  const rows = await readDb()
    .select({
      id: events.id,
      eventType: events.eventType,
      actorId: events.actorId,
      payload: events.payload,
      createdAt: events.createdAt,
    })
    .from(events)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(events.createdAt), desc(events.id))
    .limit(query.limit)
    .offset(query.offset);
  return rows.map((row) => ({ ...row, payload: (row.payload ?? {}) as Record<string, unknown> }));
}

/** Nome e se é da equipe, para quem aparece nos eventos. E-mail não é lido. */
export async function peopleByIds(ids: readonly string[]): Promise<Map<string, Person>> {
  if (ids.length === 0) return new Map();
  const rows = await readDb()
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(inArray(users.id, [...ids]));
  return new Map(
    rows.map((row) => [row.id, { id: row.id, name: row.name, staff: isStaffRole(row.role) }]),
  );
}

/** A conta de um e-mail exato ou de um ID, para o filtro por pessoa. */
export async function findPerson(query: string): Promise<Person | null> {
  const value = query.trim();
  if (!value) return null;
  const condition = value.includes("@")
    ? eq(users.email, value.toLowerCase())
    : eq(users.id, value);
  const [row] = await readDb()
    .select({ id: users.id, name: users.name, role: users.role })
    .from(users)
    .where(condition)
    .limit(1);
  return row ? { id: row.id, name: row.name, staff: isStaffRole(row.role) } : null;
}
