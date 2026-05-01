export const MAX_ATTEMPTS = 8;

const JITTER_RATIO = 0.15;

/**
 * Polynomial backoff compatible with Akita's pattern: attempt^4 + 2 seconds
 * with jitter ±15% to avoid thundering herd.
 *
 * Sample (no jitter): 3, 18, 83, 258, 627, 1298, 2403, 4098 seconds.
 */
export function nextAttemptDelaySeconds(attempt: number, rng: () => number = Math.random): number {
  if (attempt < 1) {
    throw new Error("nextAttemptDelaySeconds: attempt must be >= 1");
  }
  const base = attempt ** 4 + 2;
  const jitter = base * JITTER_RATIO * (rng() * 2 - 1);
  return Math.max(1, Math.floor(base + jitter));
}

export type SendgridErrorClassification = "permanent" | "transient";

export type SendgridErrorLike = {
  code?: number;
  response?: {
    statusCode?: number;
    body?: unknown;
  };
  message?: string;
};

/**
 * Classify a SendGrid error as permanent (do NOT retry, mark failed)
 * or transient (retry with backoff).
 *
 * Permanent: 400 with rejected-message errors, 401, 403, 413.
 * Transient: 408, 425, 429, 5xx, network timeouts.
 * Default: transient (safer to retry than to lose silently).
 */
export function classifySendgridError(error: SendgridErrorLike): SendgridErrorClassification {
  const status = error.response?.statusCode ?? error.code;

  if (status == null) {
    return "transient";
  }

  if (status === 401 || status === 403 || status === 413) {
    return "permanent";
  }

  if (status === 400) {
    return "permanent";
  }

  if (status === 408 || status === 425 || status === 429) {
    return "transient";
  }

  if (status >= 500 && status < 600) {
    return "transient";
  }

  return "transient";
}
