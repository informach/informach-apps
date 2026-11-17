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
    decision: text("decision").$type<"sem_elementos" | "medida_aplicada" | "duplicada">(),
    reviewRequestedAt: moment("review_requested_at"),
    reviewClientKey: uuid("review_client_key"),
    reviewRevision: integer("review_revision"),
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
      "recreio_safety_report_decision",
      sql`${t.decision} is null or ${t.decision} in ('sem_elementos','medida_aplicada','duplicada')`,
    ),
    check(
      "recreio_safety_report_review",
      sql`(${t.reviewRequestedAt} is null and ${t.reviewClientKey} is null and ${t.reviewRevision} is null) or (${t.reviewRequestedAt} is not null and ${t.reviewClientKey} is not null and ${t.reviewRevision} is not null and ${t.reviewRevision}>1 and ${t.reviewRevision}<=${t.revision} and ${t.reviewRequestedAt}>=${t.createdAt} and ${t.reviewRequestedAt}<${t.expiresAt})`,
    ),
    check(
      "recreio_safety_report_review_state",
      sql`${t.state}<>'recurso' or ${t.reviewRequestedAt} is not null`,
    ),
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

/** Recibo do comando, separado da prova transitória e sem segredo, sessão ou texto livre. */
export const recreioModerationCommands = recreio.table(
  "moderation_commands",
  {
    id: uuid("id").primaryKey(),
    reportId: uuid("report_id").references(() => recreioSafetyReports.id, { onDelete: "set null" }),
    moderatorUserId: text("moderator_user_id").references(() => users.id, { onDelete: "set null" }),
    requestHash: text("request_hash").notNull(),
    operation: text("operation")
      .$type<
        | "analisar"
        | "concluir"
        | "suspender_perfil"
        | "reativar_perfil"
        | "desfazer_amizade"
        | "invalidar_convite"
      >()
      .notNull(),
    reportRevision: integer("report_revision").notNull(),
    createdAt: moment("created_at").notNull().defaultNow(),
    expiresAt: moment("expires_at").notNull(),
  },
  (t) => [
    index("recreio_moderation_command_retention").on(t.expiresAt, t.id),
    index("recreio_moderation_command_report").on(t.reportId, t.createdAt),
    check(
      "recreio_moderation_command_operation",
      sql`${t.operation} in ('analisar','concluir','suspender_perfil','reativar_perfil','desfazer_amizade','invalidar_convite')`,
    ),
    check("recreio_moderation_command_digest", sql`${t.requestHash} ~ '^[a-f0-9]{64}$'`),
    check("recreio_moderation_command_revision", sql`${t.reportRevision}>1`),
    check(
      "recreio_moderation_command_dates",
      sql`${t.expiresAt}>${t.createdAt} and ${t.expiresAt}<=${t.createdAt}+interval '180 days'`,
    ),
  ],
);
