"use client";

import { Badge } from "@informach/ui/components/badge";
import { Button } from "@informach/ui/components/button";
import { toast } from "@informach/ui/components/sonner";
import { SpeechInput } from "@informach/ui/components/speech-input";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@informach/ui/components/tooltip";
import { Lock, Mic } from "lucide-react";
import Link from "next/link";

type Props = {
  isPro: boolean;
  onTranscribed: (text: string) => void;
};

const ENDPOINT = "/api/ai/transcribe";

export function RecipeVoiceSearch({ isPro, onTranscribed }: Props) {
  if (!isPro) {
    return (
      <TooltipProvider delayDuration={150}>
        <div className="flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled
                  aria-label="Buscar por voz (recurso Pro)"
                  className="cursor-not-allowed"
                >
                  <Mic className="size-4" aria-hidden />
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="flex items-center gap-1.5 text-xs">
                <Lock className="size-3" aria-hidden />
                Recurso Pro —{" "}
                <Link href="/upgrade" className="underline underline-offset-2">
                  ver planos
                </Link>
              </p>
            </TooltipContent>
          </Tooltip>
          <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
            Pro
          </Badge>
        </div>
      </TooltipProvider>
    );
  }

  return (
    <SpeechInput
      aria-label="Buscar receita por voz"
      onAudioRecorded={async (blob) => {
        const formData = new FormData();
        formData.append("audio", blob, "search.webm");
        const response = await fetch(ENDPOINT, { method: "POST", body: formData });
        if (response.status === 429) {
          const data = (await response.json().catch(() => null)) as { retryAfter?: number } | null;
          const wait = data?.retryAfter ? ` Tente novamente em ~${data.retryAfter}s.` : "";
          toast.error(`Aguarde alguns minutos antes de usar a IA novamente.${wait}`);
          return "";
        }
        if (response.status === 403) {
          toast.error("Esta funcionalidade é apenas para assinantes Pro.");
          return "";
        }
        if (response.status === 503) {
          toast.error("Transcrição indisponível no momento.");
          return "";
        }
        if (!response.ok) {
          toast.error("Não foi possível transcrever o áudio. Tente novamente.");
          return "";
        }
        const data = (await response.json().catch(() => null)) as { text?: string } | null;
        return data?.text ?? "";
      }}
      onTranscriptionChange={(text) => {
        const trimmed = text.trim();
        if (trimmed) onTranscribed(trimmed);
      }}
      onError={(err) => {
        const message =
          err instanceof DOMException && err.name === "NotAllowedError"
            ? "Permita o uso do microfone para gravar."
            : "Não foi possível acessar o microfone.";
        toast.error(message);
      }}
    />
  );
}
