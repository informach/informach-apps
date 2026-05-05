import { Alert, AlertDescription, AlertTitle } from "@informach/ui/components/alert";
import { Button } from "@informach/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@informach/ui/components/card";
import { BookOpen, CreditCard, Sparkles, Star } from "lucide-react";
import Link from "next/link";
import { billing } from "@/features/billing/service";
import { NewRecipeButton } from "@/features/recipes/components/new-recipe-button";
import { RecipesGrid } from "@/features/recipes/components/recipes-grid";
import { FREE_RECIPE_LIMIT } from "@/features/recipes/limits";
import {
  countUserFavorites,
  countUserRecipes,
  listRecipesForUser,
} from "@/features/recipes/service";
import { requireUserServer } from "@/lib/auth";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const showWelcome = params.welcome === "1";

  const user = await requireUserServer();
  const subject = { type: "user" as const, id: user.id };

  const [recipeCount, favoriteCount, isPro, recipes] = await Promise.all([
    countUserRecipes(user.id),
    countUserFavorites(user.id),
    billing.hasProSubscription(subject),
    listRecipesForUser(user.id, 50),
  ]);

  const recipesSubtext = isPro
    ? recipeCount > 0
      ? "Total de receitas cadastradas."
      : "Comece criando sua primeira receita."
    : `${recipeCount} de ${FREE_RECIPE_LIMIT} no plano Free.`;

  const favoritesSubtext =
    favoriteCount > 0
      ? "Receitas marcadas como favoritas."
      : "Marque uma receita como favorita ao salvar.";

  return (
    <main className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8 md:px-8">
      {showWelcome && (
        <Alert>
          <Sparkles className="h-4 w-4" aria-hidden />
          <AlertTitle>Bem-vindo ao Cozya!</AlertTitle>
          <AlertDescription>
            Sua conta está pronta. Comece organizando suas primeiras receitas.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Minhas receitas</h1>
          <p className="text-sm text-muted-foreground">
            Comece salvando receitas e acompanhe seus créditos do Pro.
          </p>
        </div>
        <NewRecipeButton isPro={isPro} currentCount={recipeCount} />
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Receitas</CardTitle>
            <BookOpen className="size-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums tracking-tight">{recipeCount}</div>
            <p className="text-xs text-muted-foreground">{recipesSubtext}</p>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Favoritas</CardTitle>
            <Star className="size-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold tabular-nums tracking-tight">
              {favoriteCount}
            </div>
            <p className="text-xs text-muted-foreground">{favoritesSubtext}</p>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Plano e créditos
            </CardTitle>
            <CreditCard className="size-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Veja assinatura, portal de cobrança e histórico de créditos.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href="/settings/billing">Abrir billing</Link>
            </Button>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">Suas receitas</h2>
        <RecipesGrid recipes={recipes} />
      </section>
    </main>
  );
}
