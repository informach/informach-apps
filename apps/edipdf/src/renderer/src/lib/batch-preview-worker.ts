import { readBatchArchive } from "@shared/batch-archive";
import { batchPreviewRequestSchema } from "@shared/batch-worker-format";

self.onmessage = async (event: MessageEvent<unknown>) => {
  try {
    const request = batchPreviewRequestSchema.parse(event.data);
    if (!request.detail.files.some((file) => file.name === request.name))
      throw new Error("Arquivo ausente na revisão do lote.");
    const bytes = (await readBatchArchive(request.bytes, request.detail)).get(request.name);
    if (!bytes || !(bytes.buffer instanceof ArrayBuffer))
      throw new Error("Conteúdo do arquivo de revisão indisponível.");
    self.postMessage({ ok: true, bytes }, { transfer: [bytes.buffer] });
  } catch (failure) {
    self.postMessage({
      ok: false,
      error: failure instanceof Error ? failure.message : "Falha na prévia do arquivo do lote.",
    });
  }
};
