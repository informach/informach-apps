import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  AGENDA_ACTIVITY_TYPES,
  agenda,
  agendaActivities,
  agendaProfileSubjects,
  agendaStudentProfiles,
  agendaSubjects,
} from "./agenda";
import { users } from "./core";

// Billing remains attached to the household owner. Every adult authenticates
// independently; profile grants, rather than the owner's identity, authorize reads.
export const agendaFamilyMembers = agenda.table(
  "family_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("agenda_family_one_guest_idx").on(t.ownerUserId),
    uniqueIndex("agenda_family_guest_owner_idx").on(t.userId, t.ownerUserId),
    check("agenda_family_distinct_adults", sql`${t.ownerUserId} <> ${t.userId}`),
  ],
);

/**
 * Ajustes da casa que não são preferência de notificação nem dado de criança.
 *
 * Hoje guarda só a dispensa dos primeiros passos. Uma linha por titular, criada
 * na primeira escrita: ausência significa "nunca dispensou", que é o padrão.
 */
export const agendaFamilySettings = agenda.table("family_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  firstStepsDismissedAt: timestamp("first_steps_dismissed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const agendaFamilyProfileAccess = agenda.table(
  "family_profile_access",
  {
    memberId: uuid("member_id")
      .notNull()
      .references(() => agendaFamilyMembers.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => agendaStudentProfiles.id, { onDelete: "cascade" }),
  },
  (t) => [
    uniqueIndex("agenda_family_profile_access_idx").on(t.memberId, t.profileId),
    index("agenda_family_access_profile_idx").on(t.profileId),
  ],
);

export const agendaFamilyInvitations = agenda.table(
  "family_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    profileIds: jsonb("profile_ids").$type<string[]>().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("agenda_family_invite_token_idx").on(t.tokenHash),
    index("agenda_family_invite_owner_idx").on(t.ownerUserId),
  ],
);

export const agendaNotices = agenda.table(
  "notices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    captureProfileId: uuid("capture_profile_id").references(() => agendaStudentProfiles.id, {
      onDelete: "cascade",
    }),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    source: text("source", {
      enum: ["teams", "batista", "notebook", "whatsapp", "other"],
    }).notNull(),
    sourceUrl: text("source_url"),
    publishedAt: date("published_at"),
    text: text("text").notNull().default(""),
    contentHash: text("content_hash").notNull(),
    // Null means the original's complete child scope has not been reviewed.
    sourceProfileIds: jsonb("source_profile_ids").$type<string[] | null>(),
    attachmentName: text("attachment_name"),
    attachmentType: text("attachment_type"),
    attachmentData: text("attachment_data"),
    attachmentExpiresAt: timestamp("attachment_expires_at", { withTimezone: true }),
    // `discarded`: a família dispensou o rascunho depois de a leitura ter sido
    // paga. Conta como importação consumida e volta a `ready` só se o mesmo
    // conteúdo for importado de novo (replay, sem nova cobrança).
    status: text("status", { enum: ["processing", "ready", "failed", "confirmed", "discarded"] })
      .notNull()
      .default("processing"),
    isTrial: boolean("is_trial").notNull().default(false),
    parsedResult: jsonb("parsed_result").$type<unknown>(),
    billingRunId: uuid("billing_run_id"),
    failureCode: text("failure_code"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("agenda_notices_owner_hash_idx").on(t.ownerUserId, t.contentHash),
    index("agenda_notices_owner_created_idx").on(t.ownerUserId, t.createdAt),
    index("agenda_notices_expiry_idx").on(t.attachmentExpiresAt),
    check(
      "agenda_notice_status_check",
      sql`${t.status} IN ('processing','ready','failed','confirmed','discarded')`,
    ),
  ],
);

