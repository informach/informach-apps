import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { recreio, recreioGameSessions } from "./recreio";
import { recreioMinorProfiles } from "./recreio-familia";

const time = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();
const moment = (name: string) => timestamp(name, { withTimezone: true });
type JanelaPersistida = { diaDaSemana: number; inicioMinuto: number; fimMinuto: number };
type ClassificacaoProtegida = "L" | "6" | "10" | "12" | "14" | "16";

/** Configuração do responsável e última política efetiva são fatos separados. */
export const recreioMinorPolicies = recreio.table(
  "minor_policies",
  {
    profileId: uuid("profile_id")
      .primaryKey()
      .references(() => recreioMinorProfiles.profileId, { onDelete: "cascade" }),
    contentLimit: text("content_limit").$type<ClassificacaoProtegida>(),
    multiplayerEnabled: boolean("multiplayer_enabled").notNull().default(true),
    freeTextEnabled: boolean("free_text_enabled").notNull().default(false),
    contactsEnabled: boolean("contacts_enabled").notNull().default(true),
    presenceMode: text("presence_mode")
      .$type<"invisible" | "friends">()
      .notNull()
      .default("friends"),
    paused: boolean("paused").notNull().default(false),
    dailyMinutes: integer("daily_minutes"),
    weeklySchedule: jsonb("weekly_schedule").$type<JanelaPersistida[]>(),
    effectiveSocial: text("effective_social").$type<"ate_12" | "13_17">(),
    effectiveRating: text("effective_rating").$type<ClassificacaoProtegida>(),
    effectiveProfileVersion: integer("effective_profile_version").notNull().default(0),
    acknowledgedVersion: integer("acknowledged_version").notNull().default(0),
    computedAt: moment("computed_at"),
    updatedAt: time("updated_at"),
  },
  (t) => [
    check(
      "recreio_minor_content_limit",
      sql`${t.contentLimit} is null or ${t.contentLimit} in ('L','6','10','12','14','16')`,
    ),
    check("recreio_minor_presence", sql`${t.presenceMode} in ('invisible','friends')`),
    check(
      "recreio_minor_daily_minutes",
      sql`${t.dailyMinutes} is null or ${t.dailyMinutes} between 1 and 1440`,
    ),
    check(
      "recreio_minor_schedule",
      sql`case when ${t.weeklySchedule} is null then true when jsonb_typeof(${t.weeklySchedule})='array' then jsonb_array_length(${t.weeklySchedule}) <= 14 else false end`,
    ),
    check(
      "recreio_minor_policy_version",
      sql`${t.effectiveProfileVersion} between 0 and 2147483646 and ${t.acknowledgedVersion} between 0 and ${t.effectiveProfileVersion}`,
    ),
    check(
      "recreio_minor_policy_computation",
      sql`(${t.effectiveProfileVersion}=0 and ${t.effectiveSocial} is null and ${t.effectiveRating} is null and ${t.computedAt} is null) or (${t.effectiveProfileVersion}>0 and ${t.effectiveSocial} is not null and ${t.effectiveSocial} in ('ate_12','13_17') and ${t.effectiveRating} is not null and ${t.effectiveRating} in ('L','6','10','12','14','16') and ${t.computedAt} is not null)`,
    ),
  ],
);

/** Agregado por dia de Brasília e perfil; nunca um contador fornecido pelo cliente. */
export const recreioMinorDailyUsage = recreio.table(
  "minor_daily_usage",
  {
    profileId: uuid("profile_id")
      .notNull()
      .references(() => recreioMinorProfiles.profileId, { onDelete: "cascade" }),
    localDay: date("local_day", { mode: "string" }).notNull(),
    usedMilliseconds: integer("used_milliseconds").notNull().default(0),
    accountedUntil: time("accounted_until"),
    leaseUntil: moment("lease_until"),
    sessionId: uuid("session_id"),
    updatedAt: time("updated_at"),
  },
  (t) => [
    primaryKey({ columns: [t.profileId, t.localDay] }),
    foreignKey({
      name: "recreio_minor_usage_session_profile",
      columns: [t.sessionId, t.profileId],
      foreignColumns: [recreioGameSessions.id, recreioGameSessions.profileId],
    }),
    index("recreio_minor_usage_retention").on(t.localDay, t.profileId),
    // Limite técnico de saneamento; não presumir que todo dia local tem exatamente 24 h.
    check("recreio_minor_usage_bounds", sql`${t.usedMilliseconds} between 0 and 172800000`),
    check(
      "recreio_minor_usage_interval",
      sql`${t.leaseUntil} is null or ${t.leaseUntil} >= ${t.accountedUntil}`,
    ),
  ],
);
