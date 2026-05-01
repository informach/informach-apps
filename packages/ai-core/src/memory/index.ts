import type { AppName } from "../types";

export type AppMemoryConfig = {
  app: AppName;
  namespace: string;
  ttlSeconds?: number;
};

export function createAppMemoryConfig(app: AppName, namespace: string): AppMemoryConfig {
  return { app, namespace };
}
