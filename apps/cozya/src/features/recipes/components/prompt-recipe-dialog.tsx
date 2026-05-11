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
import { Textarea } from "@informach/ui/components/textarea";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { handleAiHttpError } from "./_ai-http-errors";
import type { ParsedRecipeFields } from "./voice-recipe-dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onParsed: (recipe: ParsedRecipeFields) => void;
};

type Stage = "idle" | "transcribing" | "researching" | "not_found";

const TRANSCRIBE_ENDPOINT = "/api/ai/transcribe";
const RESEARCH_ENDPOINT = "/api/ai/recipes/from-prompt";
const MAX_PROMPT_CHARS = 200;

export function PromptRecipeDialog({ open, onOpenChange, onParsed }: Props) {
  const [prompt, setPrompt] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [notFoundReason, setNotFoundReason] = useState<string>("");

  const reset = () => {
    setPrompt("");
    setStage("idle");
    setNotFoundReason("");
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  async function transcribeAudio(blob: Blob): Promise<string> {
    setNotFoundReason("");
    setStage("transcribing");
    const form = new FormData();
    form.append("audio", blob, "prompt.webm");
    const res = await fetch(TRANSCRIBE_ENDPOINT, { method: "POST", body: form });
    if (!handleAiHttpError(res)) {
      setStage("idle");
      return "";
    }
    if (!res.ok) {
      toast.error("Não foi possível transcrever o áudio. Tente novamente.");
      setStage("idle");
      return "";
    }
    const data = (await res.json().catch(() => null)) as { text?: string } | null;
    const transcript = (data?.text ?? "").trim();
    if (!transcript) {
      toast.error("Não consegui ouvir o áudio. Fale mais alto e perto do microfone.");
      setStage("idle");
      return "";
    }
    // Trim para o limite do textarea/prompt — voz longa demais não cabe.
    const sliced = transcript.slice(0, MAX_PROMPT_CHARS);
    setPrompt(sliced);
    setStage("idle");
    return sliced;
  }

  async function handleSubmit() {
    const trimmed = prompt.trim();
    if (!trimmed) return;

    setNotFoundReason("");
    setStage("researching");

    const res = await fetch(RESEARCH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: trimmed }),
    });
    if (!handleAiHttpError(res)) {
      setStage("idle");
      return;
    }
    if (!res.ok) {
      toast.error("Não foi possível buscar a receita. Tente novamente.");
      setStage("idle");
      return;
    }
    const data = (await res.json().catch(() => null)) as
      | { isValidRecipe: true; recipe: ParsedRecipeFields }
      | { isValidRecipe: false; reason?: string }
      | null;
    if (!data) {
      toast.error("Não foi possível buscar a receita. Tente novamente.");
      setStage("idle");
      return;
    }
    if (!data.isValidRecipe) {
      setStage("not_found");
      setNotFoundReason(
        data.reason ??
          "Não encontrei uma receita popular pra esse pedido. Tente algo mais específico.",
      );
      return;
    }
    onParsed(data.recipe);
    reset();
    // Parent transitions to RecipeFormDialog, which unmounts this dialog.
  }

  const isTranscribing = stage === "transcribing";
  const isResearching = stage === "researching";
  const isProcessing = isTranscribing || isResearching;
  const charCount = prompt.length;
  const overLimit = charCount > MAX_PROMPT_CHARS;
  const canSubmit = !isProcessing && prompt.trim().length >= 3 && !overLimit;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova receita por descrição</DialogTitle>
          <DialogDescription>
            Diga o que você quer e a IA busca a receita mais popular pra você. Pode ser só uma
            referência, ex: "bolo de cenoura caseiro" ou "bolo de cenoura do Jacquin".
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 py-2">
          <div className="flex items-start gap-2">
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ex: bolo de cenoura caseiro"
              rows={3}
              maxLength={MAX_PROMPT_CHARS}
              disabled={isProcessing}
              aria-label="Descrição da receita que você quer"
              className="flex-1"
            />
            <SpeechInput
              aria-label="Falar a descrição"
              maxDurationMs={30_000}
              size="icon"
              variant="outline"
              className="shrink-0"
              onAudioRecorded={transcribeAudio}
              onError={(err) => {
                const message =
                  err instanceof DOMException && err.name === "NotAllowedError"
                    ? "Permita o uso do microfone para falar."
                    : "Não foi possível acessar o microfone.";
                toast.error(message);
                setStage("idle");
              }}
              disabled={isResearching}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Consome 1 crédito.</span>
            <span>
              {charCount}/{MAX_PROMPT_CHARS}
            </span>
          </div>

          {isTranscribing ? (
            <p className="text-center text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="size-3 animate-spin" aria-hidden />
                Transcrevendo seu áudio…
              </span>
            </p>
          ) : null}

          {isResearching ? (
            <p className="text-center text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="size-3 animate-spin" aria-hidden />
                Procurando a receita mais popular… (pode levar até 10s)
              </span>
            </p>
          ) : null}

          {stage === "not_found" ? (
            <div className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-center text-sm">
              <p className="font-medium">Não encontrei uma receita</p>
              <p className="mt-1 text-xs text-muted-foreground">{notFoundReason}</p>
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
            {isResearching ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}
            Buscar receita
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
