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
import { Camera, ImagePlus, Loader2, RefreshCcw } from "lucide-react";
import { useRef, useState } from "react";
import { handleAiHttpError } from "./_ai-http-errors";
import type { ParsedRecipeFields } from "./voice-recipe-dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onParsed: (recipe: ParsedRecipeFields) => void;
};

type Stage = "idle" | "preview" | "parsing" | "not_recipe";

const PARSE_ENDPOINT = "/api/ai/recipes/parse-image";
const MAX_SOURCE_IMAGE_BYTES = 25 * 1024 * 1024;
const MAX_DATA_URL_CHARS = 8_000_000;
const ACCEPTED_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
const RESIZE_TARGETS = [
  { maxDim: 1280, quality: 0.85 },
  { maxDim: 1280, quality: 0.75 },
  { maxDim: 1024, quality: 0.78 },
  { maxDim: 960, quality: 0.72 },
] as const;

export function ImageRecipeDialog({ open, onOpenChange, onParsed }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [notRecipeReason, setNotRecipeReason] = useState<string>("");

  const reset = () => {
    setStage("idle");
    setImageDataUrl(null);
    setFileName(null);
    setNotRecipeReason("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const openPicker = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!ACCEPTED_MIMES.includes(file.type as (typeof ACCEPTED_MIMES)[number])) {
      toast.error("Use uma imagem JPG, PNG ou WebP.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (file.size > MAX_SOURCE_IMAGE_BYTES) {
      toast.error("Imagem muito grande. Use uma foto de até 25 MB.");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    try {
      const dataUrl = await downscaleToDataUrl(file);
      if (dataUrl.length > MAX_DATA_URL_CHARS) {
        toast.error(
          "Não consegui reduzir essa imagem. Tente uma foto com enquadramento mais fechado.",
        );
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
      setImageDataUrl(dataUrl);
      setFileName(file.name);
      setNotRecipeReason("");
      setStage("preview");
    } catch (err) {
      toast.error(
        err instanceof Error && err.message
          ? err.message
          : "Não foi possível ler a imagem. Tente outra foto.",
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  async function handleSubmit() {
    if (!imageDataUrl) return;

    setNotRecipeReason("");
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
      toast.error("Não foi possível organizar a receita. Tente novamente.");
      setStage("preview");
      return;
    }

    const data = (await res.json().catch(() => null)) as
      | { isValidRecipe: true; recipe: ParsedRecipeFields }
      | { isValidRecipe: false; reason?: string }
      | null;
    if (!data) {
      toast.error("Não foi possível organizar a receita. Tente novamente.");
      setStage("preview");
      return;
    }
    if (!data.isValidRecipe) {
      setStage("not_recipe");
      setNotRecipeReason(data.reason ?? "Não identifiquei uma receita nesta foto.");
      return;
    }

    onParsed(data.recipe);
    reset();
    // Parent transitions to RecipeFormDialog, which unmounts this dialog.
  }

  const isProcessing = stage === "parsing";
  const canSubmit = stage === "preview" && !!imageDataUrl;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova receita a partir de foto</DialogTitle>
          <DialogDescription>
            Tire uma foto ou envie uma imagem de uma receita (livro, caderno, print de site) e a IA
            organiza os campos pra você revisar antes de salvar.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileChange}
          aria-hidden
        />

        <div className="flex flex-col gap-3 py-2">
          {stage === "idle" || (!imageDataUrl && stage !== "parsing") ? (
            <button
              type="button"
              onClick={openPicker}
              className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/30 p-4 text-center transition-colors hover:border-primary hover:bg-muted/50"
              aria-label="Selecionar foto da receita"
            >
              <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Camera className="size-6" aria-hidden />
              </span>
              <span className="text-sm font-medium text-foreground">Escolher foto da receita</span>
              <span className="text-xs text-muted-foreground">
                Tire uma foto na hora ou escolha da galeria. JPG, PNG ou WebP; fotos grandes são
                reduzidas.
              </span>
            </button>
          ) : null}

          {imageDataUrl && stage !== "idle" ? (
            <div className="space-y-2">
              {/* biome-ignore lint/performance/noImgElement: client-side data URL preview, next/image cannot optimize and would require known dimensions */}
              <img
                src={imageDataUrl}
                alt={fileName ?? "Foto da receita selecionada"}
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
                    onClick={openPicker}
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
                Analisando a foto e organizando os campos…
              </span>
            </p>
          ) : null}

          {stage === "not_recipe" ? (
            <div className="rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-center text-sm text-amber-900 dark:border-amber-700/40 dark:bg-amber-950/40 dark:text-amber-200">
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
          <Button type="button" onClick={handleSubmit} disabled={!canSubmit || isProcessing}>
            {isProcessing ? (
              <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
            ) : (
              <ImagePlus className="mr-2 size-4" aria-hidden />
            )}
            Estruturar receita
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

async function downscaleToDataUrl(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    for (const target of RESIZE_TARGETS) {
      const dataUrl = renderImageToDataUrl(img, target.maxDim, target.quality);
      if (dataUrl.length <= MAX_DATA_URL_CHARS) {
        return dataUrl;
      }
    }
    const finalTarget = RESIZE_TARGETS[RESIZE_TARGETS.length - 1] ?? { maxDim: 960 };
    return renderImageToDataUrl(img, finalTarget.maxDim, 0.65);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function renderImageToDataUrl(img: HTMLImageElement, maxDim: number, quality: number): string {
  const longestSide = Math.max(img.naturalWidth, img.naturalHeight);
  const ratio = longestSide > maxDim ? maxDim / longestSide : 1;
  const targetWidth = Math.max(1, Math.round(img.naturalWidth * ratio));
  const targetHeight = Math.max(1, Math.round(img.naturalHeight * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas indisponível neste navegador.");
  }
  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
  return canvas.toDataURL("image/jpeg", quality);
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Não foi possível ler a imagem."));
    img.src = url;
  });
}
