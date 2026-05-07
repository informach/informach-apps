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
import { toast } from "@informach/ui/components/sonner";
import { SpeechInput } from "@informach/ui/components/speech-input";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { handleAiHttpError } from "./_ai-http-errors";

export type ParsedRecipeFields = {
  name: string;
  ingredients: string;
  preparation: string;
  finishing: string;
};

// Legacy alias kept for callers that already imported the voice-specific name.
export type VoiceRecipeFields = ParsedRecipeFields;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onParsed: (recipe: VoiceRecipeFields) => void;
};

type Stage = "idle" | "transcribing" | "parsing" | "not_recipe";

const TRANSCRIBE_ENDPOINT = "/api/ai/transcribe";
const PARSE_ENDPOINT = "/api/ai/recipes/parse-voice";

export function VoiceRecipeDialog({ open, onOpenChange, onParsed }: Props) {
  const [stage, setStage] = useState<Stage>("idle");
  const [notRecipeReason, setNotRecipeReason] = useState<string>("");

  const reset = () => {
    setStage("idle");
    setNotRecipeReason("");
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  async function handleAudio(blob: Blob): Promise<string> {
    setNotRecipeReason("");
    setStage("transcribing");

    const transcribeForm = new FormData();
    transcribeForm.append("audio", blob, "recipe.webm");
    const tRes = await fetch(TRANSCRIBE_ENDPOINT, {
      method: "POST",
      body: transcribeForm,
    });
    if (!handleAiHttpError(tRes)) {
      setStage("idle");
      return "";
    }
    if (!tRes.ok) {
      toast.error("Não foi possível transcrever o áudio. Tente novamente.");
      setStage("idle");
      return "";
    }
    const tData = (await tRes.json().catch(() => null)) as { text?: string } | null;
    const transcript = (tData?.text ?? "").trim();
    if (!transcript) {
      setStage("not_recipe");
      setNotRecipeReason(
        "Não consegui ouvir o áudio. Fale mais alto e perto do microfone, depois tente de novo.",
      );
      return "";
    }

    setStage("parsing");
    const pRes = await fetch(PARSE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript }),
    });
    if (!handleAiHttpError(pRes)) {
      setStage("idle");
      return transcript;
    }
    if (!pRes.ok) {
      toast.error("Não foi possível organizar a receita. Tente novamente.");
      setStage("idle");
      return transcript;
    }
    const pData = (await pRes.json().catch(() => null)) as
      | {
          isValidRecipe: true;
          recipe: VoiceRecipeFields;
        }
      | { isValidRecipe: false; reason?: string }
      | null;
    if (!pData) {
      toast.error("Não foi possível organizar a receita. Tente novamente.");
      setStage("idle");
      return transcript;
    }
    if (!pData.isValidRecipe) {
      setStage("not_recipe");
      setNotRecipeReason(pData.reason ?? "Não identifiquei uma receita no áudio.");
      return transcript;
    }

    onParsed(pData.recipe);
    reset();
    // Note: we don't call onOpenChange(false) here — the parent transitions to
    // the form view by mounting RecipeFormDialog with prefilled defaults, which
    // unmounts this voice dialog. Avoids racing onOpenChange against onParsed.
    return transcript;
  }

  const isProcessing = stage === "transcribing" || stage === "parsing";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova receita por voz</DialogTitle>
          <DialogDescription>
            Toque para gravar e descreva a receita: nome, ingredientes e modo de preparo. Você terá
            até 3 minutos para falar.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          <SpeechInput
            aria-label="Gravar receita por voz"
            maxDurationMs={180_000}
            size="lg"
            variant="outline"
            className="size-16 rounded-full"
            onAudioRecorded={handleAudio}
            onError={(err) => {
              const message =
                err instanceof DOMException && err.name === "NotAllowedError"
                  ? "Permita o uso do microfone para gravar."
                  : "Não foi possível acessar o microfone.";
              toast.error(message);
              setStage("idle");
            }}
          />

          <p className="text-center text-xs text-muted-foreground">
            {stage === "idle" ? "Toque no microfone para começar a gravar." : null}
            {stage === "transcribing" ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="size-3 animate-spin" aria-hidden />
                Transcrevendo seu áudio…
              </span>
            ) : null}
            {stage === "parsing" ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="size-3 animate-spin" aria-hidden />
                Organizando os campos da receita…
              </span>
            ) : null}
          </p>

          {stage === "not_recipe" ? (
            <div className="w-full rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-center text-sm text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/40 dark:text-amber-200">
              <p className="font-medium">Não consegui identificar uma receita</p>
              <p className="mt-1 text-xs">{notRecipeReason}</p>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
