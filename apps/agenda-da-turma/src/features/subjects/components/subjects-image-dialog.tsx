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
import { Camera, ImagePlus, Images, Loader2, RefreshCcw } from "lucide-react";
import { useRef, useState } from "react";
import { handleAiHttpError } from "@/features/ai/_http-errors";
import {
  downscaleToDataUrl,
  isAcceptedImageMime,
  MAX_IMAGE_DATA_URL_CHARS,
  MAX_IMAGE_SOURCE_BYTES,
} from "@/features/ai/image-utils";
import type { ParsedSubjectInput } from "./subjects-batch-confirm-dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onParsed: (subjects: ParsedSubjectInput[]) => void;
};

type Stage = "idle" | "preview" | "parsing" | "not_subjects";

const PARSE_ENDPOINT = "/api/ai/subjects/parse-image";

export function SubjectsImageDialog({ open, onOpenChange, onParsed }: Props) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [notSubjectsReason, setNotSubjectsReason] = useState<string>("");
  const [lastPickerUsed, setLastPickerUsed] = useState<"camera" | "gallery">("gallery");

  const reset = () => {
    setStage("idle");
    setImageDataUrl(null);
    setFileName(null);
    setNotSubjectsReason("");
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (galleryInputRef.current) galleryInputRef.current.value = "";
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const openCamera = () => {
    setLastPickerUsed("camera");
    cameraInputRef.current?.click();
  };
  const openGallery = () => {
    setLastPickerUsed("gallery");
    galleryInputRef.current?.click();
  };
  const reopenLastPicker = () => {
    if (lastPickerUsed === "camera") openCamera();
    else openGallery();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!isAcceptedImageMime(file.type)) {
      toast.error("Use uma imagem JPG, PNG ou WebP.");
      event.target.value = "";
      return;
    }
    if (file.size > MAX_IMAGE_SOURCE_BYTES) {
      toast.error("Imagem muito grande. Use uma foto de até 25 MB.");
      event.target.value = "";
      return;
    }

    try {
      const dataUrl = await downscaleToDataUrl(file);
      if (dataUrl.length > MAX_IMAGE_DATA_URL_CHARS) {
        toast.error(
          "Não consegui reduzir essa imagem. Tente uma foto com enquadramento mais fechado.",
        );
        event.target.value = "";
        return;
      }
      setImageDataUrl(dataUrl);
      setFileName(file.name);
      setNotSubjectsReason("");
      setStage("preview");
    } catch (err) {
      toast.error(
        err instanceof Error && err.message
          ? err.message
          : "Não foi possível ler a imagem. Tente outra foto.",
      );
      event.target.value = "";
    }
  };

  async function handleSubmit() {
    if (!imageDataUrl) return;

    setNotSubjectsReason("");
    setStage("parsing");

    const res = await fetch(PARSE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageDataUrl }),
    });
    if (!handleAiHttpError(res)) {
      setStage("preview");
      return;
    }
    if (!res.ok) {
      toast.error("Não foi possível organizar a lista. Tente novamente.");
      setStage("preview");
      return;
    }

    const data = (await res.json().catch(() => null)) as
      | { isValidInput: true; subjects: ParsedSubjectInput[] }
      | { isValidInput: false; reason?: string }
      | null;
    if (!data) {
      toast.error("Não foi possível organizar a lista. Tente novamente.");
      setStage("preview");
      return;
    }
    if (!data.isValidInput) {
      setStage("not_subjects");
      setNotSubjectsReason(data.reason ?? "Não identifiquei matérias nesta imagem.");
      return;
    }
    if (data.subjects.length === 0) {
      setStage("not_subjects");
      setNotSubjectsReason("Não identifiquei matérias nesta imagem. Tente outra foto.");
      return;
    }

    onParsed(data.subjects);
    reset();
    // Parent transitions to SubjectsBatchConfirmDialog which unmounts this.
  }

  const isProcessing = stage === "parsing";
  const canSubmit = stage === "preview" && !!imageDataUrl;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cadastrar matérias por imagem</DialogTitle>
          <DialogDescription>
            Tire uma foto ou envie uma imagem com a lista de matérias (horário escolar impresso,
            print de site, foto de caderno) e a IA organiza tudo pra você revisar antes de salvar.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleFileChange}
          aria-hidden
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
          aria-hidden
        />

        <div className="flex flex-col gap-3 py-2">
          {stage === "idle" || (!imageDataUrl && stage !== "parsing") ? (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={openCamera}
                className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/30 p-4 text-center transition-colors hover:border-primary hover:bg-muted/50"
                aria-label="Tirar foto da lista de matérias com a câmera"
              >
                <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Camera className="size-6" aria-hidden />
                </span>
                <span className="text-sm font-medium text-foreground">Tirar foto</span>
                <span className="text-xs text-muted-foreground">Abre a câmera do celular.</span>
              </button>
              <button
                type="button"
                onClick={openGallery}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/30 p-4 text-center transition-colors hover:border-primary hover:bg-muted/50"
                aria-label="Escolher imagem da galeria"
              >
                <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Images className="size-6" aria-hidden />
                </span>
                <span className="text-sm font-medium text-foreground">Escolher da galeria</span>
                <span className="text-xs text-muted-foreground">
                  JPG, PNG ou WebP. Fotos grandes são reduzidas.
                </span>
              </button>
            </div>
          ) : null}

          {imageDataUrl && stage !== "idle" ? (
            <div className="space-y-2">
              {/* biome-ignore lint/performance/noImgElement: client-side data URL preview, next/image cannot optimize and would require known dimensions */}
              <img
                src={imageDataUrl}
                alt={fileName ?? "Foto da lista de matérias selecionada"}
                className="max-h-72 w-full rounded-lg border border-border object-contain"
              />
              {fileName ? (
                <p className="truncate text-center text-xs text-muted-foreground">{fileName}</p>
              ) : null}
              {!isProcessing ? (
                <div className="flex justify-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={reopenLastPicker}
                    className="text-xs"
                  >
                    <RefreshCcw className="mr-1.5 size-3.5" aria-hidden />
                    Trocar foto
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {stage === "parsing" ? (
            <p className="text-center text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="size-3 animate-spin" aria-hidden />
                Analisando a foto e organizando as matérias…
              </span>
            </p>
          ) : null}

          {stage === "not_subjects" ? (
            <div className="rounded-lg border border-chart-4/40 bg-chart-4/10 p-3 text-center text-sm">
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
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit || isProcessing}>
            {isProcessing ? (
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
            ) : (
              <ImagePlus className="mr-2 size-4" aria-hidden />
            )}
            Detectar matérias
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
