import "server-only";

import { PDFDocument } from "pdf-lib";

// Server-side helpers para a feature de cadastro de atividades via PDF
// (`/api/ai/activities/parse-pdf`). O cliente faz validação preliminar
// (mime + tamanho) com constantes inline; o servidor revalida tudo + conta
// páginas com pdf-lib (pure-JS, sem worker/canvas).

// Bytes brutos do payload base64 decodificado. Limite pensado pra cobrir
// PDFs típicos de comunicado escolar (até ~3 páginas com fotos), sem
// abrir a porta pra upload de manuais inteiros.
export const MAX_PDF_BYTES = 5 * 1024 * 1024;

// Cap de páginas: PDFs maiores são rejeitados antes de chamar a IA pra
// não detonar tokens de visão. 3 páginas cobrem comunicado da semana /
// lista de tarefas / calendário de provas — formatos típicos de escola.
export const MAX_PDF_PAGES = 3;

export const ACCEPTED_PDF_MIME = "application/pdf";

export type CountPdfPagesResult =
  | { ok: true; pageCount: number }
  | { ok: false; reason: "invalid_pdf" };

/**
 * Conta páginas do PDF via pdf-lib. Retorna union pra que o caller diferencie
 * "PDF corrompido" (4xx amigável) de erro inesperado (5xx). `ignoreEncryption`
 * permite ler metadata mesmo em PDFs criptografados — se o conteúdo de fato
 * exigir senha pra ler texto/imagem, a IA vai retornar "nenhuma atividade
 * encontrada" e a UI mostra a mensagem genérica.
 */
export async function countPdfPages(buffer: Uint8Array): Promise<CountPdfPagesResult> {
  try {
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    return { ok: true, pageCount: doc.getPageCount() };
  } catch {
    return { ok: false, reason: "invalid_pdf" };
  }
}

/**
 * Decodifica a parte base64 de uma data URL `data:application/pdf;base64,...`
 * pra Uint8Array. Caller já validou o prefixo via Zod regex.
 */
export function decodePdfDataUrl(dataUrl: string): Uint8Array {
  const base64 = dataUrl.replace(/^data:application\/pdf;base64,/, "");
  return new Uint8Array(Buffer.from(base64, "base64"));
}
