import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./core";
import { recreioProfiles as profiles, recreio, recreioSpaces as spaces } from "./recreio";

/** Índice de privacidade, não presença nem permissão. A admissão pode deixar
 * autoria no estado mesmo para visitante sem associação de membro. Não expira
 * junto com SID/convite; só a retirada coordenada do perfil o elimina. */
export const recreioProfileWorldTraces = recreio.table(
  "profile_world_traces",
  {
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "restrict" }),
    firstRecordedAt: timestamp("first_recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "recreio_profile_world_trace", columns: [t.profileId, t.spaceId] }),
    index("recreio_world_profile_trace").on(t.spaceId, t.profileId),
  ],
);

/** Prévia imutável, anterior ao consentimento. Não é ordem de exclusão,
 * capacidade de publicação externa ou autorização de restauração. IDs de perfis
 * no plano são referências históricas: não criar cascata que apague a prova. */
export const recreioRightsPreparations = recreio.table(
  "rights_preparations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requesterUserId: text("requester_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    kind: text("kind").$type<"retirar_perfil" | "encerrar_conta">().notNull(),
    version: integer("version").notNull().default(1),
    plan: jsonb("plan").$type<unknown>().notNull(),
    planSha256: text("plan_sha256").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  },
  (t) => [
    unique("recreio_rights_preparation_identity").on(t.id, t.requesterUserId, t.planSha256),
    index("recreio_rights_preparation_account").on(t.requesterUserId, t.createdAt, t.id),
    check("recreio_rights_preparation_kind", sql`${t.kind} in ('retirar_perfil','encerrar_conta')`),
    check("recreio_rights_preparation_version", sql`${t.version}=1`),
    check("recreio_rights_preparation_sha", sql`${t.planSha256} ~ '^[0-9a-f]{64}$'`),
    check(
      "recreio_rights_preparation_plan",
      sql`jsonb_typeof(${t.plan})='object' and pg_column_size(${t.plan}) between 2 and 262144`,
    ),
    check(
      "recreio_rights_preparation_time",
      sql`${t.expiresAt}>${t.createdAt} and ${t.expiresAt}<=${t.createdAt}+interval '30 minutes' and (${t.cancelledAt} is null or ${t.cancelledAt}>=${t.createdAt})`,
    ),
  ],
);
