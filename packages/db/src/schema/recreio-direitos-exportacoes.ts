import { sql } from "drizzle-orm";
import {
  check,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sessions, users } from "./core";
import { recreioDeviceSessions as devices, recreioProfiles as profiles } from "./recreio";
import { recreio } from "./recreio-namespace";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });
const instante = (name: string) => timestamp(name, { withTimezone: true });

/** Artefato temporário cifrado: dez minutos, uma cópia por conta. Não é um
 * link público/capacidade portadora nem backup. A entrega revalida identidade,
 * sessão, contexto, política e responsabilidade atuais. Nenhuma chave aqui. */
export const recreioPersonalExports = recreio.table(
  "personal_exports",
  {
    id: uuid("id").primaryKey(),
    requesterUserId: text("requester_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    deviceSessionId: uuid("device_session_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    authSessionId: text("auth_session_id").notNull(),
    profileKind: text("profile_kind").$type<"adult" | "minor">().notNull(),
    policyVersion: integer("policy_version").notNull(),
    guardianReference: uuid("guardian_reference"),
    state: text("state").$type<"ready" | "revoked" | "expired">().notNull(),
    reference: jsonb("reference").$type<unknown>(),
    encryptedBytes: bytea("encrypted_bytes"),
    capturedAt: instante("captured_at").notNull(),
    expiresAt: instante("expires_at").notNull(),
    clearedAt: instante("cleared_at"),
    createdAt: instante("created_at").notNull(),
  },
  (t) => [
    foreignKey({
      name: "recreio_personal_export_native_session",
      columns: [t.authSessionId, t.requesterUserId],
      foreignColumns: [sessions.id, sessions.userId],
    }).onDelete("cascade"),
    uniqueIndex("recreio_personal_export_one_ready")
      .on(t.requesterUserId)
      .where(sql`${t.state}='ready'`),
    index("recreio_personal_export_expiry").on(t.expiresAt, t.id).where(sql`${t.state}='ready'`),
    index("recreio_personal_export_cleared").on(t.clearedAt, t.id).where(sql`${t.state}<>'ready'`),
    check("recreio_personal_export_state", sql`${t.state} in ('ready','revoked','expired')`),
    check(
      "recreio_personal_export_profile",
      sql`${t.policyVersion}>0 and ((${t.profileKind}='adult' and ${t.guardianReference} is null) or (${t.profileKind}='minor' and ${t.guardianReference} is not null))`,
    ),
    check(
      "recreio_personal_export_window",
      sql`${t.expiresAt}=${t.capturedAt}+interval '10 minutes' and ${t.createdAt}>=${t.capturedAt} and ${t.createdAt}<${t.expiresAt}`,
    ),
    check(
      "recreio_personal_export_payload",
      sql`(
    (${t.state}='ready' and ${t.clearedAt} is null and ${t.encryptedBytes} is not null and ${t.reference} is not null
      and octet_length(${t.encryptedBytes}) between 40 and 33555456
      and jsonb_typeof(${t.reference})='object' and pg_column_size(${t.reference})<=2048
      and ${t.reference}->>'formato'='recreio-objeto-cifrado-v1'
      and ${t.reference}->'contexto'->>'tipo'='exportacao' and ${t.reference}->'contexto'->>'id'=${t.id}::text)
    or (${t.state}<>'ready' and ${t.encryptedBytes} is null and ${t.reference} is null and ${t.clearedAt} is not null and ${t.clearedAt}>=${t.createdAt}
      and (${t.state}<>'expired' or ${t.clearedAt}>=${t.expiresAt}))) is true`,
    ),
  ],
);
