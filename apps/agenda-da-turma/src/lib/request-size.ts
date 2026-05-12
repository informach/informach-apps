import "server-only";

/**
 * Short-circuit por Content-Length antes de ler o corpo. Defesa em camada
 * para route handlers que aceitam blobs grandes (áudio, imagem). O parser
 * subsequente (`request.formData()`, `request.json()`) tem seu próprio
 * limite no Node — este helper bloqueia antes pra economizar memória.
 */
export function contentLengthExceeds(request: Pick<Request, "headers">, maxBytes: number): boolean {
  const rawLength = request.headers.get("content-length");
  if (!rawLength) return false;

  const length = Number(rawLength);
  return Number.isFinite(length) && length > maxBytes;
}
