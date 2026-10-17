"use client";

import { Button } from "@informach/ui/components/button";
import { Plus } from "lucide-react";
import { useState } from "react";
import type { RecipeFormValues } from "../schemas";
import { ImageRecipeDialog } from "./image-recipe-dialog";
import { NewRecipeMethodDialog } from "./new-recipe-method-dialog";
import { PromptRecipeDialog } from "./prompt-recipe-dialog";
import { RecipeFormDialog } from "./recipe-form-dialog";
import { TextRecipeDialog } from "./text-recipe-dialog";
import { type ParsedRecipeFields, VoiceRecipeDialog } from "./voice-recipe-dialog";

type Props = {
  isPro: boolean;
  currentCount: number;
  canUseAi?: boolean;
  trialAvailable?: boolean;
  credits?: number | null;
  hasRecentPreviews?: boolean;
  /** Opens the sheet on arrival, e.g. from "Prefiro trazer uma receita minha". */
  defaultOpen?: boolean;
};

type View = "closed" | "picker" | "voice" | "text" | "image" | "prompt" | "manual";
type AiMethod = "voice" | "text" | "image" | "prompt";

const REVIEW: Record<AiMethod, { title: string; description: string }> = {
  voice: {
    title: "Confira a receita do áudio",
    description: "Confira o que entendi do seu áudio e ajuste o que precisar antes de guardar.",
  },
  text: {
    title: "Confira a receita do texto",
    description: "Confira o que entendi do texto e ajuste o que precisar antes de guardar.",
  },
  image: {
    title: "Confira a receita da foto",
    description: "Confira o que entendi da foto e ajuste o que precisar antes de guardar.",
  },
  prompt: {
    title: "Confira a receita encontrada",
    description: "Confira a receita que encontrei e ajuste o que precisar antes de guardar.",
  },
};

export function NewRecipeButton({
  isPro,
  currentCount,
  canUseAi = isPro,
  trialAvailable = false,
  credits = null,
  hasRecentPreviews = false,
  defaultOpen = false,
}: Props) {
  const [view, setView] = useState<View>(defaultOpen ? "picker" : "closed");
  const [defaultValues, setDefaultValues] = useState<RecipeFormValues | null>(null);

  const parsed = (method: AiMethod) => (recipe: ParsedRecipeFields) => {
    setDefaultValues({ ...recipe, isFavorite: false, creationMethod: method });
    setView("manual");
  };

  const handleClose = () => {
    setView("closed");
    setDefaultValues(null);
  };
  const closeWith = (open: boolean) => {
    if (!open) handleClose();
  };

  const origin = defaultValues?.creationMethod;
  const review = origin && origin !== "manual" ? REVIEW[origin] : undefined;

  return (
    <>
      <Button
        className="h-[52px] w-full rounded-2xl text-base font-extrabold sm:w-auto sm:px-6"
        onClick={() => setView("picker")}
      >
        <Plus className="size-5" strokeWidth={2.6} aria-hidden />
        Trazer uma receita
      </Button>

      <NewRecipeMethodDialog
        open={view === "picker"}
        onOpenChange={closeWith}
        canUseAi={canUseAi}
        trialAvailable={trialAvailable}
        credits={credits}
        hasRecentPreviews={hasRecentPreviews}
        onPick={(method) => {
          if (method === "manual") setDefaultValues(null);
          setView(method);
        }}
      />

      <PromptRecipeDialog
        open={view === "prompt"}
        onOpenChange={closeWith}
        onParsed={parsed("prompt")}
      />
      <VoiceRecipeDialog
        open={view === "voice"}
        onOpenChange={closeWith}
        onParsed={parsed("voice")}
      />
      <TextRecipeDialog open={view === "text"} onOpenChange={closeWith} onParsed={parsed("text")} />
      <ImageRecipeDialog
        open={view === "image"}
        onOpenChange={closeWith}
        onParsed={parsed("image")}
      />

      <RecipeFormDialog
        open={view === "manual"}
        onOpenChange={closeWith}
        isPro={isPro}
        currentCount={currentCount}
        defaultValues={defaultValues ?? undefined}
        title={review?.title}
        description={review?.description}
      />
    </>
  );
}
