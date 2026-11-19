import { sql } from "drizzle-orm";
import { check, foreignKey, integer, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "./core";
import { recreioRightsOperations as operations } from "./recreio-direitos-operacoes";
import { recreio } from "./recreio-namespace";

/** Participação somente no Recreio. Ausência é o legado ativo, revisão zero.
 * Encerramento não apaga a identidade comum nem os fatos financeiros. Não há
 * transição de reabertura: uma retomada exige protocolo próprio no futuro. */
export const recreioAccountParticipations = recreio.table(
  "account_participations",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "restrict" }),
    state: text("state").$type<"active" | "closing" | "closed">().notNull(),
    revision: integer("revision").notNull(),
    operationId: uuid("operation_id"),
    operationKind: text("operation_kind")
      .$type<"encerrar_conta">()
      .notNull()
      .default("encerrar_conta"),
    closingAt: timestamp("closing_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    foreignKey({
      name: "recreio_account_participation_closure",
      columns: [t.operationId, t.userId, t.operationKind],
      foreignColumns: [operations.id, operations.requesterUserId, operations.kind],
    }).onDelete("restrict"),
    unique("recreio_account_participation_operation").on(t.operationId),
    check("recreio_account_participation_kind", sql`${t.operationKind}='encerrar_conta'`),
    check(
      "recreio_account_participation_finite",
      sql`isfinite(${t.updatedAt}) and (${t.closingAt} is null or isfinite(${t.closingAt})) and (${t.closedAt} is null or isfinite(${t.closedAt}))`,
    ),
    check(
      "recreio_account_participation_state",
      sql`((
        ${t.state}='active' and ${t.revision}=1 and ${t.operationId} is null and
        ${t.closingAt} is null and ${t.closedAt} is null
      ) or (
        ${t.state}='closing' and ${t.revision}=2 and ${t.operationId} is not null and
        ${t.closingAt} is not null and ${t.closedAt} is null and ${t.updatedAt}>=${t.closingAt}
      ) or (
        ${t.state}='closed' and ${t.revision}=3 and ${t.operationId} is not null and
        ${t.closingAt} is not null and ${t.closedAt}>=${t.closingAt} and ${t.updatedAt}>=${t.closedAt}
      )) is true`,
    ),
  ],
);
