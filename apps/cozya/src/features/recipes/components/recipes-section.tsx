"use client";

import { Button } from "@informach/ui/components/button";
import { Card, CardContent } from "@informach/ui/components/card";
import { Input } from "@informach/ui/components/input";
import { ChefHat, ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { RecipeSummary } from "../types";
import { NewRecipeButton } from "./new-recipe-button";
import { RecipeCard } from "./recipe-card";
import { RecipeVoiceSearch } from "./recipe-voice-search";

type Props = {
  recipes: RecipeSummary[];
  isPro: boolean;
  currentCount: number;
  query: string;
  page: number;
  hasNextPage: boolean;
};

const SEARCH_DEBOUNCE_MS = 300;

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
        <SearchBar isPro={isPro} initialQuery={query} />
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
        <Pagination query={query} page={page} hasNextPage={hasNextPage} />
      ) : null}
    </div>
  );
}

function Pagination({
  query,
  page,
  hasNextPage,
}: {
  query: string;
  page: number;
  hasNextPage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingDirection, setPendingDirection] = useState<"prev" | "next" | null>(null);

  const goTo = (direction: "prev" | "next", targetPage: number) => {
    setPendingDirection(direction);
    startTransition(() => {
      router.push(buildDashboardHref(query, targetPage), { scroll: false });
    });
  };

  // Clear the per-direction marker after the transition resolves so a fresh
  // click on the same button repaints the spinner instead of staying frozen.
  useEffect(() => {
    if (!isPending) setPendingDirection(null);
  }, [isPending]);

  return (
    <div className="flex items-center justify-between gap-3 pt-1">
      {page > 1 ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => goTo("prev", page - 1)}
          disabled={isPending}
        >
          {pendingDirection === "prev" ? (
            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
          ) : (
            <ChevronLeft className="mr-2 size-4" aria-hidden />
          )}
          Anterior
        </Button>
      ) : (
        <span aria-hidden />
      )}
      <span className="text-xs text-muted-foreground">Página {page}</span>
      {hasNextPage ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => goTo("next", page + 1)}
          disabled={isPending}
        >
          Próxima
          {pendingDirection === "next" ? (
            <Loader2 className="ml-2 size-4 animate-spin" aria-hidden />
          ) : (
            <ChevronRight className="ml-2 size-4" aria-hidden />
          )}
        </Button>
      ) : (
        <span aria-hidden />
      )}
    </div>
  );
}

function SearchBar({ isPro, initialQuery }: { isPro: boolean; initialQuery: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [value, setValue] = useState(initialQuery);
  const lastPushedRef = useRef(initialQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setValue(initialQuery);
    lastPushedRef.current = initialQuery;
  }, [initialQuery]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const navigate = (next: string) => {
    if (lastPushedRef.current === next) return;
    lastPushedRef.current = next;
    startTransition(() => {
      router.replace(buildDashboardHref(next, 1), { scroll: false });
    });
  };

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value;
    setValue(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => navigate(next), SEARCH_DEBOUNCE_MS);
  };

  const onTranscribed = (text: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setValue(text);
    navigate(text);
  };

  return (
    <div className="relative flex-1">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        name="q"
        placeholder="O que vamos fazer?"
        value={value}
        onChange={onChange}
        className="h-12 pl-10 pr-14"
        aria-label="Buscar receitas pelo título"
        autoComplete="off"
      />
      <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
        <RecipeVoiceSearch isPro={isPro} onTranscribed={onTranscribed} />
      </div>
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
