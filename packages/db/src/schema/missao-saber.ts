import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./core";

export const missaoSaber = pgSchema("missao_saber");
const time = (name: string) => timestamp(name, { withTimezone: true }).defaultNow().notNull();

export const missaoFamilies = missaoSaber.table(
  "families",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    consentVersion: text("consent_version").notNull(),
    consentAt: time("consent_at"),
    dailyMinutes: integer("daily_minutes").notNull().default(10),
    /**
     * Resumo semanal por e-mail para o responsável. Opt-in explícito e desligado
     * por padrão: o corpo descreve o estudo de uma criança, então ninguém passa
     * a receber esses dados por omissão.
     */
    weeklyReportEmail: boolean("weekly_report_email").notNull().default(false),
    /** Checkpoint de entrega/dispensa; falhas não avançam a semana. */
    weeklyReportProcessedWeek: date("weekly_report_processed_week"),
    createdAt: time("created_at"),
  },
  (t) => [check("missao_daily_minutes", sql`${t.dailyMinutes} in (5, 10, 15, 20)`)],
);

/**
 * Desafio da família: uma meta semanal única, somada entre todos os perfis.
 *
 * A meta é de VARIEDADE — estratégias distintas na semana — e não de volume nem
 * de velocidade: contar respostas premiaria repetir a mesma família de item,
 * exatamente o que o motor de evidência existe para não premiar. Não há
 * classificação entre irmãos e a semana seguinte recomeça sem dívida.
 */
export const missaoFamilyChallenges = missaoSaber.table(
  "family_challenges",
  {
    userId: text("user_id")
      .notNull()
      .references(() => missaoFamilies.userId, { onDelete: "cascade" }),
    /** Segunda-feira local de São Paulo, em data pura. */
    weekStart: date("week_start").notNull(),
    goal: integer("goal").notNull(),
    createdAt: time("created_at"),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.weekStart] }),
    check("missao_family_challenge_goal", sql`${t.goal} between 4 and 40`),
  ],
);

export const missaoProfiles = missaoSaber.table(
  "profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => missaoFamilies.userId, { onDelete: "cascade" }),
    nickname: text("nickname").notNull(),
    /** Ano escolar confirmado pelo responsável: 1 a 9 fundamental, 10 a 12 ensino médio. */
    grade: integer("grade").notNull(),
    /** Ano civil a que `grade` se refere; o ano efetivo avança a cada virada. */
    gradeYear: integer("grade_year").notNull().default(sql`(extract(year from now()))::int`),
    /** Mês e ano de nascimento (dia 1), opcional; só para sugerir o ano escolar. */
    birthMonth: date("birth_month"),
    avatar: text("avatar").notNull().default("cometa"),
    courseId: text("course_id").notNull(),
    accessEnabled: boolean("access_enabled").notNull().default(true),
    createdAt: time("created_at"),
  },
  (t) => [
    index("missao_profiles_owner").on(t.userId),
    check("missao_profile_grade", sql`${t.grade} between 1 and 12`),
    check("missao_profile_grade_year", sql`${t.gradeYear} between 2000 and 2100`),
  ],
);

/** Study credentials are independent from the adult's Informach session. */
export const missaoStudyDevices = missaoSaber.table(
  "study_devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => missaoFamilies.userId, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    label: text("label").notNull(),
    remember: boolean("remember").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: time("created_at"),
  },
  (t) => [
    uniqueIndex("missao_study_token_hash").on(t.tokenHash),
    index("missao_study_device_owner").on(t.userId),
    index("missao_study_device_expiry").on(t.expiresAt),
    check("missao_study_label_length", sql`length(${t.label}) between 2 and 60`),
  ],
);

export const missaoStudyDeviceProfiles = missaoSaber.table(
  "study_device_profiles",
  {
    deviceId: uuid("device_id")
      .notNull()
      .references(() => missaoStudyDevices.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => missaoProfiles.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.deviceId, t.profileId] }),
    index("missao_study_profile_device").on(t.profileId),
  ],
);

export const missaoStudyCodes = missaoSaber.table(
  "study_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => missaoStudyDevices.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: time("created_at"),
  },
  (t) => [
    uniqueIndex("missao_study_code_hash").on(t.codeHash),
    index("missao_study_code_expiry").on(t.expiresAt),
  ],
);

