import { Button } from "@informach/ui/components/button";
import Link from "next/link";
import { getKitchenAccess } from "@/features/kitchen/access";
import { ShoppingList } from "@/features/kitchen/components/shopping-list";
import { WeekNavigation } from "@/features/kitchen/components/week-navigation";
import { weekStart } from "@/features/kitchen/dates";
import { getShoppingList, getWeekMeals } from "@/features/kitchen/repository";
import { weekSchema } from "@/features/kitchen/schemas";
import { requireUserServer } from "@/lib/auth";

export const metadata = { title: "Compras da semana | Cozya" };
export default async function ShoppingPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const [user, params] = await Promise.all([requireUserServer(), searchParams]);
  const week = weekSchema.safeParse(params.week).data ?? weekStart();
  const [access, list, meals] = await Promise.all([
    getKitchenAccess(user.id),
    getShoppingList(user.id, week),
    getWeekMeals(user.id, week),
  ]);
  const freeMeals = meals.filter((meal) => !meal.recipeId);
  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 md:px-8">
      <div>
        <p className="text-sm text-muted-foreground">Da semana para o mercado</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Minhas compras</h1>
      </div>
      <WeekNavigation week={week} path="/compras" />
      {freeMeals.length > 0 && (
        <p className="rounded-xl border p-4 text-sm">
          {freeMeals.length} refeições livres não geraram ingredientes. Confira se precisa adicionar
          algo para elas.
        </p>
      )}
      {list ? (
        <ShoppingList listId={list.id} week={week} items={list.items} canPlan={access.canPlan} />
      ) : (
        <div className="space-y-4 rounded-2xl border border-dashed p-8">
          <h2 className="text-xl font-semibold">Sua lista começa no cardápio</h2>
          <p className="text-muted-foreground">
            Escolha as refeições e use “Gerar lista de compras”. Ingredientes compatíveis serão
            somados pelas porções planejadas.
          </p>
          <Button asChild className="min-h-11">
            <Link href={`/semana?week=${week}`}>Escolher refeições</Link>
          </Button>
        </div>
      )}
    </main>
  );
}
