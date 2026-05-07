"use client";

import { Button } from "@informach/ui/components/button";
import { Plus } from "lucide-react";
import { useState } from "react";
import type { RecipeFormValues } from "../schemas";
import { ImageRecipeDialog } from "./image-recipe-dialog";
import { NewRecipeMethodDialog } from "./new-recipe-method-dialog";
import { RecipeFormDialog } from "./recipe-form-dialog";
import { TextRecipeDialog } from "./text-recipe-dialog";
import { type ParsedRecipeFields, VoiceRecipeDialog } from "./voice-recipe-dialog";

type Props = {
  isPro: boolean;
  currentCount: number;
};

type View = "closed" | "picker" | "voice" | "text" | "image" | "manual";

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

  const handlePickText = () => {
    setView("text");
  };

  const handlePickImage = () => {
    setView("image");
  };

  const handleParsedFromVoice = (recipe: ParsedRecipeFields) => {
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

  const handleParsedFromText = (recipe: ParsedRecipeFields) => {
    setDefaultValues({
      name: recipe.name,
      ingredients: recipe.ingredients,
      preparation: recipe.preparation,
      finishing: recipe.finishing,
      isFavorite: false,
      creationMethod: "text",
    });
    setView("manual");
  };

  const handleParsedFromImage = (recipe: ParsedRecipeFields) => {
    setDefaultValues({
      name: recipe.name,
      ingredients: recipe.ingredients,
      preparation: recipe.preparation,
      finishing: recipe.finishing,
      isFavorite: false,
      creationMethod: "image",
    });
    setView("manual");
  };

  const handleClose = () => {
    setView("closed");
    setDefaultValues(null);
  };

  const prefilledOrigin = defaultValues?.creationMethod;
  const formTitle =
    prefilledOrigin === "voice"
      ? "Revisar receita por voz"
      : prefilledOrigin === "text"
        ? "Revisar receita colada"
        : prefilledOrigin === "image"
          ? "Revisar receita por foto"
          : undefined;
  const formDescription =
    prefilledOrigin === "voice"
      ? "Confira o que entendi do seu áudio e ajuste se precisar antes de salvar."
      : prefilledOrigin === "text"
        ? "Confira o que entendi do texto e ajuste se precisar antes de salvar."
        : prefilledOrigin === "image"
          ? "Confira o que entendi da foto e ajuste se precisar antes de salvar."
          : undefined;

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
        onPickText={handlePickText}
        onPickImage={handlePickImage}
      />

      <VoiceRecipeDialog
        open={view === "voice"}
        onOpenChange={(open) => {
          if (!open) handleClose();
        }}
        onParsed={handleParsedFromVoice}
      />

      <TextRecipeDialog
        open={view === "text"}
        onOpenChange={(open) => {
          if (!open) handleClose();
        }}
        onParsed={handleParsedFromText}
      />

      <ImageRecipeDialog
        open={view === "image"}
        onOpenChange={(open) => {
          if (!open) handleClose();
        }}
        onParsed={handleParsedFromImage}
      />

      <RecipeFormDialog
        open={view === "manual"}
        onOpenChange={(open) => {
          if (!open) handleClose();
        }}
        isPro={isPro}
        currentCount={currentCount}
        defaultValues={defaultValues ?? undefined}
        title={formTitle}
        description={formDescription}
      />
    </>
  );
}
