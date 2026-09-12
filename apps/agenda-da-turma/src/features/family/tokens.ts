import "server-only";
import { createHash } from "node:crypto";
export function hashFamilyToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
