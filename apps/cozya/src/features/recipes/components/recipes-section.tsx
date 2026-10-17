"use client";

import { Button } from "@informach/ui/components/button";
import { Input } from "@informach/ui/components/input";
import { cn } from "@informach/ui/lib/utils";
import { ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { RecipeFilter } from "../repository";
import type { RecipeSummary } from "../types";
import { NewRecipeButton } from "./new-recipe-button";
import { RecipeCard } from "./recipe-card";
import { RecipeVoiceSearch } from "./recipe-voice-search";

const SEARCH_DEBOUNCE_MS = 300;

const FILTERS: { value: RecipeFilter | null; label: string }[] = [
  { value: null, label: "Todas" },
  { value: "favoritas", label: "Favoritas" },
  { value: "rapidas", label: "Até 45 min" },
  { value: "rendem", label: "Rendem 4 ou mais" },
  { value: "tempo", label: "Faz tempo" },
];

type Props = {
  recipes: RecipeSummary[];
  isPro: boolean;
  currentCount: number;
  query: string;
  filter: RecipeFilter | null;
  page: number;
  hasNextPage: boolean;
  canUseAi: boolean;
  trialAvailable: boolean;
  weekRecipeIds: string[];
  credits: number | null;
  hasRecentPreviews: boolean;
  openBring: boolean;
};

function buildHref(query: string, filter: RecipeFilter | null, page: number): string {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (filter) params.set("filtro", filter);
  if (page > 1) params.set("page", String(page));
  const search = params.toString();
  return search ? `/receitas?${search}` : "/receitas";
}

export function RecipesSection({
  recipes,
  isPro,
  currentCount,
  query,
  filter,
  page,
  hasNextPage,
  canUseAi,
  trialAvailable,
  weekRecipeIds,
  credits,
  hasRecentPreviews,
  openBring,
}: Props) {
  const bring = (
    <NewRecipeButton
      isPro={isPro}
      canUseAi={canUseAi}
      trialAvailable={trialAvailable}
      currentCount={currentCount}
      credits={credits}
      hasRecentPreviews={hasRecentPreviews}
      defaultOpen={openBring}
    />
  );

  if (currentCount === 0 && !query && !filter)
    return (
      <div className="space-y-4">
        {bring}
        <div className="space-y-2 rounded-3xl border-[1.5px] border-dashed border-input p-6 text-center md:p-8">
          <p className="text-lg font-extrabold">Ainda não tem receitas aqui.</p>
          <p className="text-muted-foreground">
            Traga a receita do caderno, o print guardado ou escreva do seu jeito. Ou comece pela
            coleção logo abaixo.
          </p>
        </div>
      </div>
    );

  return (
    <div className="space-y-4">
      {bring}
      <SearchBar
        canUseAi={canUseAi}
        trialAvailable={trialAvailable}
        initialQuery={query}
        filter={filter}
      />
      <nav aria-label="Filtros" className="flex flex-wrap gap-2">
        {FILTERS.map((item) => {
          const active = item.value === filter;
          return (
            <Link
              key={item.label}
              href={buildHref(query, item.value, 1)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-full border-[1.5px] px-3.5 text-sm font-bold outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "border-foreground bg-secondary text-secondary-foreground"
                  : "border-border bg-card hover:border-input",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <p role="status" className="text-sm font-bold text-muted-foreground">
        {filter === "tempo"
          ? `${recipes.length} ${recipes.length === 1 ? "receita que você não faz" : "receitas que você não faz"} há mais de um mês`
          : query
            ? `${recipes.length} ${recipes.length === 1 ? "receita" : "receitas"} com “${query}”`
            : `${recipes.length} ${recipes.length === 1 ? "receita" : "receitas"}`}
      </p>

      {recipes.length === 0 ? (
        <div className="space-y-1 rounded-2xl bg-muted p-5 text-center">
          <p className="font-bold">Nenhuma receita por aqui.</p>
          <p className="text-sm text-muted-foreground">
            {query ? "Tente outra palavra, um ingrediente ou outro filtro." : "Tente outro filtro."}
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {recipes.map((recipe) => (
            <li key={recipe.id} className="flex">
              <RecipeCard recipe={recipe} inWeek={weekRecipeIds.includes(recipe.id)} />
            </li>
          ))}
        </ul>
      )}

      {page > 1 || hasNextPage ? (
        <Pagination query={query} filter={filter} page={page} hasNextPage={hasNextPage} />
      ) : null}
    </div>
  );
}

function Pagination({
  query,
  filter,
  page,
  hasNextPage,
}: {
  query: string;
  filter: RecipeFilter | null;
  page: number;
  hasNextPage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingDirection, setPendingDirection] = useState<"prev" | "next" | null>(null);

  const goTo = (direction: "prev" | "next", targetPage: number) => {
    setPendingDirection(direction);
    startTransition(() => {
      router.push(buildHref(query, filter, targetPage), { scroll: false });
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
          className="min-h-11"
          onClick={() => goTo("prev", page - 1)}
          disabled={isPending}
        >
          {pendingDirection === "prev" ? (
            <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
          ) : (
            <ChevronLeft className="mr-2 size-4" aria-hidden />
          )}
          Anteriores
        </Button>
      ) : (
        <span aria-hidden />
      )}
      <span className="text-xs text-muted-foreground">Página {page}</span>
      {hasNextPage ? (
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => goTo("next", page + 1)}
          disabled={isPending}
        >
          Mais receitas
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

function SearchBar({
  canUseAi,
  trialAvailable,
  initialQuery,
  filter,
}: {
  canUseAi: boolean;
  trialAvailable: boolean;
  initialQuery: string;
  filter: RecipeFilter | null;
}) {
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
      router.replace(buildHref(next, filter, 1), { scroll: false });
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
    <div className="relative">
      <Search
        className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        type="search"
        name="q"
        placeholder="Nome ou ingrediente: frango, abobrinha"
        value={value}
        onChange={onChange}
        className="h-12 rounded-xl bg-card pr-14 pl-10"
        aria-label="Buscar receitas pelo nome ou ingrediente"
        autoComplete="off"
      />
      <div className="absolute top-1/2 right-1.5 -translate-y-1/2">
        <RecipeVoiceSearch
          isPro={canUseAi}
          trialAvailable={trialAvailable}
          onTranscribed={onTranscribed}
        />
      </div>
    </div>
  );
}
