import { addDays } from "./dates";

type MealLike = { day: string; slot: "lunch" | "dinner"; lunchboxServings: number };

/**
 * The lunchboxes that are lunch on `day`: the portions set aside at the previous day's lunch
 * and dinner, lunch first. They are derived from those meals and never saved as meals of their
 * own, so the promise of the editor ("A marmita aparece no almoço de sexta") holds for both.
 */
export function lunchboxesFor<T extends MealLike>(day: string, meals: readonly T[]): T[] {
  const previous = addDays(day, -1);
  return meals
    .filter((meal) => meal.day === previous && meal.lunchboxServings > 0)
    .sort((a, b) => (a.slot === b.slot ? 0 : a.slot === "lunch" ? -1 : 1));
}
