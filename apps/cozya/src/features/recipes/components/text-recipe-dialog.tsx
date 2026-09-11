"use client";

import { Button } from "@informach/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@informach/ui/components/dialog";
import { Textarea } from "@informach/ui/components/textarea";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { useAiRequest } from "./use-ai-request";
import type { ParsedRecipeFields } from "./voice-recipe-dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onParsed: (recipe: ParsedRecipeFields) => void;
};

type Stage = "idle" | "parsing" | "not_recipe";

const PARSE_ENDPOINT = "/api/ai/recipes/parse-text";
const MAX_TEXT_CHARS = 8000;

export function TextRecipeDialog({ open, onOpenChange, onParsed }: Props) {
  const requestAi = useAiRequest();
  const [text, setText] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [notRecipeReason, setNotRecipeReason] = useState<string>("");

  const reset = () => {
    setText("");
    setStage("idle");
    setNotRecipeReason("");
  };

  const handleOpenChange = (next: boolean) => {
    if (!next && stage === "parsing") return;
    if (!next && text.trim() && !window.confirm("Descartar o conteúdo desta receita?")) return;
    if (!next) reset();
    onOpenChange(next);
  };

  async function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed) return;

    setNotRecipeReason("");
    setStage("parsing");

    const data = await requestAi(PARSE_ENDPOINT, JSON.stringify({ text: trimmed }));
    if (!data) {
      setStage("idle");
      return;
    }
    if (!data.isValidRecipe) {
      setStage("not_recipe");
      setNotRecipeReason(data.reason ?? "Não identifiquei uma receita no texto colado.");
      return;
    }

    onParsed(data.recipe);
    reset();
    // Parent transitions to RecipeFormDialog, which unmounts this dialog.
  }

  const isProcessing = stage === "parsing";
  const charCount = text.length;
  const overLimit = charCount > MAX_TEXT_CHARS;
  const canSubmit = !isProcessing && text.trim().length > 0 && !overLimit;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova receita a partir de texto</DialogTitle>
          <DialogDescription>
            Cole aqui o texto de uma receita (de um site, blog ou caderno) e a IA organiza os campos
            pra você revisar antes de salvar.
          </DialogDescription>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          1 crédito por receita organizada. Conteúdo inválido ou falha libera o crédito.
        </p>

        <div className="flex flex-col gap-2 py-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Cole aqui o texto da receita…"
            rows={10}
            maxLength={MAX_TEXT_CHARS}
            disabled={isProcessing}
            aria-label="Texto da receita"
          />
          <p className="self-end text-xs text-muted-foreground">
            {charCount}/{MAX_TEXT_CHARS}
          </p>

          {stage === "parsing" ? (
            <p className="text-center text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="size-3 animate-spin" aria-hidden />
                Organizando os campos da receita…
              </span>
            </p>
          ) : null}

          {stage === "not_recipe" ? (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-center text-sm">
              <p className="font-medium">Não consegui identificar uma receita</p>
              <p className="mt-1 text-xs text-muted-foreground">{notRecipeReason}</p>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isProcessing}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit}>
            {isProcessing ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}
            Estruturar receita
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
