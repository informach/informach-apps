"use client";
import { Button } from "@informach/ui/components/button";
import { toast } from "@informach/ui/components/sonner";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import { useTransition } from "react";
import { catchActionResult } from "@/features/recipes/components/action-errors";
import { generateShoppingAction } from "../actions";

export function GenerateListButton({ week }: { week: string }) {
  const hydrated = useHydrated();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      className="min-h-12 rounded-2xl text-base font-extrabold"
      disabled={!hydrated || pending}
      onClick={() =>
        startTransition(async () => {
          const result = await catchActionResult(() => generateShoppingAction({ week }));
          if (!result.ok) toast.error("Não foi possível montar a lista.");
        })
      }
    >
      {pending ? "Montando a lista…" : "Montar a lista do mercado"}
    </Button>
  );
}
