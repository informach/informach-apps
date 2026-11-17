export class PayloadTooLargeError extends Error {
  constructor(options?: ErrorOptions) {
    super("payload_too_large", options);
    this.name = "PayloadTooLargeError";
  }
}
export class InvalidRequestBodyError extends Error {
  constructor(options?: ErrorOptions) {
    super("invalid_request_body", options);
    this.name = "InvalidRequestBodyError";
  }
}
/** Bound streaming input before allocating the full request, including chunked bodies. */
export async function readRequestBody(request: Request, maximumBytes: number): Promise<string> {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0)
    throw new RangeError("Invalid request body limit");
  const declared = request.headers.get("Content-Length");
  const excessive = declared && (!/^\d+$/.test(declared) || Number(declared) > maximumBytes);
  if (!request.body) {
    if (excessive) throw new PayloadTooLargeError();
    return "";
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    if (excessive) throw new PayloadTooLargeError();
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > maximumBytes) throw new PayloadTooLargeError();
      chunks.push(result.value);
    }
  } catch (error) {
    try {
      await reader.cancel(error);
    } catch (cleanup) {
      if (cleanup !== error) {
        const cause = new AggregateError([error, cleanup], "Request cancellation failed");
        if (error instanceof PayloadTooLargeError) throw new PayloadTooLargeError({ cause });
        throw cause;
      }
    }
    throw error;
  } finally {
    reader.releaseLock();
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, size));
  } catch (cause) {
    if (!(cause instanceof TypeError)) throw cause;
    throw new InvalidRequestBodyError({ cause });
  }
}
