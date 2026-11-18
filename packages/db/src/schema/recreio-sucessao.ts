import { sql } from "drizzle-orm";
import { check, foreignKey, integer, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./core";
import { recreio, recreioSpaceStewardshipRequests as requests } from "./recreio";
import { recreioGuardianLinks as guardians } from "./recreio-familia";

/** Prova do adulto proponente; não transfere o mundo nem substitui o aceite do destinatário. */
export const recreioStewardshipGuardianApprovals = recreio.table(
  "stewardship_guardian_approvals",
  {
    requestId: uuid("request_id")
      .primaryKey()
      .references(() => requests.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id").notNull(),
    guardianLinkId: uuid("guardian_link_id").notNull(),
    approvedByUserId: text("approved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    accessGeneration: uuid("access_generation").notNull(),
    policyVersion: integer("policy_version").notNull(),
    managementRevision: integer("management_revision").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "recreio_stewardship_guardian_profile",
      columns: [t.guardianLinkId, t.profileId],
      foreignColumns: [guardians.id, guardians.profileId],
    }).onDelete("cascade"),
    check(
      "recreio_stewardship_guardian_revisions",
      sql`${t.policyVersion}>0 and ${t.managementRevision}>0`,
    ),
  ],
);
