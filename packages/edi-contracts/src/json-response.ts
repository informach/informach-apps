/** Malformed provider data is not a transient network failure. */
export class InvalidJsonResponseError extends Error {
  override name = "InvalidJsonResponseError";
}

/** Read a bounded UTF-8 protocol payload before a domain schema validates it. */
export async function readBoundedJson(response: Response, limit: number): Promise<unknown> {
  if (!Number.isSafeInteger(limit) || limit <= 0)
    throw new RangeError("Invalid JSON response limit");
  if (!response.body) throw new InvalidJsonResponseError("Missing JSON response body");
  const declared = Number(response.headers.get("content-length"));
  if (declared > limit) {
    const error = new InvalidJsonResponseError("Oversized JSON response");
    try {
      await response.body.cancel();
    } catch (cleanup) {
      throw new AggregateError([error, cleanup], "Oversized response cancellation failed");
    }
    throw error;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) throw new InvalidJsonResponseError("Oversized JSON response");
      chunks.push(chunk.value);
    }
  } catch (error) {
    try {
      await reader.cancel();
    } catch (cleanup) {
      // An errored stream rejects cancel with its original error. Preserve that
      // error's identity; distinct cleanup failures retain both causes.
      if (cleanup !== error)
        throw new AggregateError([error, cleanup], "JSON response cancellation failed");
    }
    throw error;
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (cause) {
    if (!(cause instanceof SyntaxError || cause instanceof TypeError)) throw cause;
    throw new InvalidJsonResponseError("Invalid UTF-8 JSON response", { cause });
  }
}
