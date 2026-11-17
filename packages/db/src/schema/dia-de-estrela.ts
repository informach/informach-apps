import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
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
import { familyAppProfiles, familyGroups } from "./family";

export const diaDeEstrela = pgSchema("dia_de_estrela");
const time = (name: string) => timestamp(name, { withTimezone: true }).defaultNow().notNull();
const moment = (name: string) => timestamp(name, { withTimezone: true });

/** Arquivo pequeno guardado no próprio banco (voz da tarefa, foto da meta). */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

export type EstrelaStep = { text: string; detail?: string };

/**
 * Household settings belong to the canonical group. The original creator is historical only.
 */
export const estrelaFamilies = diaDeEstrela.table(
  "families",
  {
    familyGroupId: uuid("family_group_id")
      .primaryKey()
      .references(() => familyGroups.id, { onDelete: "restrict" }),
    pinGeneration: uuid("pin_generation").defaultRandom().notNull(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    timezone: text("timezone").notNull().default("America/Sao_Paulo"),
    /** `scrypt$<sal>$<hash>`; nulo até o primeiro uso terminar. */
    pinHash: text("pin_hash"),
    pinUpdatedAt: moment("pin_updated_at"),
    starsPerReal: integer("stars_per_real").notNull().default(10),
    warnBefore: integer("warn_before").notNull().default(5),
    repeatEvery: integer("repeat_every").notNull().default(5),
    alertAfter: integer("alert_after").notNull().default(2),
    sound: boolean("sound").notNull().default(true),
    voice: boolean("voice").notNull().default(true),
    calm: boolean("calm").notNull().default(false),
    /** Estrelas da surpresa do baú do dia; 0 desliga a surpresa (o baú continua enchendo). */
    chestBonus: integer("chest_bonus").notNull().default(3),
    onboardedAt: moment("onboarded_at"),
    createdAt: time("created_at"),
  },
  (t) => [
    check("estrela_families_rate", sql`${t.starsPerReal} between 1 and 100`),
    check("estrela_families_warn", sql`${t.warnBefore} between 0 and 30`),
    check("estrela_families_repeat", sql`${t.repeatEvery} between 1 and 30`),
    check("estrela_families_alert", sql`${t.alertAfter} between 1 and 10`),
    check("estrela_families_chest", sql`${t.chestBonus} between 0 and 50`),
  ],
);

/** Criança da família: só apelido e cor, sem idade, nascimento ou foto. */
export const estrelaChildren = diaDeEstrela.table(
  "children",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Canonical identity; the native child ID and all history stay stable. */
    familyProfileId: uuid("family_profile_id")
      .notNull()
      .references(() => familyAppProfiles.id, { onDelete: "restrict" })
      .unique(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    position: integer("position").notNull().default(0),
    /** Criança escolhida para continuar ativa quando o plano comporta menos crianças. */
    accessEnabled: boolean("access_enabled").notNull().default(true),
    createdAt: time("created_at"),
  },
  (t) => [index("estrela_children_owner").on(t.userId, t.position)],
);

/** Aparelho da criança pareado à família. O token fica só como hash. */
export const estrelaDevices = diaDeEstrela.table(
  "devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyGroupId: uuid("family_group_id")
      .notNull()
      .references(() => familyGroups.id, { onDelete: "restrict" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    webParticipationRevision: integer("web_participation_revision").notNull().default(0),
    label: text("label").notNull(),
    expiresAt: moment("expires_at").notNull(),
    connectedAt: moment("connected_at"),
    lastSeenAt: moment("last_seen_at"),
    revokedAt: moment("revoked_at"),
    createdAt: time("created_at"),
  },
  (t) => [
    uniqueIndex("estrela_device_token").on(t.tokenHash),
    index("estrela_device_owner").on(t.userId),
    check("estrela_device_label", sql`char_length(${t.label}) between 2 and 60`),
    check("estrela_device_web_revision", sql`${t.webParticipationRevision} >= 0`),
  ],
);

export const estrelaDeviceChildren = diaDeEstrela.table(
  "device_children",
  {
    delegationKey: uuid("delegation_key").notNull(),
    readGrantId: uuid("read_grant_id").notNull(),
    writeGrantId: uuid("write_grant_id").notNull(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => estrelaDevices.id, { onDelete: "cascade" }),
    childId: uuid("child_id")
      .notNull()
      .references(() => estrelaChildren.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.deviceId, t.childId] }),
    index("estrela_device_child").on(t.childId),
  ],
);

/** Código de uso único para conectar um aparelho; só o HMAC fica guardado. */
export const estrelaPairingCodes = diaDeEstrela.table(
  "pairing_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deviceId: uuid("device_id")
      .notNull()
      .references(() => estrelaDevices.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    expiresAt: moment("expires_at").notNull(),
    consumedAt: moment("consumed_at"),
    createdAt: time("created_at"),
  },
  (t) => [
    uniqueIndex("estrela_pairing_code").on(t.codeHash),
    index("estrela_pairing_expiry").on(t.expiresAt),
  ],
);

