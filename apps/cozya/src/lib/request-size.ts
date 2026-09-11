import "server-only";

export function contentLengthExceeds(request: Pick<Request, "headers">, maxBytes: number): boolean {
  const rawLength = request.headers.get("content-length");
  if (!rawLength) return false;

  const length = Number(rawLength);
  return Number.isFinite(length) && length > maxBytes;
}

export class RequestTooLargeError extends Error {
  constructor() {
    super("Request exceeds byte limit");
    this.name = "RequestTooLargeError";
  }
}

/** Enforces bytes while streaming, including chunked requests and missing/false Content-Length. */
export async function readLimitedBody(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array<ArrayBuffer>> {
  if (contentLengthExceeds(request, maxBytes)) throw new RequestTooLargeError();
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      length += next.value.byteLength;
      if (length > maxBytes) {
        await reader.cancel();
        throw new RequestTooLargeError();
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function readLimitedJson(request: Request, maxBytes = 40000): Promise<unknown> {
  return JSON.parse(new TextDecoder().decode(await readLimitedBody(request, maxBytes)));
}

export async function readLimitedFormData(request: Request, maxBytes: number): Promise<FormData> {
  const body = await readLimitedBody(request, maxBytes);
  return new Response(body, {
    headers: { "Content-Type": request.headers.get("content-type") ?? "" },
  }).formData();
}
