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

/** Fato mínimo da restrição vigente; o expurgo da denúncia não impede contestação própria. */
export const recreioProfileRestrictions = recreio.table(
  "profile_restrictions",
  {
    profileId: uuid("profile_id")
      .primaryKey()
      .references(() => recreioProfiles.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull().default(1),
    state: text("state").$type<"suspended" | "released">().notNull(),
    reason: text("reason")
      .$type<
        | "risco_confirmado"
        | "medida_preventiva"
        | "recurso_procedente"
        | "correcao_operacional"
        | "legado_sem_recibo"
      >()
      .notNull(),
    sourceReportId: uuid("source_report_id").references(() => recreioSafetyReports.id, {
      onDelete: "set null",
    }),
    moderatorUserId: text("moderator_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: moment("created_at").notNull().defaultNow(),
    updatedAt: moment("updated_at").notNull().defaultNow(),
    releasedAt: moment("released_at"),
  },
  (t) => [
    index("recreio_profile_restriction_retention")
      .on(t.releasedAt, t.profileId)
      .where(sql`${t.state}='released'`),
    check("recreio_profile_restriction_revision", sql`${t.revision}>0`),
    check("recreio_profile_restriction_state", sql`${t.state} in ('suspended','released')`),
    check(
      "recreio_profile_restriction_reason",
      sql`${t.reason} in ('risco_confirmado','medida_preventiva','recurso_procedente','correcao_operacional','legado_sem_recibo')`,
    ),
    check(
      "recreio_profile_restriction_dates",
      sql`${t.updatedAt}>=${t.createdAt} and (${t.releasedAt} is null or (${t.releasedAt}>=${t.createdAt} and ${t.releasedAt}<=${t.updatedAt}))`,
    ),
    check(
      "recreio_profile_restriction_released",
      sql`(${t.state}='released')=(${t.releasedAt} is not null)`,
    ),
  ],
);

/** Recurso próprio: não guarda autor, teor ou protocolo da denúncia de outra pessoa. */
export const recreioRestrictionReviews = recreio.table(
  "restriction_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => recreioProfiles.id, { onDelete: "cascade" }),
    restrictionRevision: integer("restriction_revision").notNull(),
    clientKey: uuid("client_key").notNull(),
    actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorKind: text("actor_kind").$type<"titular" | "responsavel">().notNull(),
    state: text("state").$type<"aberto" | "resolvido">().notNull().default("aberto"),
    revision: integer("revision").notNull().default(1),
    decision: text("decision").$type<"manter" | "reativar">(),
    createdAt: moment("created_at").notNull().defaultNow(),
    resolvedAt: moment("resolved_at"),
    expiresAt: moment("expires_at").notNull(),
  },
  (t) => [
    uniqueIndex("recreio_restriction_review_retry").on(t.profileId, t.clientKey),
    uniqueIndex("recreio_restriction_review_open")
      .on(t.profileId, t.restrictionRevision)
      .where(sql`${t.state}='aberto'`),
    index("recreio_restriction_review_queue").on(t.state, t.createdAt, t.id),
    index("recreio_restriction_review_retention").on(t.expiresAt, t.id),
    check(
      "recreio_restriction_review_revision",
      sql`${t.revision}>0 and ${t.restrictionRevision}>0`,
    ),
    check("recreio_restriction_review_actor", sql`${t.actorKind} in ('titular','responsavel')`),
    check("recreio_restriction_review_state", sql`${t.state} in ('aberto','resolvido')`),
    check(
      "recreio_restriction_review_decision",
      sql`(${t.state}='aberto' and ${t.decision} is null and ${t.resolvedAt} is null) or (${t.state}='resolvido' and ${t.decision} is not null and ${t.decision} in ('manter','reativar') and ${t.resolvedAt} is not null)`,
    ),
    check(
      "recreio_restriction_review_dates",
      sql`${t.expiresAt}>${t.createdAt} and ${t.expiresAt}<=${t.createdAt}+interval '180 days' and (${t.resolvedAt} is null or (${t.resolvedAt}>=${t.createdAt} and ${t.resolvedAt}<${t.expiresAt}))`,
    ),
  ],
);

/** Recibo do comando, separado da prova transitória e sem segredo, sessão ou texto livre. */
export const recreioModerationCommands = recreio.table(
  "moderation_commands",
  {
    id: uuid("id").primaryKey(),
    reportId: uuid("report_id").references(() => recreioSafetyReports.id, { onDelete: "set null" }),
    restrictionReviewId: uuid("restriction_review_id").references(
      () => recreioRestrictionReviews.id,
      { onDelete: "set null" },
    ),
    caseKind: text("case_kind")
      .$type<"denuncia" | "recurso_restricao">()
      .notNull()
      .default("denuncia"),
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
        | "responder_recurso"
      >()
      .notNull(),
    /** Nome físico anterior conservado; a espécie do caso fixa o significado. */
    caseRevision: integer("report_revision").notNull(),
    createdAt: moment("created_at").notNull().defaultNow(),
    expiresAt: moment("expires_at").notNull(),
  },
  (t) => [
    index("recreio_moderation_command_retention").on(t.expiresAt, t.id),
    index("recreio_moderation_command_report").on(t.reportId, t.createdAt),
    check(
      "recreio_moderation_command_operation",
      sql`${t.operation} in ('analisar','concluir','suspender_perfil','reativar_perfil','desfazer_amizade','invalidar_convite','responder_recurso')`,
    ),
    check("recreio_moderation_command_digest", sql`${t.requestHash} ~ '^[a-f0-9]{64}$'`),
    check("recreio_moderation_command_revision", sql`${t.caseRevision}>1`),
    check(
      "recreio_moderation_command_case",
      sql`(${t.caseKind}='denuncia' and ${t.restrictionReviewId} is null and ${t.operation}<>'responder_recurso') or (${t.caseKind}='recurso_restricao' and ${t.reportId} is null and ${t.operation}='responder_recurso')`,
    ),
    check(
      "recreio_moderation_command_dates",
      sql`${t.expiresAt}>${t.createdAt} and ${t.expiresAt}<=${t.createdAt}+interval '180 days'`,
    ),
  ],
);
