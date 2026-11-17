import type { AuthSecurityEvent } from "./observability";

/** Provider messages can embed state, tokens, callback URLs or account details. */
export function webAuthLogger(
  app: string,
  onEvent?: (event: AuthSecurityEvent) => void | Promise<void>,
) {
  return {
    level: "warn" as const,
    log(level: string, ..._details: unknown[]) {
      if (level !== "warn" && level !== "error") return;
      const event: AuthSecurityEvent = { type: "auth_provider_log", metadata: { app, level } };
      const fallback = () =>
        console[level](JSON.stringify({ operation: "auth.provider_log", app, level }));
      if (onEvent) {
        try {
          void Promise.resolve(onEvent(event)).catch(fallback);
          return;
        } catch {
          /* Preserve the operational signal without serializing the failed hook. */
        }
      }
      fallback();
    },
  };
}
