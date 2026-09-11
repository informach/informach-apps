import type { cozyaCookingSessions, cozyaMeals, cozyaShoppingItems } from "@informach/db/schema";

export type CookingSession = typeof cozyaCookingSessions.$inferSelect;
export type Meal = typeof cozyaMeals.$inferSelect;
export type ShoppingItem = typeof cozyaShoppingItems.$inferSelect;
