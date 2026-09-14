import { timingSafeEqual } from "node:crypto";
import { env } from "./env";

export function authorizedJob(request: Request) {
  const supplied = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${env.CRON_SECRET}`);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}
export async function boundedBody(request: Request, limit = 1_048_576): Promise<string | null> {
  if (Number(request.headers.get("content-length")) > limit) return null;
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        return null;
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf8");
}
