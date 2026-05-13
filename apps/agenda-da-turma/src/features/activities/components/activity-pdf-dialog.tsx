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
import { FilePlus, FileText, Loader2, RefreshCcw } from "lucide-react";
import { useRef, useState } from "react";
import { handleAiHttpError } from "@/features/ai/_http-errors";
import type { ParsedActivityInput } from "../types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Devolve atividades + turma "vencedora" inferida pelo backend (ou null
   * quando não há consenso). Mesmo contrato do dialog de imagem — o pai usa
   * pra abrir o passo intermediário `TurmaConfirmDialog`.
   */
  onParsed: (activities: ParsedActivityInput[], guessedTurmaId: string | null) => void;
};

type Stage = "idle" | "preview" | "parsing" | "not_activities";

const PARSE_ENDPOINT = "/api/ai/activities/parse-pdf";

// Espelha `MAX_PDF_BYTES` em `features/ai/pdf-utils.ts`. Mantido em sync
// manualmente — pdf-utils.ts é server-only (importa pdf-lib), então não
// dá pra reusar a constante daqui sem inflar o bundle do cliente.
const MAX_PDF_BYTES = 5 * 1024 * 1024;
const MAX_PDF_PAGES_HINT = 3;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") resolve(result);
      else reject(new Error("Não foi possível ler o PDF."));
    };
    reader.onerror = () => reject(new Error("Não foi possível ler o PDF."));
    reader.readAsDataURL(file);
  });
}

export function ActivityPdfDialog({ open, onOpenChange, onParsed }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [pdfDataUrl, setPdfDataUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [notFoundReason, setNotFoundReason] = useState<string>("");

  const reset = () => {
    setStage("idle");
    setPdfDataUrl(null);
    setFileName(null);
    setFileSize(null);
    setNotFoundReason("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const openPicker = () => fileInputRef.current?.click();

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      toast.error("Envie um arquivo PDF.");
      event.target.value = "";
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      toast.error("PDF muito grande. Use um arquivo de até 5 MB.");
      event.target.value = "";
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setPdfDataUrl(dataUrl);
      setFileName(file.name);
      setFileSize(file.size);
      setNotFoundReason("");
      setStage("preview");
    } catch (err) {
      toast.error(
        err instanceof Error && err.message ? err.message : "Não foi possível ler o PDF.",
      );
      event.target.value = "";
    }
  };

  async function handleSubmit() {
    if (!pdfDataUrl) return;

    setNotFoundReason("");
    setStage("parsing");

    const res = await fetch(PARSE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pdfDataUrl }),
    });
    if (!handleAiHttpError(res)) {
      setStage("preview");
      return;
    }
    if (!res.ok) {
      // Tenta extrair código de erro específico do PDF antes de cair no
      // toast genérico. `handleAiHttpError` já tratou 429/403/503; aqui
      // vêm 400/413/422/502 com payload `{ code: "PDF_..." }`.
      const data = (await res.json().catch(() => null)) as {
        code?: string;
        maxPages?: number;
        pageCount?: number;
      } | null;
      if (data?.code === "PDF_TOO_LARGE") {
        toast.error("PDF muito grande. Use um arquivo de até 5 MB.");
      } else if (data?.code === "PDF_TOO_LONG") {
        const max = data.maxPages ?? MAX_PDF_PAGES_HINT;
        toast.error(`PDFs com até ${max} páginas. O seu tem ${data.pageCount ?? "mais"}.`);
      } else if (data?.code === "INVALID_PDF") {
        toast.error("Não consegui ler esse PDF. Tente outro arquivo.");
      } else {
        toast.error("Não foi possível organizar as atividades. Tente novamente.");
      }
      setStage("preview");
      return;
    }

    const data = (await res.json().catch(() => null)) as
      | { isValidInput: true; activities: ParsedActivityInput[]; guessedTurmaId: string | null }
      | { isValidInput: false; reason?: string }
      | null;
    if (!data) {
      toast.error("Não foi possível organizar as atividades. Tente novamente.");
      setStage("preview");
      return;
    }
    if (!data.isValidInput) {
      setStage("not_activities");
      setNotFoundReason(data.reason ?? "Não identifiquei atividades neste PDF.");
      return;
    }
    if (data.activities.length === 0) {
      setStage("not_activities");
      setNotFoundReason("Não identifiquei atividades neste PDF. Tente outro arquivo.");
      return;
    }

    onParsed(data.activities, data.guessedTurmaId ?? null);
    reset();
  }

  const isProcessing = stage === "parsing";
  const canSubmit = stage === "preview" && !!pdfDataUrl;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cadastrar atividades por PDF</DialogTitle>
          <DialogDescription>
            Envie um PDF (comunicado da semana, lista de tarefas, calendário de provas) e a IA
            identifica as atividades pra você revisar antes de salvar. Até {MAX_PDF_PAGES_HINT}{" "}
            páginas.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={handleFileChange}
          aria-hidden
        />

        <div className="flex flex-col gap-3 py-2">
          {stage === "idle" || (!pdfDataUrl && stage !== "parsing") ? (
            <button
              type="button"
              onClick={openPicker}
              className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/30 p-4 text-center transition-colors hover:border-primary hover:bg-muted/50"
              aria-label="Escolher PDF das atividades"
            >
              <span className="flex size-12 items-center justify-center rounded-full bg-chart-3/15 text-chart-3">
                <FileText className="size-6" aria-hidden />
              </span>
              <span className="text-sm font-medium text-foreground">Escolher PDF</span>
              <span className="text-xs text-muted-foreground">
                Até 5 MB e {MAX_PDF_PAGES_HINT} páginas.
              </span>
            </button>
          ) : null}

          {pdfDataUrl && stage !== "idle" ? (
            <div className="space-y-2">
              <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-chart-3/15 text-chart-3">
                  <FileText className="size-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {fileName ?? "Arquivo selecionado"}
                  </p>
                  {fileSize != null ? (
                    <p className="text-xs text-muted-foreground">{formatBytes(fileSize)}</p>
                  ) : null}
                </div>
              </div>
              {!isProcessing ? (
                <div className="flex justify-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={openPicker}
                    className="text-xs"
                  >
                    <RefreshCcw className="mr-1.5 size-3.5" aria-hidden />
                    Trocar arquivo
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {stage === "parsing" ? (
            <p className="text-center text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="size-3 animate-spin" aria-hidden />
                Lendo o PDF e organizando as atividades…
              </span>
            </p>
          ) : null}

          {stage === "not_activities" ? (
            <div className="rounded-lg border border-chart-4/40 bg-chart-4/10 p-3 text-center text-sm">
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
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit || isProcessing}>
            {isProcessing ? (
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
            ) : (
              <FilePlus className="mr-2 size-4" aria-hidden />
            )}
            Detectar atividades
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
