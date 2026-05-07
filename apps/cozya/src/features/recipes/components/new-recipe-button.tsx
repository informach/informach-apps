"use client";

import { Button } from "@informach/ui/components/button";
import { Plus } from "lucide-react";
import { useState } from "react";
import type { RecipeFormValues } from "../schemas";
import { NewRecipeMethodDialog } from "./new-recipe-method-dialog";
import { RecipeFormDialog } from "./recipe-form-dialog";
import { VoiceRecipeDialog, type VoiceRecipeFields } from "./voice-recipe-dialog";

type Props = {
  isPro: boolean;
  currentCount: number;
};

type View = "closed" | "picker" | "voice" | "manual";

export function NewRecipeButton({ isPro, currentCount }: Props) {
  const [view, setView] = useState<View>("closed");
  const [defaultValues, setDefaultValues] = useState<RecipeFormValues | null>(null);

  const handlePickManual = () => {
    setDefaultValues(null);
    setView("manual");
  };

  const handlePickVoice = () => {
    setView("voice");
  };

  const handleParsedFromVoice = (recipe: VoiceRecipeFields) => {
    setDefaultValues({
      name: recipe.name,
      ingredients: recipe.ingredients,
      preparation: recipe.preparation,
      finishing: recipe.finishing,
      isFavorite: false,
      creationMethod: "voice",
    });
    setView("manual");
  };

  const handleClose = () => {
    setView("closed");
    setDefaultValues(null);
  };

  return (
    <>
      <Button className="h-12" onClick={() => setView("picker")}>
        <Plus className="mr-2 size-4" aria-hidden />
        Nova receita
      </Button>

      <NewRecipeMethodDialog
        open={view === "picker"}
        onOpenChange={(open) => {
          if (!open) handleClose();
        }}
        isPro={isPro}
        onPickManual={handlePickManual}
        onPickVoice={handlePickVoice}
      />

      <VoiceRecipeDialog
        open={view === "voice"}
        onOpenChange={(open) => {
          if (!open) handleClose();
        }}
        onParsed={handleParsedFromVoice}
      />

      <RecipeFormDialog
        open={view === "manual"}
        onOpenChange={(open) => {
          if (!open) handleClose();
        }}
        isPro={isPro}
        currentCount={currentCount}
        defaultValues={defaultValues ?? undefined}
        title={defaultValues ? "Revisar receita por voz" : undefined}
        description={
          defaultValues
            ? "Confira o que entendi do seu áudio e ajuste se precisar antes de salvar."
            : undefined
        }
      />
    </>
  );
}
