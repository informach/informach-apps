import "server-only";
import { redis } from "@/lib/redis";
import { databaseReady } from "./repository";

export async function checkReadiness() {
  const [, cache] = await Promise.all([databaseReady(), redis?.ping()]);
  if (cache !== "PONG") throw new Error("Dependency unavailable");
}
