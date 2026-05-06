"use client";

import { Button } from "@informach/ui/components/button";
import { Card, CardContent } from "@informach/ui/components/card";
import { Input } from "@informach/ui/components/input";
import { ChefHat, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import Link from "next/link";
import type { Recipe } from "../repository";
import { NewRecipeButton } from "./new-recipe-button";
import { RecipeCard } from "./recipe-card";

type Props = {
  recipes: Recipe[];
  isPro: boolean;
  currentCount: number;
  query: string;
  page: number;
  hasNextPage: boolean;
};

export function RecipesSection({ recipes, isPro, currentCount, query, page, hasNextPage }: Props) {
  if (currentCount === 0 && !query) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-4">
        <div className="flex justify-end">
          <NewRecipeButton isPro={isPro} currentCount={currentCount} />
        </div>
        <Card className="rounded-2xl border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ChefHat className="size-6" aria-hidden />
            </span>
            <div className="space-y-1">
              <p className="text-base font-semibold text-foreground">Nenhuma receita ainda</p>
              <p className="text-sm text-muted-foreground">
                Clique em <span className="font-medium text-foreground">Nova receita</span> para
                começar.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <form action="/dashboard" className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                key={query}
                type="search"
                name="q"
                placeholder="Buscar pelo título..."
                defaultValue={query}
                className="pl-9"
                aria-label="Buscar receitas pelo título"
              />
            </div>
            <Button type="submit" size="icon" aria-label="Buscar">
              <Search className="size-4" aria-hidden />
            </Button>
            {query ? (
              <Button asChild variant="outline" size="icon" aria-label="Limpar busca">
                <Link href="/dashboard">
                  <X className="size-4" aria-hidden />
                </Link>
              </Button>
            ) : null}
          </form>
        </div>
        <NewRecipeButton isPro={isPro} currentCount={currentCount} />
      </div>

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Receitas salvas</h2>
        {query ? (
          <p className="truncate text-xs text-muted-foreground">Busca: &ldquo;{query}&rdquo;</p>
        ) : null}
      </div>

      {recipes.length === 0 ? (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <p className="text-sm font-medium text-foreground">
              {query
                ? `Nenhuma receita encontrada para "${query}".`
                : "Nenhuma receita nesta página."}
            </p>
            <p className="text-xs text-muted-foreground">
              {query
                ? "Tente outro termo ou verifique a digitação."
                : "Volte para a página anterior ou cadastre uma nova receita."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {recipes.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} isPro={isPro} currentCount={currentCount} />
          ))}
        </div>
      )}

      {page > 1 || hasNextPage ? (
        <div className="flex items-center justify-between gap-3 pt-1">
          {page > 1 ? (
            <Button asChild variant="outline" size="sm">
              <Link href={buildDashboardHref(query, page - 1)}>
                <ChevronLeft className="mr-2 size-4" aria-hidden />
                Anterior
              </Link>
            </Button>
          ) : (
            <span aria-hidden />
          )}
          <span className="text-xs text-muted-foreground">Página {page}</span>
          {hasNextPage ? (
            <Button asChild variant="outline" size="sm">
              <Link href={buildDashboardHref(query, page + 1)}>
                Próxima
                <ChevronRight className="ml-2 size-4" aria-hidden />
              </Link>
            </Button>
          ) : (
            <span aria-hidden />
          )}
        </div>
      ) : null}
    </div>
  );
}

function buildDashboardHref(query: string, page: number): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return search ? `/dashboard?${search}` : "/dashboard";
}
