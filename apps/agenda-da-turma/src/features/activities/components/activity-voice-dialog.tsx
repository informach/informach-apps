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
import { handleAiHttpError } from "@/features/ai/_http-errors";
import type { ParsedActivityInput } from "../types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Devolve atividades + turma "vencedora" inferida pelo backend (ou null
   * quando não há consenso). O pai usa pra abrir o passo intermediário
   * `TurmaConfirmDialog`.
   */
  onParsed: (activities: ParsedActivityInput[], guessedTurmaId: string | null) => void;
};

type Stage = "idle" | "transcribing" | "parsing" | "not_activities";

const TRANSCRIBE_ENDPOINT = "/api/ai/activities/transcribe";
const PARSE_ENDPOINT = "/api/ai/activities/parse-voice";

export function ActivityVoiceDialog({ open, onOpenChange, onParsed }: Props) {
  const [stage, setStage] = useState<Stage>("idle");
  const [notFoundReason, setNotFoundReason] = useState<string>("");

  const reset = () => {
    setStage("idle");
    setNotFoundReason("");
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  async function handleAudio(blob: Blob): Promise<string> {
    setNotFoundReason("");
    setStage("transcribing");

    const transcribeForm = new FormData();
    transcribeForm.append("audio", blob, "activities.webm");
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
      setStage("not_activities");
      setNotFoundReason(
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
      toast.error("Não foi possível organizar as atividades. Tente novamente.");
      setStage("idle");
      return transcript;
    }
    const pData = (await pRes.json().catch(() => null)) as
      | { isValidInput: true; activities: ParsedActivityInput[]; guessedTurmaId: string | null }
      | { isValidInput: false; reason?: string }
      | null;
    if (!pData) {
      toast.error("Não foi possível organizar as atividades. Tente novamente.");
      setStage("idle");
      return transcript;
    }
    if (!pData.isValidInput) {
      setStage("not_activities");
      setNotFoundReason(pData.reason ?? "Não identifiquei atividades no áudio.");
      return transcript;
    }
    if (pData.activities.length === 0) {
      setStage("not_activities");
      setNotFoundReason("Não identifiquei atividades no áudio. Tente falar mais devagar.");
      return transcript;
    }

    onParsed(pData.activities, pData.guessedTurmaId ?? null);
    reset();
    return transcript;
  }

  const isProcessing = stage === "transcribing" || stage === "parsing";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cadastrar atividades por voz</DialogTitle>
          <DialogDescription>
            Toque no microfone e fale a(s) atividade(s) — pode incluir o estudante, a matéria, o
            tipo (prova, trabalho, tarefa, lembrete) e a data. Ex.: "Pedro tem prova de matemática
            na quarta-feira sobre frações". Você terá até 2 minutos para falar.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          <SpeechInput
            aria-label="Gravar atividades por voz"
            maxDurationMs={120_000}
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
                Organizando as atividades…
              </span>
            ) : null}
          </p>

          {stage === "not_activities" ? (
            <div className="w-full rounded-lg border border-chart-4/40 bg-chart-4/10 p-3 text-center text-sm">
              <p className="font-medium">Não consegui identificar atividades</p>
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
