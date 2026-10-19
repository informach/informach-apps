import { imageToPdf, mergePdfs, ProtectedPdfError } from "@shared/build";
import { mergeRequestSchema } from "@shared/merge-format";
import { livePdfPages } from "@shared/pdf-pages";
import { PDFDocument } from "pdf-lib";

self.onmessage = async (event: MessageEvent<unknown>) => {
  let current = "";
  try {
    const request = mergeRequestSchema.parse(event.data),
      inputs: Uint8Array[] = [];
    for (const [index, file] of request.files.entries()) {
      current = file.name;
      self.postMessage({ kind: "progress", index, total: request.files.length });
      inputs.push(/\.(?:png|jpe?g)$/i.test(file.name) ? await imageToPdf(file.bytes) : file.bytes);
    }
    const bytes = await mergePdfs(inputs, {
      maxPages: 1000,
      progress: (index, total) => {
        const file = request.files[index];
        if (!file) throw new Error("Entrada ausente na ordem da junção.");
        current = file.name;
        self.postMessage({ kind: "progress", index, total });
      },
    });
    if (bytes.length > 64 * 1024 * 1024)
      throw new Error("O resultado excede 64 MB. Junte intervalos menores.");
    const pages = livePdfPages(await PDFDocument.load(bytes)).length;
    if (!(bytes.buffer instanceof ArrayBuffer))
      throw new Error("Buffer do PDF combinado não transferível.");
    self.postMessage({ kind: "complete", bytes, pages }, { transfer: [bytes.buffer] });
  } catch (failure) {
    const reason =
      failure instanceof ProtectedPdfError
        ? "PDF protegido por senha. Use Abrir origens para editar e gere uma cópia autorizada antes de juntar."
        : failure instanceof Error
          ? failure.message
          : "Não foi possível preparar a junção.";
    self.postMessage({
      kind: "error",
      error: `${current ? `${current.slice(0, 900)}: ` : ""}${reason.slice(0, 1000)}`,
    });
  }
};
