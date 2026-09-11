"use client";

import { Button } from "@informach/ui/components/button";
import { Checkbox } from "@informach/ui/components/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@informach/ui/components/dialog";
import { cn } from "@informach/ui/lib/utils";
import { Share2, Star, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { buildWhatsappShareUrl, parseIngredients } from "../share";
import type { Recipe } from "../types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipe: Recipe;
};

export function RecipeViewDialog({ open, onOpenChange, recipe }: Props) {
  const ingredients = parseIngredients(recipe.ingredients);
  const ingredientItems = buildIngredientItems(ingredients);
  const finishing = recipe.finishing?.trim();

  // Estado efêmero — ajuda quem está cozinhando a marcar visualmente os
  // ingredientes que já pegou. Reset a cada abertura do dialog; sem persistência.
  const [checkedKeys, setCheckedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) setCheckedKeys(new Set());
  }, [open]);

  const toggleIngredient = (key: string, next: boolean) => {
    setCheckedKeys((prev) => {
      const updated = new Set(prev);
      if (next) updated.add(key);
      else updated.delete(key);
      return updated;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[90vh] gap-6 overflow-y-auto rounded-2xl sm:max-w-lg"
      >
        <DialogHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <DialogTitle className="flex flex-1 items-center gap-2 pt-1 text-left text-xl font-semibold leading-tight">
            {recipe.name}
            {recipe.isFavorite ? (
              <Star className="size-4 shrink-0 text-brand-ink" fill="currentColor" aria-hidden />
            ) : null}
          </DialogTitle>
          <div className="flex shrink-0 items-center gap-2">
            {/* Verde oficial do WhatsApp (#25D366): exceção intencional ao tema para gerar identificação imediata da ação. */}
            <Button
              asChild
              size="icon"
              className="size-11 rounded-full bg-[#25D366] text-[#173248] shadow-sm hover:bg-[#1ebe57]"
            >
              <a
                href={buildWhatsappShareUrl(recipe)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Compartilhar no WhatsApp"
              >
                <Share2 className="size-4" aria-hidden />
              </a>
            </Button>
            <DialogClose asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Fechar"
                className="size-11 rounded-full bg-muted text-muted-foreground hover:bg-muted/70"
              >
                <X className="size-4" aria-hidden />
              </Button>
            </DialogClose>
          </div>
        </DialogHeader>
        <DialogDescription>
          Confira sua receita ou abra o modo de preparo para salvar o progresso.
        </DialogDescription>
        <Button asChild className="min-h-12">
          <Link href={`/receitas/${recipe.id}`}>Começar a cozinhar</Link>
        </Button>
        {recipe.sourceUrl && (
          <p className="text-sm">
            Fonte:{" "}
            <a
              className="underline"
              href={recipe.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {recipe.sourceName || new URL(recipe.sourceUrl).hostname}
            </a>
          </p>
        )}

        <div className="space-y-6 text-sm">
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Ingredientes
            </h3>
            {ingredients.length > 0 ? (
              <ul className="space-y-2 text-foreground">
                {ingredientItems.map((item) => {
                  const id = `recipe-ingredient-${item.key}`;
                  const isChecked = checkedKeys.has(item.key);
                  return (
                    <li key={item.key} className="flex items-start gap-2">
                      <Checkbox
                        id={id}
                        checked={isChecked}
                        onCheckedChange={(value) => toggleIngredient(item.key, value === true)}
                        className="mt-0.5"
                      />
                      <label
                        htmlFor={id}
                        className={cn(
                          "cursor-pointer select-none leading-relaxed",
                          isChecked && "text-muted-foreground line-through",
                        )}
                      >
                        {item.line}
                      </label>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="whitespace-pre-line text-foreground">{recipe.ingredients}</p>
            )}
          </section>

          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Preparo
            </h3>
            <p className="whitespace-pre-line text-foreground">{recipe.preparation}</p>
          </section>

          {finishing ? (
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Finalização
              </h3>
              <p className="whitespace-pre-line text-foreground">{finishing}</p>
            </section>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function buildIngredientItems(lines: string[]): Array<{ key: string; line: string }> {
  const occurrences = new Map<string, number>();
  return lines.map((line) => {
    const occurrence = occurrences.get(line) ?? 0;
    occurrences.set(line, occurrence + 1);
    return { key: `${line}-${occurrence}`, line };
  });
}