export const agendaNoticeApplications = agenda.table(
  "notice_applications",
  {
    noticeId: uuid("notice_id")
      .notNull()
      .references(() => agendaNotices.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => agendaStudentProfiles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("agenda_notice_application_profile_idx").on(t.noticeId, t.profileId)],
);

// Procedência do prazo de uma providência.
//   school    — informado no próprio original
//   relative  — calculado a partir de uma referência de publicação do original
//   family    — planejado pela família
//   schedule  — calculado pelo horário da matéria (próxima aula, respeitando o
//               revezamento quinzenal). Determinístico, a partir do horário que
//               a própria família cadastrou — não é palpite da IA, que continua
//               proibida de inventar prazo.
export const AGENDA_DATE_ORIGINS = [
  "unspecified",
  "school",
  "relative",
  "family",
  "schedule",
] as const;

export const agendaTasks = agenda.table(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    noticeId: uuid("notice_id").references(() => agendaNotices.id, { onDelete: "set null" }),
    /**
     * Quando a tarefa veio de uma atividade publicada numa turma, aponta para o
     * fato compartilhado em `agenda.activities`. É o que permite que a mesma
     * atividade valha para várias famílias, cada uma com a sua conclusão, sem
     * uma segunda tabela de status.
     *
     * `SET NULL`: se o fato da turma sumir, a obrigação da família continua —
     * mesma regra da matéria.
     */
    sharedActivityId: uuid("shared_activity_id").references(() => agendaActivities.id, {
      onDelete: "set null",
    }),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => agendaStudentProfiles.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    assignedToUserId: text("assigned_to_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    type: text("type", { enum: AGENDA_ACTIVITY_TYPES }).notNull(),
    // Matéria da providência, opcional. É o que devolve a leitura por
    // matéria (nome e cor `chart-N`) às atividades que vieram de recado ou do
    // cadastro sem turma — antes elas só podiam exibir o rótulo do tipo.
    // No máximo uma das duas: matéria da turma OU extracurricular do perfil.
    // `SET NULL` (e não `CASCADE`, como em `agenda.activities.subject_id`)
    // porque a providência da família existe independentemente da matéria:
    // apagar a matéria tira o rótulo, nunca a obrigação.
    subjectId: uuid("subject_id").references(() => agendaSubjects.id, { onDelete: "set null" }),
    profileSubjectId: uuid("profile_subject_id").references(() => agendaProfileSubjects.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    description: text("description"),
    dueAt: date("due_at"),
    time: text("time"),
    /**
     * Quanto tempo a atividade leva, em minutos. Nulo é o normal.
     *
     * Responde a pergunta das sete da noite — "dá para fazer antes do jantar?"
     * — que o app não sabia responder. É escolha da FAMÍLIA: a IA não estima,
     * pela mesma regra que a proíbe de inventar prazo. Calcular a próxima aula
     * a partir do horário cadastrado é determinístico; adivinhar quanto tempo
     * uma criança leva num trabalho não é.
     */
    estimatedMinutes: integer("estimated_minutes"),
    location: text("location"),
    dateOrigin: text("date_origin", { enum: AGENDA_DATE_ORIGINS }).notNull().default("unspecified"),
    sourceExcerpt: text("source_excerpt"),
    status: text("status", { enum: ["pending", "done", "canceled"] })
      .notNull()
      .default("pending"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    reminderAt: timestamp("reminder_at", { withTimezone: true }),
    recurrence: text("recurrence", { enum: ["none", "weekly"] })
      .notNull()
      .default("none"),
    seriesId: uuid("series_id"),
    /**
     * Sessão de estudo criada para uma prova ou trabalho: aponta para ela.
     *
     * A família pede o plano, e ele é aritmética — dias disponíveis entre
     * amanhã e a véspera, repartidos. A IA continua proibida de criar sessão de
     * estudo a partir da leitura de um recado (ver §6): o que a escola mandou é
     * uma coisa, o que a casa decide estudar é outra.
     *
     * `SET NULL`: se a prova for apagada, as sessões viram tarefas soltas em
     * vez de sumirem; cancelar a prova cancela as pendentes, o que é decisão do
     * serviço, não do banco.
     */
    studyForTaskId: uuid("study_for_task_id").references((): AnyPgColumn => agendaTasks.id, {
      onDelete: "set null",
    }),
    version: integer("version").notNull().default(1),
    fingerprint: text("fingerprint").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("agenda_tasks_profile_due_idx").on(t.profileId, t.dueAt),
    index("agenda_tasks_reminder_idx").on(t.reminderAt, t.status),
    uniqueIndex("agenda_tasks_notice_profile_idx").on(t.noticeId, t.profileId, t.fingerprint),
    uniqueIndex("agenda_tasks_series_due_idx").on(t.seriesId, t.profileId, t.dueAt),
    check(
      "agenda_task_date_origin_check",
      sql`(${t.dueAt} IS NULL AND ${t.dateOrigin} = 'unspecified') OR (${t.dueAt} IS NOT NULL AND ${t.dateOrigin} IN ('school','relative','family','schedule'))`,
    ),
    check(
      "agenda_task_time_check",
      sql`${t.time} IS NULL OR (${t.dueAt} IS NOT NULL AND ${t.time} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')`,
    ),
    check("agenda_task_status_check", sql`${t.status} IN ('pending','done','canceled')`),
    check(
      "agenda_task_subject_exclusive_check",
      sql`${t.subjectId} IS NULL OR ${t.profileSubjectId} IS NULL`,
    ),
    uniqueIndex("agenda_tasks_shared_activity_profile_idx")
      .on(t.sharedActivityId, t.profileId)
      .where(sql`${t.sharedActivityId} IS NOT NULL`),
    index("agenda_tasks_subject_idx").on(t.subjectId),
    index("agenda_tasks_profile_subject_idx").on(t.profileSubjectId),
    index("agenda_tasks_study_for_idx").on(t.studyForTaskId),
  ],
);

/**
 * "Levar sempre": o que vai na mochila toda vez que a matéria tem aula.
 *
 * Tênis na educação física, flauta na música, apostila no reforço. Não é
 * atividade — não tem prazo, não se conclui e não entra em contagem nenhuma.
 * É uma propriedade da matéria para aquela criança, e por isso mora fora de
 * `tasks`: cadastrar vinte lembretes semanais repetidos seria transformar uma
 * lista de três itens em vinte obrigações.
 */
export const agendaSubjectKits = agenda.table(
  "subject_kits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => agendaStudentProfiles.id, { onDelete: "cascade" }),
    subjectId: uuid("subject_id").references(() => agendaSubjects.id, { onDelete: "cascade" }),
    profileSubjectId: uuid("profile_subject_id").references(() => agendaProfileSubjects.id, {
      onDelete: "cascade",
    }),
    items: jsonb("items")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    // A lista é da matéria PARA AQUELA CRIANÇA: duas irmãs na mesma turma
    // levam coisas diferentes, e a matéria é compartilhada entre famílias.
    uniqueIndex("agenda_subject_kit_turma_idx")
      .on(t.profileId, t.subjectId)
      .where(sql`${t.subjectId} IS NOT NULL`),
    uniqueIndex("agenda_subject_kit_extra_idx")
      .on(t.profileId, t.profileSubjectId)
      .where(sql`${t.profileSubjectId} IS NOT NULL`),
    check(
      "agenda_subject_kit_target_check",
      sql`(${t.subjectId} IS NOT NULL) <> (${t.profileSubjectId} IS NOT NULL)`,
    ),
  ],
);

export const agendaActivityRevisions = agenda.table(
  "activity_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    activityId: uuid("activity_id").references(() => agendaActivities.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => agendaTasks.id, {
      onDelete: "cascade",
    }),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    version: integer("version").notNull(),
    previous: jsonb("previous").$type<Record<string, unknown>>().notNull(),
    current: jsonb("current").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("agenda_activity_revision_version_idx").on(t.activityId, t.version),
    uniqueIndex("agenda_task_revision_version_idx").on(t.taskId, t.version),
    check(
      "agenda_revision_one_target",
      sql`(${t.activityId} IS NOT NULL) <> (${t.taskId} IS NOT NULL)`,
    ),
  ],
);

