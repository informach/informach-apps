import { timingSafeEqual } from "node:crypto";

/** Status only; never return the configured or supplied credential. */
export function cronAuthorizationStatus(request: Request, secret: string | undefined) {
  if (!secret) return 503;
  const received = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return received.length === expected.length && timingSafeEqual(received, expected) ? 200 : 401;
}
