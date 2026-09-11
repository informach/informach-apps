import { Alert, AlertDescription, AlertTitle } from "@informach/ui/components/alert";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import { getIsProForUser } from "@/features/billing/server-cache";
import { getKitchenAccess } from "@/features/kitchen/access";
import { StarterCollection } from "@/features/kitchen/components/starter-collection";
import { TrialBanner } from "@/features/kitchen/components/trial-banner";
import { RecipesSection } from "@/features/recipes/components/recipes-section";
import { countUserRecipes, listRecipesForUser } from "@/features/recipes/service";
import { requireUserServer } from "@/lib/auth";

const RECIPE_PAGE_SIZE = 50;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const showWelcome = params.welcome === "1";
  const recipeSearch = parseSingleParam(params.q).trim().slice(0, 120);
  const recipePage = parsePositiveInt(parseSingleParam(params.page)) ?? 1;

  const user = await requireUserServer();

  const [recipeCount, isPro, recipesPage, access] = await Promise.all([
    countUserRecipes(user.id),
    getIsProForUser(user.id),
    listRecipesForUser(user.id, {
      search: recipeSearch,
      page: recipePage,
      limit: RECIPE_PAGE_SIZE,
    }),
    getKitchenAccess(user.id),
  ]);

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

      <div className="mx-auto w-full max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Minhas receitas</h1>
        <p className="text-sm text-muted-foreground">
          Busque, salve e compartilhe suas receitas favoritas.
        </p>
      </div>

      <RecipesSection
        recipes={recipesPage.recipes}
        isPro={isPro}
        currentCount={recipeCount}
        query={recipeSearch}
        page={recipesPage.page}
        hasNextPage={recipesPage.hasNextPage}
        canUseAi={access.canUseAi}
      />
      <div className="mx-auto max-w-3xl text-sm">
        <Link
          href="/receitas/recuperar"
          className="inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Recuperar resultados recentes da IA
        </Link>
      </div>
      {!isPro && (
        <div className="mx-auto max-w-3xl">
          <TrialBanner
            active={access.trialActive}
            started={!!access.profile?.trialStartedAt}
            endsAt={access.trialEndsAt?.toLocaleDateString("pt-BR") ?? null}
          />
        </div>
      )}
      <StarterCollection isPro={isPro} currentCount={recipeCount} />
    </main>
  );
}

function parseSingleParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function parsePositiveInt(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return null;
  return parsed;
}
