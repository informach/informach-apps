import { addDays, weekStart } from "./dates";

/**
 * The days of the first dinners. The shopping list goes from Monday to Sunday, and the first
 * week promises "três receitas, três dias e a lista do mercado": one list with every dinner.
 * So the dinners start today when they all fit before Sunday ends; when they do not (a start
 * on Saturday or Sunday, or four dinners from Friday), the first week is the next one, from
 * Monday, the week the household is about to shop for.
 */
export function firstWeekDays(today: string, count: number): string[] {
  const fits = weekStart(addDays(today, count - 1)) === weekStart(today);
  const start = fits ? today : addDays(weekStart(today), 7);
  return Array.from({ length: count }, (_, index) => addDays(start, index));
}
