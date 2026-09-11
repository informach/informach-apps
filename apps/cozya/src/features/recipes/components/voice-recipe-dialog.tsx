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
import { useState } from "react";
import { type ParsedRecipeFields, useAiRequest } from "./use-ai-request";

export type { ParsedRecipeFields } from "./use-ai-request";
export type VoiceRecipeFields = ParsedRecipeFields;
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onParsed: (recipe: ParsedRecipeFields) => void;
};

export function VoiceRecipeDialog({ open, onOpenChange, onParsed }: Props) {
  const [processing, setProcessing] = useState(false);
  const [lastAudio, setLastAudio] = useState<Blob | null>(null);
  const [reason, setReason] = useState("");
  const requestAi = useAiRequest();
  const close = () => {
    if (processing) return;
    if (lastAudio && !window.confirm("Descartar o áudio desta receita?")) return;
    setLastAudio(null);
    setReason("");
    onOpenChange(false);
  };
  async function handleAudio(audio: Blob): Promise<string> {
    setLastAudio(audio);
    setReason("");
    setProcessing(true);
    try {
      const body = new FormData();
      body.append("audio", audio, "recipe.webm");
      body.append("mode", "recipe");
      const data = await requestAi("/api/ai/recipes/from-audio", body, audio);
      if (!data) return "";
      if (!data.isValidRecipe) {
        setReason(data.reason ?? "Não identifiquei uma receita. Nenhum crédito foi consumido.");
        return "";
      }
      onParsed(data.recipe);
      setLastAudio(null);
      return data.recipe.name;
    } finally {
      setProcessing(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova receita por voz</DialogTitle>
          <DialogDescription>
            Descreva ingredientes e preparo em até 3 minutos. A tarefa completa consome 1 crédito,
            incluindo a transcrição. Você revisa antes de salvar.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-4">
          <SpeechInput
            aria-label="Gravar receita por voz"
            maxDurationMs={180000}
            size="lg"
            variant="outline"
            className="size-16 rounded-full"
            disabled={processing}
            onAudioRecorded={handleAudio}
            onError={(error) =>
              toast.error(
                error instanceof DOMException && error.name === "NotAllowedError"
                  ? "Permita o uso do microfone para gravar."
                  : "Não foi possível gravar o áudio.",
              )
            }
          />
          <p role="status" className="text-center text-sm text-muted-foreground">
            {processing ? "Ouvindo e organizando sua receita…" : "Toque no microfone para gravar."}
          </p>
          {reason && (
            <p role="status" className="rounded-xl border p-4 text-sm">
              {reason}
            </p>
          )}
          {lastAudio && !processing && (
            <Button variant="outline" onClick={() => void handleAudio(lastAudio)}>
              Tentar novamente com este áudio
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Se não houver receita ou ocorrer falha no processamento, o crédito é liberado. Áudio
          permanece nesta tela para tentar novamente.
        </p>
        <DialogFooter>
          <Button variant="outline" disabled={processing} onClick={close}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