export const agendaNotificationPreferences = agenda.table(
  "notification_preferences",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    emailEnabled: boolean("email_enabled").notNull().default(false),
    pushEnabled: boolean("push_enabled").notNull().default(false),
    digestHour: integer("digest_hour").notNull().default(19),
    quietStart: integer("quiet_start").notNull().default(21),
    quietEnd: integer("quiet_end").notNull().default(7),
    /**
     * Preencher o lembrete sugerido ao importar um recado.
     *
     * A sugestão (`reminder-suggestion.ts`) já existia e só era aplicada por um
     * toque explícito — então quase nunca era aplicada. Ligada por padrão, e à
     * vista no formulário: o lembrete aparece preenchido e se apaga como
     * qualquer campo.
     */
    suggestReminders: boolean("suggest_reminders").notNull().default(true),
    /**
     * O resumo de domingo. Responde a pergunta que o diário não responde: o que
     * vem pela frente na semana, enquanto ainda dá para organizar o fim de
     * semana em função dela.
     */
    weeklyDigestEnabled: boolean("weekly_digest_enabled").notNull().default(true),
    /** 0 = domingo, como `Date#getDay`. */
    weeklyDigestDay: integer("weekly_digest_day").notNull().default(0),
    weeklyDigestHour: integer("weekly_digest_hour").notNull().default(18),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    check(
      "agenda_notification_hours_check",
      sql`${t.digestHour} BETWEEN 0 AND 23 AND ${t.quietStart} BETWEEN 0 AND 23 AND ${t.quietEnd} BETWEEN 0 AND 23 AND ${t.weeklyDigestHour} BETWEEN 0 AND 23 AND ${t.weeklyDigestDay} BETWEEN 0 AND 6`,
    ),
  ],
);

export const agendaPushSubscriptions = agenda.table(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("agenda_push_endpoint_idx").on(t.endpoint),
    index("agenda_push_user_idx").on(t.userId),
  ],
);

