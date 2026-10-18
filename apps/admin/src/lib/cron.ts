import "server-only";
import { timingSafeEqual } from "node:crypto";
import { getEnv } from "./env";

/** As rotinas agendadas chamam com `Authorization: Bearer $CRON_SECRET`. */
export function isAuthorizedCron(request: Request): boolean {
  const received = Buffer.from(request.headers.get("Authorization") ?? "");
  const expected = Buffer.from(`Bearer ${getEnv().CRON_SECRET}`);
  return received.length === expected.length && timingSafeEqual(received, expected);
}
