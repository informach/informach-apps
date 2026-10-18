import "server-only";
import { addDays, localDay, weekdayName, weekdayShort, weekStart } from "./dates";
import { lunchboxesFor } from "./lunchbox";
import { checkMealOnList, mealShoppingKeys } from "./meal-shopping";
import {
  getCookingSessions,
  getMealsBetween,
  getRecipesByIds,
  getShoppingList,
} from "./repository";
import type { CookingSession, Meal } from "./types";

type Recipe = Awaited<ReturnType<typeof getRecipesByIds>>[number];

export type TodayMeal = {
  /** The meal id, or the id of the meal the lunchbox came from. */
  key: string;
  day: string;
  slot: "lunch" | "dinner";
  /** A planned meal, or the lunchbox set aside at yesterday's lunch or dinner. */
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
  /** Planned, but only with meals that have no recipe: "Sexta é pedir comida". */
  state: "past" | "past-empty" | "today" | "planned" | "no-recipe" | "free";
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
      key: meal.id,
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
  // What yesterday's lunch and dinner set aside is today's lunch, next to any lunch planned.
  const lunchboxes = lunchboxesFor(day, meals).map(
    (source): TodayMeal => ({
      ...toView(source),
      key: `lunchbox:${source.id}`,
      day,
      slot: "lunch",
      kind: "lunchbox",
      servings: source.lunchboxServings,
      lunchboxServings: 0,
      cookedToday: false,
      cookedTime: null,
    }),
  );
  return [...lunchboxes, ...planned.map(toView)].sort((a, b) =>
    a.slot === b.slot ? 0 : a.slot === "lunch" ? -1 : 1,
  );
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
  // Yesterday's lunchbox is already cooked: it shows under "Também hoje", never as the meal to cook.
  const lunch = todayMeals.find((meal) => meal.slot === "lunch" && meal.kind === "planned");
  const evening = !!dinner?.cookedToday;
  const hero = evening
    ? null
    : lunch && !lunch.cookedToday && hourInSaoPaulo(now) < 15
      ? lunch
      : (dinner ?? (lunch && !lunch.cookedToday ? lunch : null));

  // After tonight's dinner is cooked, the page turns to tomorrow.
  const next = evening
    ? (tomorrowMeals.find((meal) => meal.slot === "dinner" && meal.kind === "planned") ??
      tomorrowMeals.find((meal) => meal.kind === "planned") ??
      null)
    : hero;
  // What the list of that meal's week says about it. After Sunday's dinner, "next" is Monday:
  // its ingredients are on next week's list.
  const nextWeek = next ? weekStart(next.day) : week;
  const nextRecipe = recipes.find((recipe) => recipe.id === next?.recipeId);
  const onList =
    next && nextRecipe
      ? checkMealOnList(
          mealShoppingKeys(nextRecipe, next.servings),
          nextWeek === week ? list : await getShoppingList(userId, nextWeek),
        )
      : null;
  const missing = onList?.state === "missing" ? onList.items : [];

  const listItems = (list?.items ?? []).filter(
    (item) => item.category !== "despensa" || item.state === "todo",
  );
  const weekDays: WeekDot[] = Array.from({ length: 7 }, (_, index) => {
    const day = addDays(week, index);
    const ofDay = meals.filter((meal) => meal.day === day);
    const has = ofDay.length > 0;
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
            : !has
              ? "free"
              : ofDay.every((meal) => !meal.recipeId)
                ? "no-recipe"
                : "planned",
    };
  });
  const openDays = weekDays
    .filter((dot) => dot.state === "free")
    .map((dot) => weekdayName(dot.day));
  // "Sexta é pedir comida.": the days ahead that are decided without a recipe.
  const noRecipePhrases = weekDays
    .filter((dot) => dot.state === "no-recipe")
    .slice(0, 2)
    .map((dot) => {
      const labels = [
        ...new Set(
          meals
            .filter((meal) => meal.day === dot.day)
            .map((meal) => meal.label.toLocaleLowerCase("pt-BR")),
        ),
      ];
      const name = weekdayName(dot.day);
      return `${name.charAt(0).toUpperCase()}${name.slice(1)} é ${listPhrase(labels)}.`;
    });

  return {
    today,
    tomorrow,
    week,
    todayMeals,
    tomorrowMeals,
    hero,
    next,
    evening: evening ? dinner : null,
    /** The week of the list that holds the next meal: next week's after Sunday's dinner. */
    nextWeek,
    /** "complete" only when that list is up to date, has the whole recipe and nothing to buy. */
    nextOnList: onList?.state ?? null,
    missing: missing.map((item) => ({ id: item.id, name: item.name.toLocaleLowerCase("pt-BR") })),
    missingPhrase: listPhrase(missing.map((item) => item.name.toLocaleLowerCase("pt-BR"))),
    weekDays,
    weekPhrase: [
      ...noRecipePhrases,
      openDays.length
        ? `${listPhrase(openDays).replace(/^./, (c) => c.toUpperCase())} ${openDays.length === 1 ? "ainda está" : "ainda estão"} em aberto.`
        : null,
    ]
      .filter(Boolean)
      .join(" "),
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
