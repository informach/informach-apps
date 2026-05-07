import { sql } from "drizzle-orm";
import { boolean, index, pgSchema, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./core";

export const cozya = pgSchema("cozya");

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
    isFavorite: boolean("is_favorite").notNull().default(false),
    creationMethod: text("creation_method", {
      enum: ["manual", "voice", "text", "image", "prompt"],
    })
      .notNull()
      .default("manual"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
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
