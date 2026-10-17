import { getKitchenAccess } from "@/features/kitchen/access";
import { WeekNavigation } from "@/features/kitchen/components/week-navigation";
import { WeekPlanner } from "@/features/kitchen/components/week-planner";
import { addDays, localDay, weekStart } from "@/features/kitchen/dates";
import {
  getMealsBetween,
  getRecipeChoices,
  getShoppingList,
  getWeekMeals,
} from "@/features/kitchen/repository";
import { daySchema, weekSchema } from "@/features/kitchen/schemas";
import { requireUserServer } from "@/lib/auth";

export const metadata = { title: "Semana | Cozya" };

function parseEdit(value: string | undefined) {
  const [day, slot] = (value ?? "").split(":");
  if (!day || !daySchema.safeParse(day).success || (slot !== "lunch" && slot !== "dinner"))
    return null;
  return { day, slot } as const;
}

export default async function WeekPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; editar?: string }>;
}) {
  const [user, params] = await Promise.all([requireUserServer(), searchParams]);
  const edit = parseEdit(params.editar);
  const requested = weekSchema.safeParse(params.week).data ?? weekStart();
  // "Planejar amanhã" on a Sunday points to next week: open the week of the meal being edited.
  const week =
    edit && (edit.day < requested || edit.day >= addDays(requested, 7))
      ? weekStart(edit.day)
      : requested;
  const [access, recipes, meals, list, sunday] = await Promise.all([
    getKitchenAccess(user.id),
    getRecipeChoices(user.id),
    getWeekMeals(user.id, week),
    getShoppingList(user.id, week),
    getMealsBetween(user.id, addDays(week, -1), week),
  ]);
  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 px-4 py-6 md:px-8 md:py-10">
      <WeekNavigation week={week} path="/semana" />
      <WeekPlanner
        key={`${week}:${params.editar ?? ""}`}
        week={week}
        today={localDay()}
        meals={meals}
        recipes={recipes}
        canPlan={access.canPlan}
        trialAvailable={!access.isPro && !access.profile?.trialStartedAt}
        householdSize={access.profile?.householdSize ?? 2}
        initialEdit={edit}
        list={!list ? "none" : list.stale ? "stale" : "fresh"}
        carryOver={
          sunday.find((meal) => meal.slot === "dinner" && meal.lunchboxServings > 0) ?? null
        }
      />
    </main>
  );
}
