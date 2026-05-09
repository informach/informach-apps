import "server-only";

export function contentLengthExceeds(request: Pick<Request, "headers">, maxBytes: number): boolean {
  const rawLength = request.headers.get("content-length");
  if (!rawLength) return false;

  const length = Number(rawLength);
  return Number.isFinite(length) && length > maxBytes;
}
