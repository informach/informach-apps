import "server-only";

export class RequestBodyTooLargeError extends Error {
  constructor(readonly maxBytes: number) {
    super(`Request body exceeds ${maxBytes} bytes`);
    this.name = "RequestBodyTooLargeError";
  }
}

export class MalformedRequestBodyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MalformedRequestBodyError";
  }
}

export async function readRequestBodyWithSizeLimit(
  request: Pick<Request, "body" | "headers">,
  maxBytes: number,
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new Error("maxBytes must be a non-negative safe integer");
  }

  const rawLength = request.headers.get("content-length");
  if (rawLength) {
    const length = Number(rawLength);
    if (!Number.isFinite(length) || length < 0) {
      throw new MalformedRequestBodyError("Invalid Content-Length header");
    }
    if (length > maxBytes) {
      throw new RequestBodyTooLargeError(maxBytes);
    }
  }

  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new RequestBodyTooLargeError(maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return body;
}

export async function readJsonWithSizeLimit(request: Request, maxBytes: number): Promise<unknown> {
  const body = await readRequestBodyWithSizeLimit(request, maxBytes);
  return JSON.parse(new TextDecoder().decode(body));
}

export async function readFormDataWithSizeLimit(
  request: Request,
  maxBytes: number,
): Promise<FormData> {
  const body = await readRequestBodyWithSizeLimit(request, maxBytes);
  const headers = new Headers(request.headers);
  headers.delete("content-length");

  return new Request(request.url, {
    body: toArrayBuffer(body),
    headers,
    method: request.method,
  }).formData();
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}
