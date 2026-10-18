"use client";
import { Button } from "@informach/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@informach/ui/components/dialog";
import { toast } from "@informach/ui/components/sonner";
import { SpeechInput } from "@informach/ui/components/speech-input";
import { Mic } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { z } from "zod";
import { startTrialAction } from "@/features/kitchen/actions";
import { TRIAL_CREDITS, TRIAL_DAYS } from "@/features/kitchen/trial";
import { catchActionResult } from "./action-errors";
import { useRecoverableAiRequest } from "./use-ai-request";

const transcriptSchema = z.union([
  z.object({ text: z.string().min(1).max(8000) }),
  z.object({ isValidRecipe: z.literal(false), reason: z.string().optional() }),
]);

export function RecipeVoiceSearch({
  isPro,
  trialAvailable,
  onTranscribed,
}: {
  isPro: boolean;
  /** No trial yet: the locked AI offers to start the 14 days, not the plans. */
  trialAvailable: boolean;
  onTranscribed: (text: string) => void;
}) {
  const router = useRouter();
  const [started, setStarted] = useState(false);
  const [starting, startTransition] = useTransition();
  const canUseAi = isPro || started;
  const startTrial = () =>
    startTransition(async () => {
      const result = await catchActionResult(() => startTrialAction({}));
      if (!result.ok) {
        toast.error("Não foi possível começar o teste. Tente de novo.");
        return;
      }
      toast.success(
        `Seus ${TRIAL_DAYS} dias grátis começaram. Você tem ${TRIAL_CREDITS} créditos de IA.`,
      );
      setStarted(true);
      router.refresh();
    });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [lastAudio, setLastAudio] = useState<Blob | null>(null);
  const request = useRecoverableAiRequest(transcriptSchema);
  const transcribe = async (audio: Blob) => {
    setLastAudio(audio);
    setBusy(true);
    try {
      const form = new FormData();
      form.set("audio", audio, "search.webm");
      const result = await request("/api/ai/transcribe", form, audio);
      if (!result) return "";
      if (!("text" in result)) {
        toast.error(result.reason ?? "Não consegui ouvir o áudio. Nenhum crédito foi consumido.");
        return "";
      }
      onTranscribed(result.text.trim());
      setLastAudio(null);
      setOpen(false);
      return result.text;
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="size-11"
        aria-label="Ditar busca · 1 crédito"
        onClick={() => setOpen(true)}
      >
        <Mic className="size-4" aria-hidden />
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (
            !next &&
            (busy || recording || (lastAudio && !window.confirm("Descartar este áudio?")))
          )
            return;
          if (!next) setLastAudio(null);
          setOpen(next);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ditar uma busca nas suas receitas</DialogTitle>
            <DialogDescription>
              A transcrição custa 1 crédito quando concluída. Digitar no campo de busca é gratuito.
              A busca procura nas receitas que você já guardou.
            </DialogDescription>
          </DialogHeader>
          {canUseAi ? (
            <div className="flex flex-col items-center gap-4 py-4">
              <SpeechInput
                aria-label="Gravar termo de busca"
                maxDurationMs={15000}
                className="size-16 rounded-full"
                variant="outline"
                disabled={busy}
                onAudioRecorded={transcribe}
                onStateChange={(state) => setRecording(state === "recording")}
                onError={() =>
                  toast.error("Não foi possível gravar. Confira a permissão do microfone.")
                }
              />
              <p role="status" className="text-sm">
                {busy
                  ? "Transcrevendo…"
                  : recording
                    ? "Toque para encerrar a gravação."
                    : "Toque para gravar até 15 segundos."}
              </p>
              {lastAudio && !busy && (
                <Button variant="outline" onClick={() => void transcribe(lastAudio)}>
                  Tentar novamente com este áudio
                </Button>
              )}
            </div>
          ) : trialAvailable ? (
            <div className="space-y-3 rounded-2xl bg-muted p-4">
              <p className="text-sm leading-normal">
                Seus {TRIAL_DAYS} dias grátis incluem {TRIAL_CREDITS} créditos de IA, um por
                receita. Sem cartão.
              </p>
              <Button className="min-h-11" disabled={starting} onClick={startTrial}>
                Ativar e continuar
              </Button>
            </div>
          ) : (
            <div className="space-y-3 rounded-2xl bg-muted p-4">
              <p className="text-sm leading-normal">
                A ajuda da IA faz parte do Pro. Digitar no campo de busca continua grátis.
              </p>
              <Button asChild className="min-h-11">
                <Link href="/upgrade">Conhecer o Pro</Link>
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
