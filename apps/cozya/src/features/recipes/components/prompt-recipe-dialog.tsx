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
import { useState } from "react";
import { type ParsedRecipeFields, useAiRequest } from "./use-ai-request";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onParsed: (recipe: ParsedRecipeFields) => void;
};
export function PromptRecipeDialog({ open, onOpenChange, onParsed }: Props) {
  const [prompt, setPrompt] = useState("");
  const [processing, setProcessing] = useState(false);
  const [lastAudio, setLastAudio] = useState<Blob | null>(null);
  const [reason, setReason] = useState("");
  const requestAi = useAiRequest();
  const close = () => {
    if (processing || ((prompt.trim() || lastAudio) && !window.confirm("Descartar este pedido?")))
      return;
    setPrompt("");
    setLastAudio(null);
    setReason("");
    onOpenChange(false);
  };
  async function submit(audio?: Blob): Promise<string> {
    setReason("");
    setProcessing(true);
    if (audio) setLastAudio(audio);
    try {
      const body = new FormData();
      if (audio) {
        body.append("audio", audio, "prompt.webm");
        body.append("mode", "research");
      }
      const data = audio
        ? await requestAi("/api/ai/recipes/from-audio", body, audio)
        : await requestAi("/api/ai/recipes/from-prompt", JSON.stringify({ prompt: prompt.trim() }));
      if (!data) return "";
      if (!data.isValidRecipe) {
        setReason(
          data.reason ?? "Não encontrei uma receita com fonte. Nenhum crédito foi consumido.",
        );
        return "";
      }
      onParsed(data.recipe);
      setPrompt("");
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Encontrar uma receita</DialogTitle>
          <DialogDescription>
            Descreva o que quer preparar. Vamos procurar uma receita com link para a fonte, para
            você conferir antes de salvar.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          aria-label="Descrição da receita que você quer"
          placeholder="Ex.: arroz de forno com legumes"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          maxLength={200}
          disabled={processing}
        />
        <div className="flex items-center gap-3">
          <SpeechInput
            aria-label="Falar e buscar receita"
            maxDurationMs={30000}
            variant="outline"
            size="icon"
            disabled={processing}
            onAudioRecorded={submit}
            onError={() =>
              toast.error("Não foi possível gravar. Confira a permissão do microfone.")
            }
          />
          <p className="text-sm text-muted-foreground">
            Ou fale e busque diretamente. Texto ou voz: 1 crédito pela tarefa completa.
          </p>
        </div>
        {processing && (
          <p role="status" className="text-sm">
            Buscando a fonte e organizando a receita…
          </p>
        )}
        {reason && (
          <p role="status" className="rounded-xl border p-4 text-sm">
            {reason}
          </p>
        )}
        {lastAudio && !processing && (
          <Button variant="outline" onClick={() => void submit(lastAudio)}>
            Tentar novamente com este áudio
          </Button>
        )}
        <p className="text-xs text-muted-foreground">
          Sem resultado verificável, nenhum crédito é consumido. As receitas precisam de sua
          revisão; a busca não comprova segurança ou adequação alimentar.
        </p>
        <DialogFooter>
          <Button variant="outline" disabled={processing} onClick={close}>
            Cancelar
          </Button>
          <Button disabled={processing || prompt.trim().length < 3} onClick={() => void submit()}>
            Buscar receita
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
