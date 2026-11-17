import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./core";
import { recreio, recreioProfiles } from "./recreio";

const moment = (name: string) => timestamp(name, { withTimezone: true });

/** Fila restrita: categorias e referências opacas, sem nomes, texto livre ou conteúdo de mundo. */
export const recreioSafetyReports = recreio.table(
  "safety_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reporterProfileId: uuid("reporter_profile_id").references(() => recreioProfiles.id, {
      onDelete: "set null",
    }),
    targetProfileId: uuid("target_profile_id").references(() => recreioProfiles.id, {
      onDelete: "set null",
    }),
    actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorKind: text("actor_kind").$type<"jogador" | "responsavel">().notNull(),
    clientKey: uuid("client_key").notNull(),
    requestHash: text("request_hash").notNull(),
    category: text("category")
      .$type<
        | "contato_indesejado"
        | "assedio"
        | "conteudo_inadequado"
        | "dados_pessoais"
        | "ameaca"
        | "outro"
      >()
      .notNull(),
    priority: boolean("priority").notNull(),
    /** Evidência produzida pelo servidor: relacionamento existente no instante da denúncia. */
    evidenceKind: text("evidence_kind").$type<"pedido" | "amizade" | "protecao">().notNull(),
    evidenceId: uuid("evidence_id"),
    evidenceRevision: integer("evidence_revision"),
    state: text("state")
      .$type<"aberta" | "em_analise" | "resolvida" | "recurso" | "encerrada">()
      .notNull()
      .default("aberta"),
    revision: integer("revision").notNull().default(1),
    createdAt: moment("created_at").notNull().defaultNow(),
    updatedAt: moment("updated_at").notNull().defaultNow(),
    closedAt: moment("closed_at"),
    expiresAt: moment("expires_at").notNull(),
  },
  (t) => [
    uniqueIndex("recreio_safety_report_retry").on(t.reporterProfileId, t.clientKey),
    index("recreio_safety_report_queue").on(t.state, t.priority, t.createdAt, t.id),
    index("recreio_safety_report_retention").on(t.expiresAt, t.id),
    index("recreio_safety_report_target").on(t.targetProfileId, t.createdAt),
    check("recreio_safety_report_actor", sql`${t.actorKind} in ('jogador','responsavel')`),
    check(
      "recreio_safety_report_category",
      sql`${t.category} in ('contato_indesejado','assedio','conteudo_inadequado','dados_pessoais','ameaca','outro')`,
    ),
    check(
      "recreio_safety_report_state",
      sql`${t.state} in ('aberta','em_analise','resolvida','recurso','encerrada')`,
    ),
    check(
      "recreio_safety_report_evidence",
      sql`(${t.evidenceKind}='pedido' and ${t.evidenceId} is not null and ${t.evidenceRevision} is null) or (${t.evidenceKind}='amizade' and ${t.evidenceRevision} is not null and ${t.evidenceRevision}>0 and ${t.evidenceId} is null) or (${t.evidenceKind}='protecao' and ${t.evidenceId} is null and ${t.evidenceRevision} is null)`,
    ),
    check(
      "recreio_safety_report_distinct",
      sql`${t.reporterProfileId} is null or ${t.targetProfileId} is null or ${t.reporterProfileId}<>${t.targetProfileId}`,
    ),
    check("recreio_safety_report_digest", sql`${t.requestHash} ~ '^[a-f0-9]{64}$'`),
    check("recreio_safety_report_revision", sql`${t.revision}>0`),
    check(
      "recreio_safety_report_dates",
      sql`${t.updatedAt}>=${t.createdAt} and ${t.expiresAt}>${t.createdAt} and ${t.expiresAt}<=${t.createdAt}+interval '180 days' and (${t.closedAt} is null or (${t.closedAt}>=${t.createdAt} and ${t.expiresAt}<=${t.closedAt}+interval '90 days'))`,
    ),
    check(
      "recreio_safety_report_closed",
      sql`(${t.state}='encerrada')=(${t.closedAt} is not null)`,
    ),
  ],
);
