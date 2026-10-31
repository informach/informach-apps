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
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./core";

export const boraTreinar = pgSchema("bora_treinar");
const time = (name: string) => timestamp(name, { withTimezone: true }).defaultNow().notNull();

/**
 * A família é a conta do titular (1:1 com `core.users`). Guarda também as
 * preferências de lembrete e de resumo semanal, que são do titular, não de
 * cada perfil.
 */
export const boraFamilies = boraTreinar.table(
  "families",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Dias da semana com lembrete, bit 0 = domingo … bit 6 = sábado. 0 = desligado. */
    reminderDays: integer("reminder_days").notNull().default(0),
    /** Hora local (0–23) do lembrete. */
    reminderHour: integer("reminder_hour").notNull().default(18),
    timezone: text("timezone").notNull().default("America/Sao_Paulo"),
    /** Resumo semanal por e-mail: opt-in, porque o corpo traz os nomes dos perfis. */
    weeklySummary: boolean("weekly_summary").notNull().default(false),
    /** Checkpoint do resumo semanal (segunda-feira local já tratada). */
    weeklySummaryWeek: date("weekly_summary_week"),
    createdAt: time("created_at"),
  },
  (t) => [
    check("bora_families_reminder_days", sql`${t.reminderDays} between 0 and 127`),
    check("bora_families_reminder_hour", sql`${t.reminderHour} between 0 and 23`),
  ],
);

/**
 * Perfil de quem treina. Só apelido e cor: nenhuma data de nascimento ou outro
 * dado pessoal, porque perfis costumam ser de crianças.
 */
export const boraProfiles = boraTreinar.table(
  "profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => boraFamilies.userId, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull(),
    /** Perfil escolhido para continuar ativo quando o plano comporta menos perfis. */
    accessEnabled: boolean("access_enabled").notNull().default(true),
    createdAt: time("created_at"),
  },
  (t) => [
    index("bora_profiles_owner").on(t.userId, t.createdAt),
    check("bora_profiles_name", sql`char_length(${t.name}) between 1 and 24`),
    check("bora_profiles_color", sql`${t.color} ~ '^#[0-9A-F]{6}$'`),
  ],
);

/** Nível de cada perfil em cada trilha de progressão (ver catálogo do app). */
export const boraChainProgress = boraTreinar.table(
  "chain_progress",
  {
    profileId: uuid("profile_id")
      .notNull()
      .references(() => boraProfiles.id, { onDelete: "cascade" }),
    chainId: text("chain_id").notNull(),
    level: integer("level").notNull().default(0),
    bonus: integer("bonus").notNull().default(0),
    /** Sessões seguidas batendo a meta em todas as séries do nível atual. */
    streak: integer("streak").notNull().default(0),
    updatedAt: time("updated_at"),
  },
  (t) => [
    primaryKey({ columns: [t.profileId, t.chainId] }),
    check(
      "bora_chain_progress_values",
      sql`${t.level} >= 0 and ${t.bonus} >= 0 and ${t.streak} >= 0`,
    ),
  ],
);

/**
 * Um treino concluído. O id é gerado no aparelho, para que a sessão guardada
 * sem rede possa ser reenviada sem duplicar.
 */
export const boraSessions = boraTreinar.table(
  "sessions",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => boraFamilies.userId, { onDelete: "cascade" }),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => boraProfiles.id, { onDelete: "cascade" }),
    /** `catalogo:<id>`, `meu:<uuid>` ou `pratica:<exercicio>`. */
    workoutRef: text("workout_ref").notNull(),
    workoutName: text("workout_name").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    mode: text("mode").notNull(),
    createdAt: time("created_at"),
  },
  (t) => [
    index("bora_sessions_profile_started").on(t.profileId, t.startedAt),
    index("bora_sessions_user_started").on(t.userId, t.startedAt),
    check("bora_sessions_mode", sql`${t.mode} in ('camera', 'manual', 'pareado')`),
    check("bora_sessions_duration", sql`${t.durationSeconds} between 0 and 14400`),
  ],
);

/** Uma série dentro de uma sessão. */
export const boraSetLogs = boraTreinar.table(
  "set_logs",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => boraSessions.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    exerciseId: text("exercise_id").notNull(),
    kind: text("kind").notNull(),
    target: integer("target"),
    reps: integer("reps").notNull().default(0),
    partials: integer("partials").notNull().default(0),
    holdSeconds: integer("hold_seconds").notNull().default(0),
    seconds: integer("seconds").notNull().default(0),
    /** Avisos de execução detectados pela câmera, com contagem. */
    issues: jsonb("issues").$type<Record<string, number>>().notNull().default({}),
  },
  (t) => [
    primaryKey({ columns: [t.sessionId, t.position] }),
    check("bora_set_logs_kind", sql`${t.kind} in ('reps', 'hold')`),
    check(
      "bora_set_logs_values",
      sql`${t.reps} >= 0 and ${t.partials} >= 0 and ${t.holdSeconds} >= 0 and ${t.seconds} >= 0`,
    ),
  ],
);

/** Treino montado pelo titular no editor; `blocks` segue o tipo `Block` do catálogo. */
export const boraCustomWorkouts = boraTreinar.table(
  "custom_workouts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => boraFamilies.userId, { onDelete: "cascade" }),
    name: text("name").notNull(),
    subtitle: text("subtitle").notNull().default(""),
    level: text("level").notNull(),
    focus: text("focus").notNull(),
    blocks: jsonb("blocks").$type<unknown[]>().notNull(),
    createdAt: time("created_at"),
    updatedAt: time("updated_at"),
  },
  (t) => [
    index("bora_custom_workouts_owner").on(t.userId, t.updatedAt),
    check("bora_custom_workouts_name", sql`char_length(${t.name}) between 1 and 40`),
  ],
);

/** Desafio semanal da família: uma meta compartilhada por semana. */
export const boraChallenges = boraTreinar.table(
  "challenges",
  {
    userId: text("user_id")
      .notNull()
      .references(() => boraFamilies.userId, { onDelete: "cascade" }),
    /** Segunda-feira local, em data pura. */
    weekStart: date("week_start").notNull(),
    metric: text("metric").notNull(),
    /** Só quando a meta é de repetições de um exercício. */
    exerciseId: text("exercise_id"),
    target: integer("target").notNull(),
    createdAt: time("created_at"),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.weekStart] }),
    check(
      "bora_challenges_metric",
      sql`${t.metric} in ('repeticoes', 'minutos', 'treinos', 'exercicio')`,
    ),
    check("bora_challenges_target", sql`${t.target} between 1 and 100000`),
  ],
);

/** Conquistas de cada perfil; `sessionId` aponta o treino que a destravou. */
export const boraAchievements = boraTreinar.table(
  "achievements",
  {
    profileId: uuid("profile_id")
      .notNull()
      .references(() => boraProfiles.id, { onDelete: "cascade" }),
    achievementId: text("achievement_id").notNull(),
    sessionId: uuid("session_id").references(() => boraSessions.id, { onDelete: "set null" }),
    earnedAt: time("earned_at"),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.achievementId] })],
);
