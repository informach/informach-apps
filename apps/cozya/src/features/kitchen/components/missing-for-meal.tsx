"use client";
import { Button } from "@informach/ui/components/button";
import { toast } from "@informach/ui/components/sonner";
import { Check } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { catchActionResult } from "@/features/recipes/components/action-errors";
import { setShoppingStateAction } from "../actions";

/** "Para o jantar de hoje ainda falta: creme de leite." with the two answers people give. */
export function MissingForMeal({
  when,
  phrase,
  items,
  week,
}: {
  when: string;
  phrase: string;
  items: { id: string }[];
  week: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-3 rounded-2xl bg-peach p-4 text-peach-ink">
      <p className="text-base font-bold leading-snug">
        Para {when} ainda {items.length === 1 ? "falta" : "faltam"}: {phrase}.
      </p>
      <p className="text-sm">Ficou sem marcar na lista do mercado.</p>
      <div className="grid grid-cols-2 gap-2">
        <Button
          className="min-h-11 bg-secondary text-secondary-foreground hover:bg-secondary/90"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const results = await Promise.all(
                items.map((item) =>
                  catchActionResult(() => setShoppingStateAction({ id: item.id, state: "have" })),
                ),
              );
              if (results.some((result) => !result.ok))
                toast.error("Não foi possível marcar. Tente de novo.");
              else toast.success("Marcado como em casa.");
            })
          }
        >
          <Check className="size-4" aria-hidden />
          Já tenho
        </Button>
        <Button asChild variant="outline" className="min-h-11 bg-card">
          <Link href={`/compras?week=${week}`}>Abrir a lista</Link>
        </Button>
      </div>
    </div>
  );
}
