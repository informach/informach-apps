import { sql } from "drizzle-orm";
import { check, foreignKey, index, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./core";
import { recreioGroups as groups, recreioProfiles as profiles, recreio } from "./recreio";

const moment = (name: string) => timestamp(name, { withTimezone: true });

/** Convite comercial por destinatário. O endereço só existe enquanto pendente. */
export const recreioGroupInvites = recreio.table(
  "group_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id").notNull(),
    inviterUserId: text("inviter_user_id").notNull(),
    inviterDeclarationVersion: text("inviter_declaration_version").notNull(),
    recipientEmail: text("recipient_email"),
    /** Conta já existente na emissão; trocar o endereço não muda o destinatário. */
    recipientUserId: text("recipient_user_id").references(() => users.id, { onDelete: "cascade" }),
    state: text("state")
      .$type<"pending" | "accepted" | "revoked" | "expired">()
      .notNull()
      .default("pending"),
    createdAt: moment("created_at").notNull().defaultNow(),
    expiresAt: moment("expires_at").notNull(),
    finishedAt: moment("finished_at"),
    acceptedProfileId: uuid("accepted_profile_id"),
    acceptedUserId: text("accepted_user_id"),
    recipientDeclarationVersion: text("recipient_declaration_version"),
    requestHash: text("request_hash"),
  },
  (t) => [
    foreignKey({
      name: "recreio_group_invite_owner",
      columns: [t.groupId, t.inviterUserId],
      foreignColumns: [groups.id, groups.ownerUserId],
    }).onDelete("cascade"),
    // Excluir o perfil retira o par inteiro atomicamente, sem apagar o recibo.
    foreignKey({
      name: "recreio_group_invite_recipient",
      columns: [t.acceptedProfileId, t.acceptedUserId],
      foreignColumns: [profiles.id, profiles.userId],
    }).onDelete("set null"),
    uniqueIndex("recreio_group_invite_pending_recipient")
      .on(t.groupId, t.recipientEmail)
      .where(sql`${t.state}='pending'`),
    index("recreio_group_invite_incoming")
      .on(t.recipientEmail, t.expiresAt)
      .where(sql`${t.state}='pending'`),
    index("recreio_group_invite_expiry").on(t.expiresAt).where(sql`${t.state}='pending'`),
    index("recreio_group_invite_retention").on(t.finishedAt).where(sql`${t.state}<>'pending'`),
    check(
      "recreio_group_invite_state",
      sql`${t.state} in ('pending','accepted','revoked','expired')`,
    ),
    check(
      "recreio_group_invite_binding",
      sql`${t.state}='pending' or ${t.recipientUserId} is null`,
    ),
    check(
      "recreio_group_invite_expiry",
      sql`${t.expiresAt}>${t.createdAt} and ${t.expiresAt}<=${t.createdAt}+interval '72 hours'`,
    ),
    check(
      "recreio_group_invite_email",
      sql`${t.recipientEmail} is null or
    (char_length(${t.recipientEmail}) between 3 and 254 and ${t.recipientEmail}=lower(btrim(${t.recipientEmail})))`,
    ),
    check(
      "recreio_group_invite_declarations",
      sql`${t.inviterDeclarationVersion} ~ '^adulto-[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    and (${t.recipientDeclarationVersion} is null or ${t.recipientDeclarationVersion} ~ '^adulto-[0-9]{4}-[0-9]{2}-[0-9]{2}$')`,
    ),
    check(
      "recreio_group_invite_lifecycle",
      sql`
    (${t.state}='pending' and ${t.recipientEmail} is not null and ${t.finishedAt} is null
      and ${t.acceptedProfileId} is null and ${t.acceptedUserId} is null
      and ${t.recipientDeclarationVersion} is null and ${t.requestHash} is null)
    or (${t.state}='accepted' and ${t.recipientEmail} is null and ${t.finishedAt} is not null
      and ${t.finishedAt}>=${t.createdAt} and ${t.finishedAt}<${t.expiresAt}
      and ${t.recipientDeclarationVersion} is not null
      and ${t.requestHash} is not null and ${t.requestHash} ~ '^[a-f0-9]{64}$'
      and ((${t.acceptedProfileId} is null and ${t.acceptedUserId} is null)
        or (${t.acceptedProfileId} is not null and ${t.acceptedUserId} is not null)))
    or (${t.state} in ('revoked','expired') and ${t.recipientEmail} is null and ${t.finishedAt} is not null
      and ${t.finishedAt}>=${t.createdAt} and (${t.state}<>'expired' or ${t.finishedAt}>=${t.expiresAt})
      and ${t.acceptedProfileId} is null and ${t.acceptedUserId} is null
      and ${t.recipientDeclarationVersion} is null and ${t.requestHash} is null)`,
    ),
  ],
);