/** HMAC keys, never raw addresses; old windows are deleted by maintenance. */
export const missaoStudyAccessLimits = missaoSaber.table("study_access_limits", {
  key: text("key").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  attempts: integer("attempts").notNull(),
});

export const missaoSessions = missaoSaber.table(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => missaoProfiles.id, { onDelete: "cascade" }),
    lessonId: text("lesson_id").notNull(),
    version: integer("version").notNull(),
    mode: text("mode", { enum: ["mission", "review", "diagnostic", "exam"] }).notNull(),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    requestKey: uuid("request_key").notNull(),
    /**
     * Leitura em voz alta usada em algum momento da sessão. Só importa em
     * diagnóstico e simulado: ler o enunciado pode alterar o construto
     * avaliado, então a devolutiva e o histórico precisam declarar o apoio em
     * vez de comparar o resultado como se fosse leitura autônoma.
     */
    readingSupport: boolean("reading_support").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    interruptedAt: timestamp("interrupted_at", { withTimezone: true }),
    interruptionReason: text("interruption_reason"),
    createdAt: time("created_at"),
  },
  (t) => [
    uniqueIndex("missao_session_request").on(t.profileId, t.requestKey),
    index("missao_sessions_profile").on(t.profileId, t.createdAt),
  ],
);

export const missaoAttempts = missaoSaber.table(
  "attempts",
  {
    id: uuid("id").primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => missaoSessions.id, { onDelete: "cascade" }),
    itemId: text("item_id").notNull(),
    skillId: text("skill_id").notNull(),
    familyId: text("family_id").notNull(),
    answer: text("answer").notNull(),
    correct: boolean("correct"),
    result: text("result", {
      enum: ["correct", "incorrect", "skipped", "reflection"],
    }),
    helpCount: integer("help_count").notNull(),
    createdAt: time("created_at"),
  },
  (t) => [
    uniqueIndex("missao_attempt_item").on(t.sessionId, t.itemId),
    index("missao_attempt_session").on(t.sessionId),
  ],
);

export const missaoHints = missaoSaber.table(
  "hints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => missaoSessions.id, { onDelete: "cascade" }),
    itemId: text("item_id").notNull(),
    count: integer("count").notNull().default(1),
  },
  (t) => [
    uniqueIndex("missao_hint_item").on(t.sessionId, t.itemId),
    check("missao_hint_count", sql`${t.count} between 1 and 3`),
  ],
);

export const missaoNotes = missaoSaber.table(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => missaoProfiles.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    sessionId: uuid("session_id").references(() => missaoSessions.id, { onDelete: "set null" }),
    itemId: text("item_id"),
    labAttachment: jsonb("lab_attachment").$type<Record<string, unknown>>(),
    createdAt: time("created_at"),
  },
  (t) => [
    index("missao_notes_profile").on(t.profileId, t.createdAt),
    index("missao_notes_page").on(t.profileId, t.archivedAt, t.createdAt, t.id),
  ],
);

export const missaoContentControls = missaoSaber.table(
  "content_controls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lessonId: text("lesson_id").notNull(),
    version: integer("version").notNull(),
    contentHash: text("content_hash").notNull().default(""),
    status: text("status", { enum: ["available", "suspended", "invalidated"] }).notNull(),
    invalidatedItems: jsonb("invalidated_items")
      .$type<{ itemId: string; itemHash: string }[]>()
      .notNull()
      .default([]),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    note: text("note").notNull(),
    createdAt: time("created_at"),
  },
  (t) => [index("missao_content_control_lesson").on(t.lessonId, t.createdAt)],
);

