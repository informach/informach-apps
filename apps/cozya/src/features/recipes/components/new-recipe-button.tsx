"use client";

import { Button } from "@informach/ui/components/button";
import { Plus } from "lucide-react";
import { useState } from "react";
import { RecipeFormDialog } from "./recipe-form-dialog";

type Props = {
  isPro: boolean;
  currentCount: number;
};

export function NewRecipeButton({ isPro, currentCount }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="mr-2 size-4" aria-hidden />
        Nova receita
      </Button>
      <RecipeFormDialog
        open={open}
        onOpenChange={setOpen}
        isPro={isPro}
        currentCount={currentCount}
      />
    </>
  );
}
