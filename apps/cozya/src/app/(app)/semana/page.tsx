import { getKitchenAccess } from "@/features/kitchen/access";
import { WeekNavigation } from "@/features/kitchen/components/week-navigation";
import { WeekPlanner } from "@/features/kitchen/components/week-planner";
import { weekStart } from "@/features/kitchen/dates";
import { getRecipeChoices, getWeekMeals } from "@/features/kitchen/repository";
import { weekSchema } from "@/features/kitchen/schemas";
import { requireUserServer } from "@/lib/auth";

export const metadata = { title: "Minha semana | Cozya" };
export default async function WeekPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const [user, params] = await Promise.all([requireUserServer(), searchParams]);
  const week = weekSchema.safeParse(params.week).data ?? weekStart();
  const [access, recipes, meals] = await Promise.all([
    getKitchenAccess(user.id),
    getRecipeChoices(user.id),
    getWeekMeals(user.id, week),
  ]);
  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 md:px-8">
      <div>
        <p className="text-sm font-medium text-muted-foreground">A semana à mesa</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">O que vamos cozinhar?</h1>
        <p className="mt-2 text-muted-foreground">
          Jantares, almoços e marmitas decididos em um só lugar.
        </p>
      </div>
      <WeekNavigation week={week} path="/semana" />
      <WeekPlanner
        week={week}
        meals={meals}
        recipes={recipes}
        canPlan={access.canPlan}
        householdSize={access.profile?.householdSize ?? 2}
      />
    </main>
  );
}
