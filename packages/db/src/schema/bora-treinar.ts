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
    /**
     * Início do teste de 7 dias sem cartão (tudo liberado). Nulo = nunca começou. Um por e-mail:
     * quem decide é `trial_claims`, que sobrevive à exclusão da conta.
     */
    trialStartedAt: timestamp("trial_started_at", { withTimezone: true }),
    createdAt: time("created_at"),
  },
  (t) => [
    check("bora_families_reminder_days", sql`${t.reminderDays} between 0 and 127`),
    check("bora_families_reminder_hour", sql`${t.reminderHour} between 0 and 23`),
  ],
);

/**
 * O teste de 7 dias, um por e-mail: o hash HMAC do e-mail (nunca o e-mail) segura o pedido mesmo
 * depois que a conta é apagada e criada de novo. Mesmo desenho do teste do Cozya.
 */
export const boraTrialClaims = boraTreinar.table("trial_claims", {
  emailHash: text("email_hash").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  startedAt: time("started_at"),
});

/**
 * Perfil de quem treina. Apelido, cor e preferências de treino (jeito de treinar, tempo, dias por
 * semana): nenhuma data de nascimento, peso, foto ou dado de saúde, porque perfis costumam ser de
 * crianças.
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
    /**
     * Jeito de treinar, escolhido no primeiro acesso: "leve" troca saltos por versões sem impacto
     * e reduz as metas; "forte" começa mais alto. É preferência de treino, não dado de saúde.
     */
    intensity: text("intensity").notNull().default("normal"),
    /** Meta de dias de treino por semana (a semana cumprida substitui os dias seguidos). */
    weeklyGoal: integer("weekly_goal").notNull().default(3),
    /** Tempo que costuma ter, em minutos, para o "Hoje é dia de". Nulo = não respondeu. */
    minutesPref: integer("minutes_pref"),
    /** Quando passou pelo primeiro acesso; nulo = ainda vai passar. */
    onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
    createdAt: time("created_at"),
  },
  (t) => [
    index("bora_profiles_owner").on(t.userId, t.createdAt),
    check("bora_profiles_name", sql`char_length(${t.name}) between 1 and 24`),
    check("bora_profiles_color", sql`${t.color} ~ '^#[0-9A-F]{6}$'`),
    check("bora_profiles_intensity", sql`${t.intensity} in ('leve', 'normal', 'forte')`),
    check("bora_profiles_weekly_goal", sql`${t.weeklyGoal} between 1 and 7`),
    check(
      "bora_profiles_minutes_pref",
      sql`${t.minutesPref} is null or ${t.minutesPref} in (10, 20, 30)`,
    ),
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
    /**
     * Quanto o nível atual está pesando: sobe com treino sem a meta batida (+1) ou marcado como
     * "difícil" (+2), e zera com a meta batida. A partir de 3, o app sugere descer.
     */
    struggle: integer("struggle").notNull().default(0),
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
    /** "Como foi?" no fim do treino; ajusta a progressão. Nulo = pulou a pergunta. */
    feeling: text("feeling"),
    /** Encerrou pelo botão Parar. Neutro de propósito: nenhum dado de dor ou de saúde. */
    endedEarly: boolean("ended_early").notNull().default(false),
    /** Treino feito junto, na vez de cada um: as sessões de cada perfil dividem o grupo. */
    groupId: uuid("group_id"),
    createdAt: time("created_at"),
  },
  (t) => [
    index("bora_sessions_profile_started").on(t.profileId, t.startedAt),
    index("bora_sessions_user_started").on(t.userId, t.startedAt),
    check("bora_sessions_mode", sql`${t.mode} in ('camera', 'manual', 'pareado')`),
    check("bora_sessions_duration", sql`${t.durationSeconds} between 0 and 14400`),
    check(
      "bora_sessions_feeling",
      sql`${t.feeling} is null or ${t.feeling} in ('facil', 'na_medida', 'dificil')`,
    ),
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

/**
 * Desafio da semana: o de cada perfil (`profileId`) e, se a família quiser somar junto, um da
 * família (`profileId` nulo). Um de cada por semana.
 */
export const boraChallenges = boraTreinar.table(
  "challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => boraFamilies.userId, { onDelete: "cascade" }),
    /** Perfil dono do desafio; nulo = desafio da família, somado por todos. */
    profileId: uuid("profile_id").references(() => boraProfiles.id, { onDelete: "cascade" }),
    /** Segunda-feira local, em data pura. */
    weekStart: date("week_start").notNull(),
    metric: text("metric").notNull(),
    /** Só quando a meta é de repetições de um exercício. */
    exerciseId: text("exercise_id"),
    target: integer("target").notNull(),
    createdAt: time("created_at"),
  },
  (t) => [
    uniqueIndex("bora_challenges_family_week")
      .on(t.userId, t.weekStart)
      .where(sql`${t.profileId} is null`),
    uniqueIndex("bora_challenges_profile_week")
      .on(t.profileId, t.weekStart)
      .where(sql`${t.profileId} is not null`),
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
