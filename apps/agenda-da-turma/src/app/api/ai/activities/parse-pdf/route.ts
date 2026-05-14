import { z } from "zod";
import { jsonUtf8, withAiRouteGuards } from "@/features/ai/_shared";
import { parseActivitiesFromPdf } from "@/features/ai/parse-activities-pdf-service";
import {
  countPdfPages,
  decodePdfDataUrl,
  MAX_PDF_BYTES,
  MAX_PDF_PAGES,
} from "@/features/ai/pdf-utils";
import { logger } from "@/lib/logger";
import { RequestBodyTooLargeError, readJsonWithSizeLimit } from "@/lib/request-size";

export const runtime = "nodejs";

// Base64 inflates ~33%; 5 MB raw ≈ 7 MB string + data URL prefix. Margem
// confortável para um PDF de até 3 páginas escolar caber. Refletido em
// MAX_PDF_BYTES (decodificado) — o cap em chars é só short-circuit antes
// do JSON parse.
const MAX_DATA_URL_CHARS = 7_500_000;
const MAX_PDF_REQUEST_BYTES = MAX_DATA_URL_CHARS + 1024;

const requestSchema = z.object({
  pdfDataUrl: z
    .string()
    .max(MAX_DATA_URL_CHARS)
    .regex(/^data:application\/pdf;base64,/, "Formato de arquivo não suportado"),
});

export async function POST(request: Request): Promise<Response> {
  const guard = await withAiRouteGuards({ errorScope: "agenda.activities.parse_pdf" });
  if (!guard.ok) return guard.response;
  const { userId } = guard;

  let pdfDataUrl: string;
  try {
    const json = await readJsonWithSizeLimit(request, MAX_PDF_REQUEST_BYTES);
    const parsed = requestSchema.safeParse(json);
    if (!parsed.success) {
      return jsonUtf8({ code: "INVALID_PDF" }, { status: 400 });
    }
    pdfDataUrl = parsed.data.pdfDataUrl;
  } catch (err) {
    if (err instanceof RequestBodyTooLargeError) {
      return jsonUtf8({ code: "PDF_TOO_LARGE" }, { status: 413 });
    }
    logger.warn(
      { userId, error: err instanceof Error ? err.message : String(err) },
      "agenda.activities.parse_pdf.parse_failed",
    );
    return jsonUtf8({ code: "INVALID_PDF" }, { status: 400 });
  }

  // Decode + valida tamanho decodificado e número de páginas ANTES de
  // chamar a IA. Pré-validação evita gastar 1 crédito num PDF que vamos
  // rejeitar de qualquer forma.
  const pdfBytes = decodePdfDataUrl(pdfDataUrl);
  if (pdfBytes.byteLength > MAX_PDF_BYTES) {
    return jsonUtf8({ code: "PDF_TOO_LARGE" }, { status: 413 });
  }
  const pages = await countPdfPages(pdfBytes);
  if (!pages.ok) {
    return jsonUtf8({ code: "INVALID_PDF" }, { status: 400 });
  }
  if (pages.pageCount > MAX_PDF_PAGES) {
    return jsonUtf8(
      { code: "PDF_TOO_LONG", maxPages: MAX_PDF_PAGES, pageCount: pages.pageCount },
      { status: 422 },
    );
  }

  try {
    const result = await parseActivitiesFromPdf({ userId, pdfDataUrl });
    if (!result.isValidInput) {
      return jsonUtf8({
        isValidInput: false,
        reason: result.reason ?? "Não consegui identificar atividades neste PDF.",
      });
    }
    return jsonUtf8({
      isValidInput: true,
      activities: result.activities,
      guessedTurmaId: result.guessedTurmaId,
    });
  } catch (err) {
    logger.error(
      { userId, error: err instanceof Error ? err.message : String(err) },
      "agenda.activities.parse_pdf.failed",
    );
    return jsonUtf8({ code: "PARSE_FAILED" }, { status: 502 });
  }
}
