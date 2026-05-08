import { describe, expect, it, vi } from "vitest";

import { withRetry } from "../retry";

const noSleep = () => Promise.resolve();

describe("withRetry", () => {
  it("retorna o valor da primeira tentativa em sucesso imediato", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, { sleep: noSleep });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retenta até maxAttempts e devolve o sucesso final", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls < 3) {
        const err: Error & { status?: number } = new Error("rate limited");
        err.status = 429;
        throw err;
      }
      return "ok";
    });
    const onRetry = vi.fn();
    const result = await withRetry(fn, { maxAttempts: 3, sleep: noSleep, onRetry });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it("não retenta erro não-retentável (status 400)", async () => {
    const err: Error & { status?: number } = new Error("bad request");
    err.status = 400;
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withRetry(fn, { sleep: noSleep })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retenta timeouts (ETIMEDOUT/ECONNRESET) e AbortError", async () => {
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls === 1) {
        const e: Error & { code?: string } = new Error("timed out");
        e.code = "ETIMEDOUT";
        throw e;
      }
      if (calls === 2) {
        const e = new Error("aborted");
        e.name = "AbortError";
        throw e;
      }
      return "ok";
    });
    const result = await withRetry(fn, { maxAttempts: 3, sleep: noSleep });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("propaga o último erro quando todas as tentativas falham", async () => {
    const err: Error & { status?: number } = new Error("503");
    err.status = 503;
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withRetry(fn, { maxAttempts: 2, sleep: noSleep })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("respeita isRetryable customizado", async () => {
    const err = new Error("custom-retry");
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls < 2) throw err;
      return "ok";
    });
    const isRetryable = vi.fn(() => true);
    const result = await withRetry(fn, { sleep: noSleep, isRetryable, maxAttempts: 2 });
    expect(result).toBe("ok");
    expect(isRetryable).toHaveBeenCalledTimes(1);
  });

  it("usa sleep injetado para delays determinísticos", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls < 2) {
        const e: Error & { status?: number } = new Error("503");
        e.status = 503;
        throw e;
      }
      return "ok";
    });
    await withRetry(fn, { maxAttempts: 2, sleep, jitter: false, baseDelayMs: 100, factor: 2 });
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(100);
  });

  it("aplica backoff exponencial sem ultrapassar maxDelayMs", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const err: Error & { status?: number } = new Error("503");
    err.status = 503;
    const fn = vi.fn().mockRejectedValue(err);
    await expect(
      withRetry(fn, {
        maxAttempts: 4,
        sleep,
        jitter: false,
        baseDelayMs: 1000,
        factor: 10,
        maxDelayMs: 3000,
      }),
    ).rejects.toBe(err);
    expect(sleep).toHaveBeenNthCalledWith(1, 1000);
    expect(sleep).toHaveBeenNthCalledWith(2, 3000);
    expect(sleep).toHaveBeenNthCalledWith(3, 3000);
  });
});