export const missaoReports = missaoSaber.table(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    profileId: uuid("profile_id").references(() => missaoProfiles.id, { onDelete: "set null" }),
    sessionId: uuid("session_id").references(() => missaoSessions.id, { onDelete: "set null" }),
    lessonId: text("lesson_id").notNull(),
    version: integer("version").notNull(),
    itemId: text("item_id").notNull(),
    category: text("category", {
      enum: ["not_understood", "possible_error", "figure_issue", "app_difficulty"],
    }),
    detail: text("detail").notNull(),
    requestKey: uuid("request_key"),
    status: text("status", { enum: ["open", "investigating", "resolved"] })
      .notNull()
      .default("open"),
    resolution: text("resolution"),
    resolvedBy: text("resolved_by").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: time("created_at"),
  },
  (t) => [
    index("missao_reports_open").on(t.status, t.createdAt),
    index("missao_reports_owner").on(t.userId),
    index("missao_reports_recurrence").on(t.lessonId, t.itemId, t.category, t.createdAt),
    uniqueIndex("missao_report_request")
      .on(t.userId, t.requestKey)
      .where(sql`${t.requestKey} is not null`),
    check(
      "missao_report_status",
      sql`${t.status} in ('open', 'investigating', 'resolved') and ((${t.status} = 'resolved') = (${t.resolvedAt} is not null))`,
    ),
    check(
      "missao_report_category",
      sql`${t.category} is null or ${t.category} in ('not_understood', 'possible_error', 'figure_issue', 'app_difficulty')`,
    ),
  ],
);

export const missaoReportUpdates = missaoSaber.table(
  "report_updates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reportId: uuid("report_id")
      .notNull()
      .references(() => missaoReports.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    status: text("status", { enum: ["investigating", "resolved"] }).notNull(),
    note: text("note").notNull(),
    createdAt: time("created_at"),
  },
  (t) => [index("missao_report_updates_report").on(t.reportId, t.createdAt)],
);

export const missaoExperiments = missaoSaber.table(
  "experiments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => missaoProfiles.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["bars", "grid", "groups"] }).notNull(),
    state: jsonb("state").$type<Record<string, unknown>>().notNull(),
    revision: integer("revision").notNull().default(1),
    updatedAt: time("updated_at"),
  },
  (t) => [uniqueIndex("missao_experiment_profile_kind").on(t.profileId, t.kind)],
);

/** Versioned laboratory runs. Legacy experiments remain intact. */
export const missaoLabExecutions = missaoSaber.table(
  "lab_executions",
  {
    id: uuid("id").primaryKey(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => missaoProfiles.id, { onDelete: "cascade" }),
    experienceId: text("experience_id").notNull(),
    version: integer("version").notNull(),
    grade: integer("grade").notNull(),
    courseId: text("course_id").notNull(),
    document: jsonb("document").$type<Record<string, unknown>>().notNull(),
    requestSource: text("request_source").notNull().default("new"),
    assessment: jsonb("assessment").$type<Record<string, unknown>>(),
    context: jsonb("context").$type<{ sessionId: string; itemId: string }>(),
    legacy: jsonb("legacy").$type<Record<string, unknown>>(),
    events: jsonb("events")
      .$type<
        {
          kind: "explored" | "investigation_concluded" | "transfer_solved" | "transfer_reflected";
          at: string;
          revision: number;
          summary: string;
        }[]
      >()
      .notNull()
      .default([]),
    revision: integer("revision").notNull().default(1),
    createdAt: time("created_at"),
    updatedAt: time("updated_at"),
  },
  (t) => [
    index("missao_lab_profile_updated").on(t.profileId, t.updatedAt),
    check("missao_lab_revision", sql`${t.revision} > 0 and ${t.version} > 0`),
    check("missao_lab_grade", sql`${t.grade} between 1 and 12`),
  ],
);

/**
 * Competição em família: o responsável coordena, no aparelho dele, uma
 * sequência de vezes entre perfis escolhidos. É a exceção registrada à regra
 * "cooperação, não ranking" (docs/propostas/missao-saber-competicao-2026-10-31):
 * o pódio existe, mas só aqui, na conta do responsável, e nunca no estudo da
 * criança. Resultados sob tempo não alimentam o motor de evidência.
 */
export const missaoCompetitions = missaoSaber.table(
  "competitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => missaoFamilies.userId, { onDelete: "cascade" }),
    title: text("title").notNull(),
    area: text("area", { enum: ["matematica", "financeira"] }).notNull(),
    /** Quantidades por competidor. */
    problemCount: integer("problem_count").notNull(),
    challengeCount: integer("challenge_count").notNull(),
    problemSeconds: integer("problem_seconds").notNull(),
    challengeSeconds: integer("challenge_seconds").notNull(),
    /** Semente do sorteio, guardada para que o sorteio seja reproduzível. */
    seed: integer("seed").notNull(),
    status: text("status", { enum: ["ready", "running", "finished", "cancelled"] })
      .notNull()
      .default("ready"),
    requestKey: uuid("request_key").notNull(),
    createdAt: time("created_at"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("missao_competition_request").on(t.userId, t.requestKey),
    index("missao_competitions_owner").on(t.userId, t.createdAt),
    check("missao_competition_title", sql`length(${t.title}) between 2 and 60`),
    check(
      "missao_competition_counts",
      sql`${t.problemCount} between 0 and 20 and ${t.challengeCount} between 0 and 3 and ${t.problemCount} + ${t.challengeCount} > 0`,
    ),
    check(
      "missao_competition_seconds",
      sql`${t.problemSeconds} between 20 and 300 and ${t.challengeSeconds} between 60 and 900`,
    ),
  ],
);

