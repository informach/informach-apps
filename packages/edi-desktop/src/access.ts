import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";

let current: { token: string; assertAccess: () => void } | undefined;
export function configureDesktopAccess(config: { token: string; assertAccess: () => void }) {
  current = config;
}
export function assertDesktopAccess() {
  if (!current) throw new Error("Desktop licensing is not initialized");
  current.assertAccess();
}
export function localMcpHeaders(): { Authorization: string } {
  if (!current) throw new Error("Local MCP credentials are not initialized");
  return { Authorization: `Bearer ${current.token}` };
}
export function authorizeLocalMcp(request: IncomingMessage): boolean {
  if (!current || typeof request.headers.authorization !== "string") return false;
  const actual = Buffer.from(request.headers.authorization);
  const expected = Buffer.from(`Bearer ${current.token}`);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return false;
  try {
    current.assertAccess();
    return true;
  } catch {
    return false;
  }
}
export function redactMcpCredentials(text: string): string {
  return current ? text.replaceAll(current.token, "[redacted]") : text;
}
