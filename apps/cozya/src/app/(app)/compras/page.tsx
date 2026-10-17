import { Button } from "@informach/ui/components/button";
import Link from "next/link";
import { getKitchenAccess } from "@/features/kitchen/access";
import { FirstWeekSteps } from "@/features/kitchen/components/first-week-steps";
import { GenerateListButton } from "@/features/kitchen/components/generate-list-button";
import { ShoppingList } from "@/features/kitchen/components/shopping-list";
import { weekRangeLabel, weekStart } from "@/features/kitchen/dates";
import { getShoppingList, getWeekMeals } from "@/features/kitchen/repository";
import { weekSchema } from "@/features/kitchen/schemas";
import { requireUserServer } from "@/lib/auth";

export const metadata = { title: "Lista do mercado | Cozya" };

export default async function ShoppingPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; fase?: string; primeira?: string }>;
}) {
  const [user, params] = await Promise.all([requireUserServer(), searchParams]);
  const week = weekSchema.safeParse(params.week).data ?? weekStart();
  const [access, list, meals] = await Promise.all([
    getKitchenAccess(user.id),
    getShoppingList(user.id, week),
    getWeekMeals(user.id, week),
  ]);
  const withRecipe = meals.filter((meal) => meal.recipeId).length;
  const freeMeals = meals.length - withRecipe;
  const toBuy = list?.items.filter((item) => item.category !== "despensa").length ?? 0;
  const range = weekRangeLabel(week);
  const initialPhase =
    params.fase === "mercado" || params.fase === "antes"
      ? params.fase
      : list?.items.some((item) => item.state === "bought")
        ? "mercado"
        : "antes";
  return (
    <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-5 md:px-8 md:py-10">
      {params.primeira === "1" && list && <FirstWeekSteps step={3} />}
      {list ? (
        <ShoppingList
          key={list.id}
          listId={list.id}
          week={week}
          weekLabel={range}
          subtitle={`${toBuy} ${toBuy === 1 ? "item" : "itens"} para ${withRecipe} ${withRecipe === 1 ? "refeição" : "refeições"} · ${range}`}
          items={list.items}
          canPlan={access.canPlan}
          stale={list.stale}
          initialPhase={initialPhase}
        />
      ) : (
        <>
          <div>
            <h1 className="text-[30px] font-extrabold leading-tight tracking-display md:text-4xl">
              Lista do mercado
            </h1>
            <p className="text-sm text-muted-foreground">{range}</p>
          </div>
          <div className="space-y-4 rounded-3xl border-[1.5px] border-dashed border-input p-6 md:p-8">
            <h2 className="text-xl font-extrabold">A lista nasce da semana.</h2>
            <p className="text-muted-foreground">
              {withRecipe
                ? "As receitas desta semana já estão escolhidas. Monte a lista: o que se repete vira uma linha só, e o que é de despensa vem numa pergunta."
                : "Coloque receitas nos dias e monte a lista: o que se repete vira uma linha só, e o que é de despensa vem numa pergunta."}
            </p>
            {withRecipe && access.canPlan ? (
              <GenerateListButton week={week} />
            ) : (
              <Button asChild className="min-h-11">
                <Link href={`/semana?week=${week}`}>Escolher as refeições</Link>
              </Button>
            )}
          </div>
        </>
      )}
      {freeMeals > 0 && (
        <p className="text-sm text-muted-foreground print:hidden">
          {freeMeals === 1
            ? "Uma refeição sem receita não entra na lista."
            : `${freeMeals} refeições sem receita não entram na lista.`}{" "}
          Se precisar de algo para elas, adicione em “Algo mais para a casa”.
        </p>
      )}
    </main>
  );
}