/** Janelas de tentativas (código de aparelho por endereço, PIN por aparelho). */
export const estrelaAccessLimits = diaDeEstrela.table("access_limits", {
  key: text("key").primaryKey(),
  startedAt: moment("started_at").notNull(),
  attempts: integer("attempts").notNull(),
});

/** Tarefa da rotina de uma criança. Dias em bitmask: bit 0 = domingo … bit 6 = sábado. */
export const estrelaTasks = diaDeEstrela.table(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    childId: uuid("child_id")
      .notNull()
      .references(() => estrelaChildren.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    icon: text("icon").notNull(),
    time: text("time").notNull(),
    days: integer("days").notNull(),
    durationMin: integer("duration_min"),
    stars: integer("stars").notNull(),
    steps: jsonb("steps").$type<EstrelaStep[]>().notNull().default([]),
    needs: jsonb("needs").$type<string[]>().notNull().default([]),
    thenText: text("then_text"),
    detail: text("detail"),
    remind: boolean("remind").notNull().default(true),
    requiresApproval: boolean("requires_approval").notNull().default(false),
    createdAt: time("created_at"),
    updatedAt: time("updated_at"),
  },
  (t) => [
    index("estrela_tasks_child").on(t.childId),
    check("estrela_tasks_title", sql`char_length(${t.title}) between 1 and 40`),
    check("estrela_tasks_time", sql`${t.time} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
    check("estrela_tasks_days", sql`${t.days} between 1 and 127`),
    check("estrela_tasks_stars", sql`${t.stars} between 1 and 50`),
    check(
      "estrela_tasks_duration",
      sql`${t.durationMin} is null or ${t.durationMin} between 5 and 180`,
    ),
  ],
);

/** Voz gravada por um dos pais para chamar a criança na hora da tarefa. */
export const estrelaTaskVoices = diaDeEstrela.table(
  "task_voices",
  {
    taskId: uuid("task_id")
      .primaryKey()
      .references(() => estrelaTasks.id, { onDelete: "cascade" }),
    mime: text("mime").notNull(),
    data: bytea("data").notNull(),
    durationMs: integer("duration_ms").notNull(),
    updatedAt: time("updated_at"),
  },
  (t) => [
    check("estrela_voice_size", sql`octet_length(${t.data}) between 1 and 300000`),
    check("estrela_voice_duration", sql`${t.durationMs} between 1 and 15500`),
  ],
);

/** Uma tarefa feita num dia local da família. Estrelas pendentes só entram no extrato ao aprovar. */
export const estrelaCompletions = diaDeEstrela.table(
  "completions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    childId: uuid("child_id")
      .notNull()
      .references(() => estrelaChildren.id, { onDelete: "cascade" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => estrelaTasks.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    completedAt: time("completed_at"),
    markedBy: text("marked_by", { enum: ["child", "adult"] }).notNull(),
    status: text("status", { enum: ["approved", "pending"] }).notNull(),
    stars: integer("stars").notNull(),
    approvedAt: moment("approved_at"),
  },
  (t) => [
    uniqueIndex("estrela_completion_once").on(t.childId, t.taskId, t.date),
    index("estrela_completion_day").on(t.childId, t.date),
    check("estrela_completion_stars", sql`${t.stars} between 1 and 50`),
  ],
);

/**
 * Extrato de estrelas. Saldo = soma por criança. `sourceKey` é única e
 * identifica a origem (`task:<conclusão>`, `chest:<criança>:<data>`,
 * `redeem:<pedido>`, `bonus:<uuid>`): repetir a mesma operação não duplica.
 */
export const estrelaLedger = diaDeEstrela.table(
  "ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    childId: uuid("child_id")
      .notNull()
      .references(() => estrelaChildren.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["task", "bonus", "redeem", "chest"] }).notNull(),
    stars: integer("stars").notNull(),
    label: text("label").notNull(),
    sourceKey: text("source_key").notNull(),
    createdAt: time("created_at"),
  },
  (t) => [
    uniqueIndex("estrela_ledger_source").on(t.sourceKey),
    index("estrela_ledger_child").on(t.childId, t.createdAt),
    check("estrela_ledger_stars", sql`${t.stars} <> 0`),
  ],
);

/** Item da loja de recompensas da família. Itens de dinheiro custam conforme a taxa da casa. */
export const estrelaRewards = diaDeEstrela.table(
  "rewards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    familyGroupId: uuid("family_group_id")
      .notNull()
      .references(() => familyGroups.id, { onDelete: "restrict" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    kind: text("kind", { enum: ["money", "custom"] }).notNull(),
    name: text("name").notNull(),
    icon: text("icon").notNull(),
    /** Só para `custom`. */
    priceStars: integer("price_stars"),
    /** Só para `money`. */
    moneyCents: integer("money_cents"),
    active: boolean("active").notNull().default(true),
    position: integer("position").notNull().default(0),
    createdAt: time("created_at"),
  },
  (t) => [
    index("estrela_rewards_owner").on(t.userId, t.position),
    check("estrela_rewards_name", sql`char_length(${t.name}) between 1 and 40`),
    check(
      "estrela_rewards_price",
      sql`(${t.kind} = 'custom' and ${t.priceStars} between 1 and 100000 and ${t.moneyCents} is null) or (${t.kind} = 'money' and ${t.moneyCents} between 100 and 100000 and ${t.priceStars} is null)`,
    ),
  ],
);

/** Pedido feito na loja. As estrelas ficam guardadas até os pais entregarem ou recusarem. */
export const estrelaRedemptions = diaDeEstrela.table(
  "redemptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    childId: uuid("child_id")
      .notNull()
      .references(() => estrelaChildren.id, { onDelete: "cascade" }),
    rewardId: uuid("reward_id").references(() => estrelaRewards.id, { onDelete: "set null" }),
    label: text("label").notNull(),
    kind: text("kind", { enum: ["money", "custom"] }).notNull(),
    stars: integer("stars").notNull(),
    moneyCents: integer("money_cents"),
    status: text("status", { enum: ["pending", "delivered", "declined"] })
      .notNull()
      .default("pending"),
    requestedAt: time("requested_at"),
    resolvedAt: moment("resolved_at"),
  },
  (t) => [
    index("estrela_redemptions_child").on(t.childId, t.status),
    check("estrela_redemptions_stars", sql`${t.stars} > 0`),
  ],
);

/** A meta de uma criança (um item grande que ela está juntando). */
export const estrelaGoals = diaDeEstrela.table(
  "goals",
  {
    childId: uuid("child_id")
      .primaryKey()
      .references(() => estrelaChildren.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    stars: integer("stars").notNull(),
    photo: bytea("photo"),
    photoMime: text("photo_mime"),
    updatedAt: time("updated_at"),
  },
  (t) => [
    check("estrela_goals_name", sql`char_length(${t.name}) between 1 and 40`),
    check("estrela_goals_stars", sql`${t.stars} between 1 and 1000000`),
    check(
      "estrela_goals_photo",
      sql`${t.photo} is null or octet_length(${t.photo}) between 1 and 250000`,
    ),
  ],
);

/** Estado dos lembretes de uma tarefa num dia: alimentado pelo aparelho e pelos pais. */
export const estrelaReminderStates = diaDeEstrela.table(
  "reminder_states",
  {
    childId: uuid("child_id")
      .notNull()
      .references(() => estrelaChildren.id, { onDelete: "cascade" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => estrelaTasks.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    warnedAt: moment("warned_at"),
    dueCount: integer("due_count").notNull().default(0),
    lastDueAt: moment("last_due_at"),
    snoozeUntil: moment("snooze_until"),
    nudgeAt: moment("nudge_at"),
    updatedAt: time("updated_at"),
  },
  (t) => [
    primaryKey({ columns: [t.childId, t.taskId, t.date] }),
    check("estrela_reminder_count", sql`${t.dueCount} between 0 and 50`),
  ],
);

/** Alerta "não marcou" para os pais, um por tarefa por dia. */
export const estrelaParentAlerts = diaDeEstrela.table(
  "parent_alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    childId: uuid("child_id")
      .notNull()
      .references(() => estrelaChildren.id, { onDelete: "cascade" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => estrelaTasks.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    /** O aparelho da criança deu sinal nos últimos minutos quando o alerta nasceu? */
    deviceOnline: boolean("device_online").notNull(),
    createdAt: time("created_at"),
  },
  (t) => [uniqueIndex("estrela_alert_once").on(t.childId, t.taskId, t.date)],
);

export const estrelaPushSubscriptions = diaDeEstrela.table(
  "push_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: time("created_at"),
  },
  (t) => [
    uniqueIndex("estrela_push_endpoint").on(t.endpoint),
    index("estrela_push_user").on(t.userId),
  ],
);

/** Entregas de push, idempotentes por pessoa e chave da mensagem. */
export const estrelaNotificationDeliveries = diaDeEstrela.table(
  "notification_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    messageKey: text("message_key").notNull(),
    webParticipationRevision: integer("web_participation_revision").notNull().default(0),
    status: text("status", { enum: ["processing", "sent", "failed"] })
      .notNull()
      .default("processing"),
    attempts: integer("attempts").notNull().default(0),
    lastAttemptAt: moment("last_attempt_at"),
    sentAt: moment("sent_at"),
    createdAt: time("created_at"),
  },
  (t) => [
    uniqueIndex("estrela_delivery_once").on(t.userId, t.messageKey),
    check("estrela_delivery_web_revision", sql`${t.webParticipationRevision} >= 0`),
  ],
);
