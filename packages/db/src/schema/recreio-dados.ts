import { sql } from "drizzle-orm";
import {
  check,
  customType,
  foreignKey,
  index,
  integer,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { recreio, recreioProfiles } from "./recreio";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });
const time = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();

/** Pessoal: apagar o perfil apaga estas linhas, sem alcançar mundos compartilhados. */
export const recreioProfileDataKeys = recreio.table(
  "profile_data_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => recreioProfiles.id, { onDelete: "cascade" }),
    gameId: text("game_id").notNull(),
    key: text("key").notNull(),
    revision: integer("revision").notNull().default(0),
    createdAt: time("created_at"),
    updatedAt: time("updated_at"),
  },
  (t) => [
    unique("recreio_data_key_scope").on(t.profileId, t.gameId, t.key),
    unique("recreio_data_key_identity").on(t.id, t.profileId, t.gameId),
    check("recreio_data_key_format", sql`${t.key} ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$'`),
    check("recreio_data_key_revision", sql`${t.revision} between 0 and 2147483646`),
  ],
);

export const recreioProfileDataVersions = recreio.table(
  "profile_data_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dataId: uuid("data_id").notNull(),
    profileId: uuid("profile_id").notNull(),
    gameId: text("game_id").notNull(),
    baseRevision: integer("base_revision").notNull(),
    revision: integer("revision"),
    kind: text("kind").$type<"accepted" | "conflict">().notNull(),
    bytes: bytea("bytes").notNull(),
    digest: text("digest").notNull(),
    createdAt: time("created_at"),
  },
  (t) => [
    foreignKey({
      name: "recreio_data_version_scope",
      columns: [t.dataId, t.profileId, t.gameId],
      foreignColumns: [
        recreioProfileDataKeys.id,
        recreioProfileDataKeys.profileId,
        recreioProfileDataKeys.gameId,
      ],
    }).onDelete("cascade"),
    index("recreio_data_version_history").on(t.dataId, t.createdAt),
    uniqueIndex("recreio_data_version_revision")
      .on(t.dataId, t.revision)
      .where(sql`${t.kind} = 'accepted'`),
    uniqueIndex("recreio_data_conflict_retry")
      .on(t.dataId, t.baseRevision, t.digest)
      .where(sql`${t.kind} = 'conflict'`),
    check(
      "recreio_data_version_state",
      sql`(${t.kind} = 'accepted' and ${t.revision} is not null and ${t.revision} = ${t.baseRevision} + 1) or (${t.kind} = 'conflict' and ${t.revision} is null)`,
    ),
    check(
      "recreio_data_version_revision_bounds",
      sql`${t.baseRevision} between 0 and 2147483646 and (${t.revision} is null or ${t.revision} between 1 and 2147483646)`,
    ),
    check("recreio_data_version_bytes", sql`octet_length(${t.bytes}) <= 65536`),
    check("recreio_data_version_digest", sql`${t.digest} ~ '^[a-f0-9]{64}$'`),
  ],
);

export const recreioProfileAchievements = recreio.table(
  "profile_achievements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => recreioProfiles.id, { onDelete: "cascade" }),
    gameId: text("game_id").notNull(),
    achievementId: text("achievement_id").notNull(),
    keyHash: text("key_hash").notNull(),
    earnedAt: time("earned_at"),
  },
  (t) => [
    unique("recreio_achievement_scope").on(t.profileId, t.gameId, t.achievementId),
    unique("recreio_achievement_retry").on(t.profileId, t.gameId, t.keyHash),
    check("recreio_achievement_id", sql`${t.achievementId} ~ '^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$'`),
    check("recreio_achievement_hash", sql`${t.keyHash} ~ '^[a-f0-9]{64}$'`),
  ],
);