/**
 * Apelido, avatar e nível ficam copiados: o pódio de uma competição encerrada
 * não muda se o perfil for renomeado, avançar de ano ou for apagado.
 */
export const missaoCompetitors = missaoSaber.table(
  "competitors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    competitionId: uuid("competition_id")
      .notNull()
      .references(() => missaoCompetitions.id, { onDelete: "cascade" }),
    profileId: uuid("profile_id").references(() => missaoProfiles.id, { onDelete: "set null" }),
    seat: integer("seat").notNull(),
    nickname: text("nickname").notNull(),
    avatar: text("avatar").notNull(),
    grade: integer("grade").notNull(),
    /** Rótulo do nível sorteado, como "Canguru E e OBMEP Mirim 2". */
    level: text("level").notNull(),
    /** Faixa dos desafios de peças: a (2º-3º), b (4º-5º), c (6º-7º), d (8º em diante). */
    band: text("band", { enum: ["a", "b", "c", "d"] }).notNull(),
  },
  (t) => [
    uniqueIndex("missao_competitor_seat").on(t.competitionId, t.seat),
    check("missao_competitor_grade", sql`${t.grade} between 1 and 12`),
  ],
);

export const missaoCompetitionTurns = missaoSaber.table(
  "competition_turns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    competitionId: uuid("competition_id")
      .notNull()
      .references(() => missaoCompetitions.id, { onDelete: "cascade" }),
    competitorId: uuid("competitor_id")
      .notNull()
      .references(() => missaoCompetitors.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    kind: text("kind", { enum: ["problem", "challenge"] }).notNull(),
    /** Problema: lição de origem e cópia do item com gabarito, só no servidor. */
    lessonId: text("lesson_id"),
    itemId: text("item_id"),
    item: jsonb("item").$type<Record<string, unknown>>(),
    /** Desafio: id no catálogo de peças. */
    puzzleId: text("puzzle_id"),
    seconds: integer("seconds").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    deadlineAt: timestamp("deadline_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    answer: text("answer"),
    result: text("result", { enum: ["correct", "incorrect", "timeout", "gave_up"] }),
    points: integer("points").notNull().default(0),
  },
  (t) => [
    uniqueIndex("missao_competition_turn_position").on(t.competitionId, t.position),
    index("missao_competition_turn_competitor").on(t.competitorId),
    check(
      "missao_competition_turn_content",
      sql`(${t.kind} = 'problem' and ${t.itemId} is not null and ${t.item} is not null and ${t.lessonId} is not null and ${t.puzzleId} is null) or (${t.kind} = 'challenge' and ${t.puzzleId} is not null and ${t.itemId} is null)`,
    ),
    check("missao_competition_turn_points", sql`${t.points} between 0 and 3`),
  ],
);

/**
 * Desafios de peças montados no laboratório: uma linha por perfil e desafio.
 * Guarda só o fato e o melhor tempo; a montagem em si fica no aparelho.
 */
export const missaoPuzzleSolves = missaoSaber.table(
  "puzzle_solves",
  {
    profileId: uuid("profile_id")
      .notNull()
      .references(() => missaoProfiles.id, { onDelete: "cascade" }),
    puzzleId: text("puzzle_id").notNull(),
    solves: integer("solves").notNull().default(1),
    bestSeconds: integer("best_seconds").notNull(),
    firstSolvedAt: time("first_solved_at"),
    lastSolvedAt: time("last_solved_at"),
  },
  (t) => [
    primaryKey({ columns: [t.profileId, t.puzzleId] }),
    check("missao_puzzle_solve_counts", sql`${t.solves} > 0 and ${t.bestSeconds} >= 0`),
  ],
);
