import "server-only";
import { readAccountEnvironment } from "./environment";

let cached: ReturnType<typeof readAccountEnvironment> | undefined;
export function getEnv() {
  cached ??= readAccountEnvironment(process.env);
  return cached;
}
