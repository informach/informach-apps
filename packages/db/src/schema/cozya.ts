import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./core";

export const cozya = pgSchema("cozya");

export type CozyaIngredient = {
  original: string;
  name: string;
  quantity: number | null;
  unit: string;
  category: "hortifruti" | "mercearia" | "proteinas" | "laticinios" | "outros";
};

export const cozyaPlaceholderEntries = cozya.table("placeholder_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const cozyaRecipes = cozya.table(
  "recipes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    ingredients: text("ingredients").notNull(),
    preparation: text("preparation").notNull(),
    finishing: text("finishing"),
    servings: integer("servings"),
    totalMinutes: integer("total_minutes"),
    structuredIngredients: jsonb("structured_ingredients").$type<CozyaIngredient[]>(),
    sourceUrl: text("source_url"),
    sourceName: text("source_name"),
    isFavorite: boolean("is_favorite").notNull().default(false),
    creationMethod: text("creation_method", {
      enum: ["manual", "voice", "text", "image", "prompt"],
    })
      .notNull()
      .default("manual"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    contentUpdatedAt: timestamp("content_updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    check("cozya_recipes_servings_check", sql`${t.servings} between 1 and 100`),
    check("cozya_recipes_minutes_check", sql`${t.totalMinutes} between 1 and 10080`),
    index("cozya_recipes_user_created_idx").on(t.userId, t.createdAt),
    // Matches the ORDER BY of the dashboard list query
    // (`isFavorite DESC, createdAt DESC`). Lets Postgres serve the page from
    // an index scan instead of falling back to a runtime Sort.
    index("cozya_recipes_user_fav_created_idx").on(
      t.userId,
      t.isFavorite.desc(),
      t.createdAt.desc(),
    ),
    index("cozya_recipes_name_unaccent_trgm_idx").using(
      "gin",
      sql`cozya.unaccent_immutable(${t.name}) gin_trgm_ops`,
    ),
  ],
);

export type CozyaRecipe = typeof cozyaRecipes.$inferSelect;
export type NewCozyaRecipe = typeof cozyaRecipes.$inferInsert;

export const cozyaProfiles = cozya.table(
  "profiles",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    householdSize: integer("household_size").notNull().default(2),
    preferences: text("preferences").notNull().default(""),
    trialStartedAt: timestamp("trial_started_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [check("cozya_profiles_household_check", sql`${t.householdSize} between 1 and 20`)],
);

// Pseudonymous claim prevents resetting the trial by deleting and recreating an account.
export const cozyaTrialClaims = cozya.table("trial_claims", {
  emailHash: text("email_hash").primaryKey(),
  userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
});

export const cozyaMeals = cozya.table(
  "meals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    slot: text("slot", { enum: ["lunch", "dinner"] }).notNull(),
    recipeId: uuid("recipe_id").references(() => cozyaRecipes.id, { onDelete: "set null" }),
    label: text("label").notNull(),
    servings: integer("servings").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("cozya_meals_user_day_slot_idx").on(t.userId, t.day, t.slot),
    check("cozya_meals_servings_check", sql`${t.servings} between 1 and 100`),
    check("cozya_meals_slot_check", sql`${t.slot} in ('lunch', 'dinner')`),
  ],
);

export const cozyaShoppingLists = cozya.table(
  "shopping_lists",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    week: date("week").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("cozya_shopping_user_week_idx").on(t.userId, t.week)],
);

export const cozyaShoppingItems = cozya.table(
  "shopping_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listId: uuid("list_id")
      .notNull()
      .references(() => cozyaShoppingLists.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    amount: text("amount").notNull(),
    category: text("category").notNull(),
    note: text("note").notNull().default(""),
    state: text("state", { enum: ["todo", "have", "bought"] })
      .notNull()
      .default("todo"),
  },
  (t) => [
    uniqueIndex("cozya_shopping_items_list_key_idx").on(t.listId, t.key),
    check("cozya_shopping_items_state_check", sql`${t.state} in ('todo', 'have', 'bought')`),
  ],
);

export const cozyaCookingSessions = cozya.table(
  "cooking_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => cozyaRecipes.id, { onDelete: "cascade" }),
    recipeVersion: timestamp("recipe_version", { withTimezone: true }).notNull(),
    servings: integer("servings"),
    checkedIngredients: jsonb("checked_ingredients").$type<number[]>().notNull().default([]),
    completedSteps: jsonb("completed_steps").$type<number[]>().notNull().default([]),
    timerEndsAt: timestamp("timer_ends_at", { withTimezone: true }),
    cookedAt: timestamp("cooked_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("cozya_cooking_user_recipe_idx").on(t.userId, t.recipeId),
    check("cozya_cooking_servings_check", sql`${t.servings} between 1 and 100`),
  ],
);

export const cozyaProductEvents = cozya.table(
  "product_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    dedupKey: text("dedup_key").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("cozya_product_event_dedup_idx").on(t.dedupKey),
    index("cozya_product_event_name_time_idx").on(t.name, t.occurredAt),
  ],
);

export const cozyaAiOperations = cozya.table(
  "ai_operations",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    fingerprint: text("fingerprint").notNull(),
    response: jsonb("response").$type<unknown>(),
    statusCode: integer("status_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("cozya_ai_operations_expiry_idx").on(t.expiresAt)],
);
