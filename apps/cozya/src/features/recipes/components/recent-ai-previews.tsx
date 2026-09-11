"use client";
import { Button } from "@informach/ui/components/button";
import { useState } from "react";
import type { RecipeFormValues } from "../schemas";
import { RecipeFormDialog } from "./recipe-form-dialog";

export function RecentAiPreviews({
  previews,
  isPro,
  currentCount,
}: {
  previews: { id: string; createdAt: string; expiresAt: string; recipe: RecipeFormValues }[];
  isPro: boolean;
  currentCount: number;
}) {
  const [selected, setSelected] = useState<RecipeFormValues | null>(null);
  return (
    <>
      {previews.length === 0 ? (
        <p className="rounded-xl border p-6 text-muted-foreground">
          Nenhum resultado de receita disponível nas últimas 24 horas.
        </p>
      ) : (
        <ul className="space-y-3">
          {previews.map((preview) => (
            <li
              key={preview.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4"
            >
              <div>
                <h2 className="font-semibold">{preview.recipe.name}</h2>
                <p className="text-sm text-muted-foreground">
                  Disponível até{" "}
                  {new Date(preview.expiresAt).toLocaleString("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                    dateStyle: "short",
                    timeStyle: "short",
                  })}{" "}
                  (Brasília)
                </p>
              </div>
              <Button
                variant="outline"
                className="min-h-11"
                onClick={() => setSelected(preview.recipe)}
              >
                Revisar resultado
              </Button>
            </li>
          ))}
        </ul>
      )}
      {selected && (
        <RecipeFormDialog
          open
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
          onSaved={() => setSelected(null)}
          defaultValues={selected}
          isPro={isPro}
          currentCount={currentCount}
          title="Revisar resultado recuperado"
          description="Confira as medidas antes de salvar. Recuperar e salvar este resultado não consome outro crédito. Se já salvou a receita, evite criar uma cópia."
        />
      )}
    </>
  );
}