export const agendaNotificationDeliveries = agenda.table(
  "notification_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    messageKey: text("message_key").notNull(),
    channel: text("channel", { enum: ["email", "push"] }).notNull(),
    status: text("status", { enum: ["pending", "processing", "sent", "failed", "canceled"] })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("agenda_delivery_idempotency_idx").on(t.userId, t.channel, t.messageKey)],
);

export const agendaCalendarFeeds = agenda.table(
  "calendar_feeds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("agenda_feed_token_idx").on(t.tokenHash),
    index("agenda_feed_user_idx").on(t.userId),
  ],
);

// Only enumerated, content-free fields are accepted by the product event service.
/**
 * O endereço de e-mail da família, para encaminhar recado.
 *
 * Mesma forma do `calendar_feeds`: o token vive em hash, é revogável e pode ser
 * girado. O endereço é `recados+<token>@<domínio>`, e quem o tem consegue
 * DEPOSITAR um recado na caixa — nunca ler o que já está lá. Por isso ele pode
 * circular num grupo de escola sem virar chave de acesso à rotina de ninguém.
 */
export const agendaInboxAddresses = agenda.table(
  "inbox_addresses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("agenda_inbox_token_idx").on(t.tokenHash),
    // Um endereço ativo por família: girar substitui, não acumula.
    uniqueIndex("agenda_inbox_active_user_idx")
      .on(t.userId)
      .where(sql`${t.revokedAt} IS NULL`),
  ],
);

/**
 * O que chegou por e-mail e ainda não virou recado.
 *
 * Fica aqui, e não em `notices`, porque ainda não é um recado da família: é
 * correspondência recebida. Só quando a pessoa escolhe a criança e manda ler é
 * que nasce um `notice` — e a cobrança acontece ali, não aqui.
 *
 * Do remetente guardamos hash e domínio. O domínio ajuda a pessoa a reconhecer
 * a escola; o endereço completo é dado de terceiro que a Agenda não precisa.
 */
export const agendaInboxMessages = agenda.table(
  "inbox_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fromHash: text("from_hash").notNull(),
    fromDomain: text("from_domain"),
    subject: text("subject").notNull().default(""),
    text: text("text").notNull().default(""),
    attachmentName: text("attachment_name"),
    attachmentType: text("attachment_type"),
    attachmentData: text("attachment_data"),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    status: text("status", { enum: ["new", "used", "discarded"] })
      .notNull()
      .default("new"),
    noticeId: uuid("notice_id").references(() => agendaNotices.id, { onDelete: "set null" }),
  },
  (t) => [
    index("agenda_inbox_messages_owner_status_idx").on(t.ownerUserId, t.status, t.receivedAt),
    index("agenda_inbox_messages_expiry_idx").on(t.expiresAt),
    check("agenda_inbox_message_status_check", sql`${t.status} IN ('new','used','discarded')`),
  ],
);

/**
 * O recibo de uma gravação que veio da fila offline.
 *
 * Concluir uma atividade usa `version` para concorrência otimista, e por isso
 * repetir uma gravação enfileirada NÃO é inofensivo: a segunda tentativa
 * chegaria com a versão velha e seria recusada, ou — pior — passaria por cima
 * de uma decisão que outra pessoa tomou no meio. Quem garante o "uma vez só" é
 * a chave que o aparelho gera ANTES de tentar a primeira vez e repete em toda
 * retentativa: a primeira grava e guarda aqui o que respondeu, e as seguintes
 * recebem de volta exatamente aquela resposta, inclusive quando ela foi uma
 * recusa por conflito de versão.
 *
 * A chave é composta com o dono de propósito. Fosse `key` sozinha a chave
 * primária, adivinhar a de outra família devolveria o recibo dela.
 *
 * `task_id` fica sem FK: o recibo vale por sete dias e precisa sobreviver à
 * atividade que ele descreve, senão apagar a atividade reabriria a porta para
 * a mesma gravação acontecer de novo.
 */
export const agendaIdempotentWrites = agenda.table(
  "idempotent_writes",
  {
    key: uuid("key").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    taskId: uuid("task_id"),
    result: jsonb("result").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.key] }),
    index("agenda_idempotent_write_age_idx").on(t.createdAt),
  ],
);

export const agendaProductEvents = agenda.table(
  "product_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    event: text("event").notNull(),
    source: text("source"),
    count: integer("count"),
    durationMs: integer("duration_ms"),
    landingContext: jsonb("landing_context").$type<{
      variant: "family-routine-v1";
      placement?: "hero" | "demo" | "pricing" | "final";
      selection?: { plan: "free" } | { plan: "pro"; cycle: "monthly" | "annual" };
      scenario?: "passeio" | "prova" | "material";
      action?: "scenario" | "plan" | "complete";
      firstCta?: boolean;
    }>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("agenda_product_event_time_idx").on(t.event, t.createdAt)],
);
