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
import type { ParsedSubjectInput } from "./subjects-batch-confirm-dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onParsed: (subjects: ParsedSubjectInput[]) => void;
};

type Stage = "idle" | "transcribing" | "parsing" | "not_subjects";

const TRANSCRIBE_ENDPOINT = "/api/ai/transcribe";
const PARSE_ENDPOINT = "/api/ai/subjects/parse-voice";

export function SubjectsVoiceDialog({ open, onOpenChange, onParsed }: Props) {
  const [stage, setStage] = useState<Stage>("idle");
  const [notSubjectsReason, setNotSubjectsReason] = useState<string>("");

  const reset = () => {
    setStage("idle");
    setNotSubjectsReason("");
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  async function handleAudio(blob: Blob): Promise<string> {
    setNotSubjectsReason("");
    setStage("transcribing");

    const transcribeForm = new FormData();
    transcribeForm.append("audio", blob, "subjects.webm");
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
      setStage("not_subjects");
      setNotSubjectsReason(
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
      toast.error("Não foi possível organizar a lista. Tente novamente.");
      setStage("idle");
      return transcript;
    }
    const pData = (await pRes.json().catch(() => null)) as
      | { isValidInput: true; subjects: ParsedSubjectInput[] }
      | { isValidInput: false; reason?: string }
      | null;
    if (!pData) {
      toast.error("Não foi possível organizar a lista. Tente novamente.");
      setStage("idle");
      return transcript;
    }
    if (!pData.isValidInput) {
      setStage("not_subjects");
      setNotSubjectsReason(pData.reason ?? "Não identifiquei matérias no áudio.");
      return transcript;
    }
    if (pData.subjects.length === 0) {
      setStage("not_subjects");
      setNotSubjectsReason("Não identifiquei matérias no áudio. Tente falar mais devagar.");
      return transcript;
    }

    onParsed(pData.subjects);
    reset();
    // Parent troca pra SubjectsBatchConfirmDialog que desmonta este.
    return transcript;
  }

  const isProcessing = stage === "transcribing" || stage === "parsing";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cadastrar matérias por voz</DialogTitle>
          <DialogDescription>
            Toque no microfone e fale a lista de matérias da turma. Pode incluir o professor se
            quiser (ex.: "Matemática com Prof. Carla, Português, Ciências com Prof. Roberto"). Você
            terá até 2 minutos para falar.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 py-4">
          <SpeechInput
            aria-label="Gravar lista de matérias por voz"
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
                Organizando a lista de matérias…
              </span>
            ) : null}
          </p>

          {stage === "not_subjects" ? (
            <div className="w-full rounded-lg border border-chart-4/40 bg-chart-4/10 p-3 text-center text-sm">
              <p className="font-medium">Não consegui identificar matérias</p>
              <p className="mt-1 text-xs text-muted-foreground">{notSubjectsReason}</p>
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
