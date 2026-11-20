import { sql } from "drizzle-orm";
import { check, index, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "./core";
import { recreio, recreioDeviceSessions } from "./recreio";
import { recreioGuardianLinks, recreioMinorProfiles } from "./recreio-familia";

const time = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();
const moment = (name: string) => timestamp(name, { withTimezone: true });
const PIN_FORMAT = "^scrypt-v1[$][A-Za-z0-9_-]{22}[$][A-Za-z0-9_-]{43}$";

/** O PIN da conta não depende de o responsável ocupar um perfil de jogador. */
export const recreioNativePins = recreio.table(
  "native_pins",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    hash: text("hash").notNull(),
    generation: uuid("generation").notNull().defaultRandom(),
    updatedAt: time("updated_at"),
  },
  (t) => [check("recreio_native_pin_hash", sql`${t.hash} ~ ${sql.raw(`'${PIN_FORMAT}'`)}`)],
);

/** A geração de acesso é separada da geração do PIN e da versão da política. */
export const recreioMinorProtection = recreio.table(
  "minor_protection",
  {
    profileId: uuid("profile_id")
      .primaryKey()
      .references(() => recreioMinorProfiles.profileId, { onDelete: "cascade" }),
    guardianLinkId: uuid("guardian_link_id")
      .notNull()
      .references(() => recreioGuardianLinks.id, { onDelete: "cascade" }),
    accessGeneration: uuid("access_generation").notNull().defaultRandom(),
    pinHash: text("pin_hash"),
    pinGeneration: uuid("pin_generation").notNull().defaultRandom(),
    updatedAt: time("updated_at"),
  },
  (t) => [
    check(
      "recreio_minor_pin_hash",
      sql`${t.pinHash} is null or ${t.pinHash} ~ ${sql.raw(`'${PIN_FORMAT}'`)}`,
    ),
  ],
);

/** O código público nunca basta para consultar ou obter a credencial final. */
export const recreioPairingRequests = recreio.table(
  "pairing_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    codeHash: text("code_hash").notNull(),
    pollHash: text("poll_hash").notNull(),
    profileId: uuid("profile_id").references(() => recreioMinorProfiles.profileId, {
      onDelete: "cascade",
    }),
    guardianLinkId: uuid("guardian_link_id").references(() => recreioGuardianLinks.id, {
      onDelete: "cascade",
    }),
    deviceSessionId: uuid("device_session_id").references(() => recreioDeviceSessions.id, {
      onDelete: "cascade",
    }),
    approvedAt: moment("approved_at"),
    claimedAt: moment("claimed_at"),
    expiresAt: moment("expires_at").notNull(),
    createdAt: time("created_at"),
  },
  (t) => [
    unique("recreio_pairing_code_hash").on(t.codeHash),
    unique("recreio_pairing_poll_hash").on(t.pollHash),
    unique("recreio_pairing_device").on(t.deviceSessionId),
    index("recreio_pairing_retention").on(t.expiresAt),
    check(
      "recreio_pairing_hashes",
      sql`${t.codeHash} ~ '^[a-f0-9]{64}$' and ${t.pollHash} ~ '^[a-f0-9]{64}$'`,
    ),
    check("recreio_pairing_expiry", sql`${t.expiresAt} > ${t.createdAt}`),
    check(
      "recreio_pairing_approval",
      sql`(${t.approvedAt} is null and ${t.profileId} is null and ${t.guardianLinkId} is null and ${t.deviceSessionId} is null and ${t.claimedAt} is null) or (${t.approvedAt} is not null and ${t.profileId} is not null and ${t.guardianLinkId} is not null and ${t.deviceSessionId} is not null and ${t.approvedAt} >= ${t.createdAt} and ${t.approvedAt} < ${t.expiresAt} and (${t.claimedAt} is null or ${t.claimedAt} >= ${t.approvedAt}))`,
    ),
  ],
);

/** Não há login nativo nem identidade global na credencial do aparelho infantil. */
export const recreioPairedCredentials = recreio.table(
  "paired_credentials",
  {
    deviceSessionId: uuid("device_session_id")
      .primaryKey()
      .references(() => recreioDeviceSessions.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => recreioMinorProtection.profileId, { onDelete: "cascade" }),
    guardianUserId: text("guardian_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    accessGeneration: uuid("access_generation").notNull(),
    tokenHash: text("token_hash"),
    createdAt: time("created_at"),
  },
  (t) => [
    index("recreio_paired_profile").on(t.profileId, t.createdAt),
    index("recreio_paired_guardian_history").on(t.guardianUserId, t.deviceSessionId),
    unique("recreio_paired_token_hash").on(t.tokenHash),
    check(
      "recreio_paired_token_format",
      sql`${t.tokenHash} is null or ${t.tokenHash} ~ '^[a-f0-9]{64}$'`,
    ),
  ],
);
