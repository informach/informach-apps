import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./core";
import { recreio, recreioProfiles } from "./recreio";

const time = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();
const moment = (name: string) => timestamp(name, { withTimezone: true });

/** A intenção nasce no servidor. Desconhecida/vencida não autoriza criar outro perfil. */
export const recreioProfileCreationRequests = recreio.table(
  "profile_creation_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id").references(() => recreioMinorProfiles.profileId, {
      onDelete: "set null",
    }),
    fingerprint: text("fingerprint"),
    expiresAt: moment("expires_at").notNull(),
    consumedAt: moment("consumed_at"),
    createdAt: time("created_at"),
  },
  (t) => [
    index("recreio_profile_creation_user").on(t.userId, t.createdAt),
    index("recreio_profile_creation_pending_expiry")
      .on(t.expiresAt)
      .where(sql`${t.consumedAt} is null`),
    index("recreio_profile_creation_consumed_retention")
      .on(t.consumedAt)
      .where(sql`${t.consumedAt} is not null`),
    check(
      "recreio_profile_creation_receipt",
      sql`(${t.consumedAt} is null and ${t.profileId} is null and ${t.fingerprint} is null) or (${t.consumedAt} is not null and ${t.fingerprint} is not null and ${t.fingerprint} ~ '^[a-f0-9]{64}$')`,
    ),
    check("recreio_profile_creation_expiry", sql`${t.expiresAt} > ${t.createdAt}`),
  ],
);

/** Aceite declarado; nunca representa verificação externa de identidade ou idade. */
export const recreioAdultDeclarations = recreio.table(
  "adult_declarations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    version: text("version").notNull(),
    createdAt: time("created_at"),
  },
  (t) => [
    unique("recreio_declaration_version").on(t.userId, t.version),
    unique("recreio_declaration_identity").on(t.id, t.userId),
    check(
      "recreio_declaration_version_format",
      sql`${t.version} ~ '^responsabilidade-[0-9]{4}-[0-9]{2}-[0-9]{2}$'`,
    ),
  ],
);

/** Mês/ano ficam no portal; jogos recebem somente a política efetiva. */
export const recreioMinorProfiles = recreio.table(
  "minor_profiles",
  {
    profileId: uuid("profile_id").primaryKey(),
    kind: text("kind").$type<"minor">().notNull().default("minor"),
    birthMonth: integer("birth_month").notNull(),
    birthYear: integer("birth_year").notNull(),
    createdAt: time("created_at"),
  },
  (t) => [
    foreignKey({
      name: "recreio_minor_profile_kind",
      columns: [t.profileId, t.kind],
      foreignColumns: [recreioProfiles.id, recreioProfiles.kind],
    }).onDelete("cascade"),
    check("recreio_minor_kind", sql`${t.kind} = 'minor'`),
    check("recreio_minor_birth_month", sql`${t.birthMonth} between 1 and 12`),
    check("recreio_minor_birth_year", sql`${t.birthYear} between 1900 and 9999`),
  ],
);

/** A conta responsável deve resolver o vínculo antes de encerrar a identidade. */
export const recreioGuardianLinks = recreio.table(
  "guardian_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => recreioMinorProfiles.profileId, { onDelete: "cascade" }),
    guardianUserId: text("guardian_user_id").notNull(),
    declarationId: uuid("declaration_id").notNull(),
    createdAt: time("created_at"),
  },
  (t) => [
    unique("recreio_guardian_profile").on(t.profileId),
    index("recreio_guardian_user").on(t.guardianUserId),
    foreignKey({
      name: "recreio_guardian_declaration",
      columns: [t.declarationId, t.guardianUserId],
      foreignColumns: [recreioAdultDeclarations.id, recreioAdultDeclarations.userId],
    }).onDelete("restrict"),
  ],
);
