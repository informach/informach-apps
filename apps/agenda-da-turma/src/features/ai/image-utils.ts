"use client";

// Helpers client-side para preparar uma imagem (foto/galeria) antes de
// enviar para os route handlers de IA (/api/ai/.../parse-image). O servidor
// espera uma data URL JPEG ≤ MAX_IMAGE_DATA_URL_CHARS chars.
//
// Usado pelos dois fluxos de imagem (matérias e atividades). Mantém o
// down-scaling consistente entre features — qualquer ajuste de
// qualidade/dimensão se reflete em ambos.

export const MAX_IMAGE_SOURCE_BYTES = 25 * 1024 * 1024;
export const MAX_IMAGE_DATA_URL_CHARS = 8_000_000;
export const ACCEPTED_IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AcceptedImageMime = (typeof ACCEPTED_IMAGE_MIMES)[number];

// Targets crescentemente mais agressivos. Tenta cada um em ordem e para no
// primeiro que cabe no cap de chars. Combina dimensão máxima do maior lado
// com qualidade JPEG. Comprime fotos de celular (4-8 MP) para ~1 MP @ 0.7-0.85,
// o que é mais que suficiente para OCR/visão.
const RESIZE_TARGETS = [
  { maxDim: 1280, quality: 0.85 },
  { maxDim: 1280, quality: 0.75 },
  { maxDim: 1024, quality: 0.78 },
  { maxDim: 960, quality: 0.72 },
] as const;

export function isAcceptedImageMime(mime: string): mime is AcceptedImageMime {
  return (ACCEPTED_IMAGE_MIMES as readonly string[]).includes(mime);
}

/**
 * Reduz a imagem progressivamente e devolve uma data URL JPEG que cabe em
 * `MAX_IMAGE_DATA_URL_CHARS`. Quando nenhum target couber (foto monstruosa
 * ou texto-art), faz uma última passada com qualidade 0.65 e devolve mesmo
 * que ainda ultrapasse — o caller valida antes de enviar.
 */
export async function downscaleToDataUrl(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    for (const target of RESIZE_TARGETS) {
      const dataUrl = renderImageToDataUrl(img, target.maxDim, target.quality);
      if (dataUrl.length <= MAX_IMAGE_DATA_URL_CHARS) {
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
