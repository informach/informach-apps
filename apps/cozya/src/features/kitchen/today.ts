import "server-only";
import { addDays, localDay, weekdayName, weekdayShort, weekStart } from "./dates";
import { parseIngredients, shoppingKeyFor } from "./ingredients";
import {
  getCookingSessions,
  getMealsBetween,
  getRecipesByIds,
  getShoppingList,
} from "./repository";
import type { CookingSession, Meal } from "./types";

type Recipe = Awaited<ReturnType<typeof getRecipesByIds>>[number];

export type TodayMeal = {
  day: string;
  slot: "lunch" | "dinner";
  /** A planned meal, or the lunchbox set aside at yesterday's dinner. */
  kind: "planned" | "lunchbox";
  label: string;
  recipeId: string | null;
  servings: number;
  lunchboxServings: number;
  totalMinutes: number | null;
  note: string | null;
  verdict: "again" | "tweak" | "skip" | null;
  cookedToday: boolean;
  /** "20h10" when it was cooked today. */
  cookedTime: string | null;
};

export type WeekDot = {
  day: string;
  short: string;
  isToday: boolean;
  planned: boolean;
  state: "past" | "past-empty" | "today" | "planned" | "free";
};

function hourInSaoPaulo(now = new Date()) {
  return Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      hour12: false,
    }).format(now),
  );
}

function listPhrase(values: string[]) {
  if (values.length <= 1) return values[0] ?? "";
  return `${values.slice(0, -1).join(", ")} e ${values.at(-1)}`;
}

function mealsOf(
  day: string,
  meals: Meal[],
  recipes: Recipe[],
  sessions: CookingSession[],
  today: string,
): TodayMeal[] {
  const planned = meals.filter((meal) => meal.day === day);
  const toView = (meal: Meal): TodayMeal => {
    const recipe = recipes.find((item) => item.id === meal.recipeId);
    const session = sessions.find((item) => item.recipeId === meal.recipeId);
    const cookedToday =
      !!session?.cookedAt && localDay(session.cookedAt) === today && day === today;
    return {
      day,
      slot: meal.slot,
      kind: "planned",
      label: meal.label,
      recipeId: meal.recipeId,
      servings: meal.servings,
      lunchboxServings: meal.lunchboxServings,
      totalMinutes: recipe?.totalMinutes ?? null,
      note: session?.note ?? null,
      verdict: session?.verdict ?? null,
      cookedToday,
      cookedTime:
        cookedToday && session?.cookedAt
          ? new Intl.DateTimeFormat("pt-BR", {
              timeZone: "America/Sao_Paulo",
              hour: "2-digit",
              minute: "2-digit",
            })
              .format(session.cookedAt)
              .replace(":", "h")
          : null,
    };
  };
  const result = planned.map(toView);
  const previousDinner = meals.find(
    (meal) => meal.day === addDays(day, -1) && meal.slot === "dinner" && meal.lunchboxServings > 0,
  );
  if (previousDinner && !planned.some((meal) => meal.slot === "lunch"))
    result.unshift({
      ...toView(previousDinner),
      day,
      slot: "lunch",
      kind: "lunchbox",
      servings: previousDinner.lunchboxServings,
      lunchboxServings: 0,
      cookedToday: false,
      cookedTime: null,
    });
  return result.sort((a, b) => (a.slot === b.slot ? 0 : a.slot === "lunch" ? -1 : 1));
}

export async function getTodayData(userId: string, now = new Date()) {
  const today = localDay(now);
  const tomorrow = addDays(today, 1);
  const week = weekStart(today);
  const from = addDays(today, -1) < week ? addDays(today, -1) : week;
  const to = addDays(week, 7) > addDays(tomorrow, 1) ? addDays(week, 7) : addDays(tomorrow, 1);
  const meals = await getMealsBetween(userId, from, to);
  const recipeIds = [...new Set(meals.flatMap((meal) => (meal.recipeId ? [meal.recipeId] : [])))];
  const [recipes, sessions, list] = await Promise.all([
    getRecipesByIds(userId, recipeIds),
    getCookingSessions(userId, recipeIds),
    getShoppingList(userId, week),
  ]);

  const todayMeals = mealsOf(today, meals, recipes, sessions, today);
  const tomorrowMeals = mealsOf(tomorrow, meals, recipes, sessions, today);
  const dinner = todayMeals.find((meal) => meal.slot === "dinner" && meal.kind === "planned");
  const lunch = todayMeals.find((meal) => meal.slot === "lunch");
  const evening = !!dinner?.cookedToday;
  const hero = evening
    ? null
    : lunch && lunch.kind === "planned" && !lunch.cookedToday && hourInSaoPaulo(now) < 15
      ? lunch
      : // Yesterday's lunchbox is already cooked: it shows under "Também hoje", never as the meal to cook.
        (dinner ?? (lunch && lunch.kind === "planned" && !lunch.cookedToday ? lunch : null));

  // After tonight's dinner is cooked, the page turns to tomorrow.
  const next = evening
    ? (tomorrowMeals.find((meal) => meal.slot === "dinner" && meal.kind === "planned") ??
      tomorrowMeals.find((meal) => meal.kind === "planned") ??
      null)
    : hero;
  // What that recipe needs that is still unchecked on this week's list.
  const heroRecipe = recipes.find((recipe) => recipe.id === next?.recipeId);
  const keys = new Set(
    heroRecipe
      ? parseIngredients(heroRecipe.ingredients).flatMap((item) => {
          const key = shoppingKeyFor(item);
          return key ? [key] : [];
        })
      : [],
  );
  // After Sunday's dinner, "next" is Monday: its ingredients are on next week's list.
  const nextList =
    next && weekStart(next.day) !== week
      ? await getShoppingList(userId, weekStart(next.day))
      : list;
  const missing = (nextList?.items ?? []).filter(
    (item) => keys.has(item.key) && item.state === "todo",
  );

  const listItems = (list?.items ?? []).filter(
    (item) => item.category !== "despensa" || item.state === "todo",
  );
  const weekDays: WeekDot[] = Array.from({ length: 7 }, (_, index) => {
    const day = addDays(week, index);
    const has = meals.some((meal) => meal.day === day);
    return {
      day,
      short: weekdayShort(day),
      isToday: day === today,
      planned: has,
      state:
        day === today
          ? "today"
          : day < today
            ? has
              ? "past"
              : "past-empty"
            : has
              ? "planned"
              : "free",
    };
  });
  const openDays = weekDays
    .filter((dot) => dot.state === "free")
    .map((dot) => weekdayName(dot.day));

  return {
    today,
    tomorrow,
    week,
    todayMeals,
    tomorrowMeals,
    hero,
    next,
    evening: evening ? dinner : null,
    missing: missing.map((item) => ({ id: item.id, name: item.name.toLocaleLowerCase("pt-BR") })),
    missingPhrase: listPhrase(missing.map((item) => item.name.toLocaleLowerCase("pt-BR"))),
    weekDays,
    openDaysPhrase: openDays.length
      ? `${listPhrase(openDays).replace(/^./, (c) => c.toUpperCase())} ${openDays.length === 1 ? "ainda está" : "ainda estão"} em aberto.`
      : null,
    firstOpenDay: weekDays.find((dot) => dot.state === "free")?.day ?? null,
    list: list
      ? {
          stale: list.stale,
          total: listItems.length,
          todo: listItems.filter((item) => item.state === "todo").length,
        }
      : null,
  };
}

export type TodayData = Awaited<ReturnType<typeof getTodayData>>;
