export type RetryOptions = {
  /** Total de tentativas (incluindo a primeira). Default 3. */
  maxAttempts?: number;
  /** Backoff base em ms. Default 250. */
  baseDelayMs?: number;
  /** Multiplicador exponencial entre tentativas. Default 2. */
  factor?: number;
  /** Teto absoluto do delay em ms. Default 5_000. */
  maxDelayMs?: number;
  /** Adiciona ±15% de jitter ao delay. Default true. */
  jitter?: boolean;
  /**
   * Decide se um erro deve ser retentado. Recebe o erro e o número da próxima
   * tentativa (1-indexed). Default: retenta status HTTP 429/500/502/503/504,
   * timeouts (`ETIMEDOUT`, `ECONNRESET`) e `AbortError` causado por timeout
   * upstream — não retenta `RecipeNotFoundError` nem `CreditValidationError`
   * (essas são exceções negativas legítimas, não falhas transitórias).
   */
  isRetryable?: (err: unknown, nextAttempt: number) => boolean;
  /** Hook chamado antes de dormir entre tentativas. Útil para logging. */
  onRetry?: (info: { attempt: number; nextDelayMs: number; error: unknown }) => void;
  /** Sleep injetável (default `setTimeout`). Permite testes determinísticos. */
  sleep?: (ms: number) => Promise<void>;
};

const DEFAULT_RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const DEFAULT_RETRYABLE_CODES = new Set(["ETIMEDOUT", "ECONNRESET", "EAI_AGAIN", "ENOTFOUND"]);

function defaultIsRetryable(err: unknown): boolean {
  if (err == null) return false;
  if (typeof err !== "object") return false;
  const e = err as { name?: unknown; status?: unknown; statusCode?: unknown; code?: unknown };
  if (e.name === "AbortError") return true;
  const status =
    typeof e.status === "number"
      ? e.status
      : typeof e.statusCode === "number"
        ? e.statusCode
        : undefined;
  if (status !== undefined && DEFAULT_RETRYABLE_STATUS.has(status)) return true;
  if (typeof e.code === "string" && DEFAULT_RETRYABLE_CODES.has(e.code)) return true;
  return false;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Executa `fn` com retry exponencial em falhas transitórias. Retorna o valor
 * de sucesso de `fn` ou re-throw o último erro depois de esgotadas as
 * tentativas. Erros não-retentáveis (ver `isRetryable`) propagam imediatamente
 * sem consumir tentativas adicionais.
 *
 * Não use isto em volta de `withCredits` do billing — queremos retentar a
 * chamada paga DENTRO da reserva, não recriar uma reserva nova a cada falha.
 * O wrap correto é em volta de `agent.generate`/`generateText`/`transcribeAudio`.
 */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 250;
  const factor = opts.factor ?? 2;
  const maxDelayMs = opts.maxDelayMs ?? 5_000;
  const jitter = opts.jitter ?? true;
  const isRetryable = opts.isRetryable ?? defaultIsRetryable;
  const sleep = opts.sleep ?? defaultSleep;

  let attempt = 1;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      const isLast = attempt >= maxAttempts;
      if (isLast || !isRetryable(err, attempt + 1)) {
        throw err;
      }
      const exp = baseDelayMs * factor ** (attempt - 1);
      const capped = Math.min(exp, maxDelayMs);
      const jittered = jitter ? capped * (0.85 + Math.random() * 0.3) : capped;
      const nextDelayMs = Math.round(jittered);
      opts.onRetry?.({ attempt, nextDelayMs, error: err });
      await sleep(nextDelayMs);
      attempt++;
    }
  }
}
